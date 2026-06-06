import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
});

const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SKEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function placeGroupOrderIfReady(db: any, groupOrderId: string) {
  // ── Atomic status lock: only one webhook wins this UPDATE ──────────────────
  // PostgreSQL UPDATE is atomic — only the first caller transitions
  // "awaiting_payment" → "placing". All others get 0 rows back and exit.
  const { data: locked } = await db
    .from("group_orders")
    .update({ status: "placing" })
    .eq("id", groupOrderId)
    .eq("status", "awaiting_payment")   // guard: only if still waiting
    .select("id, payment_mode, table_number, host_user_id")
    .maybeSingle();

  if (!locked) {
    // Another webhook already grabbed the lock (or order not in awaiting_payment)
    console.log(`Group order ${groupOrderId}: lock not acquired — skipping`);
    return;
  }

  // Verify every member is paid (re-read inside our lock window)
  const { data: members } = await db
    .from("group_order_members")
    .select("*")
    .eq("group_order_id", groupOrderId);

  if (!members?.every((m: { payment_status: string }) => m.payment_status === "paid")) {
    // Not all paid yet — revert lock so future webhooks can retry
    await db.from("group_orders")
      .update({ status: "awaiting_payment" })
      .eq("id", groupOrderId);
    console.log(`Group order ${groupOrderId}: not all members paid — lock released`);
    return;
  }

  const { data: items } = await db
    .from("group_order_items")
    .select("*")
    .eq("group_order_id", groupOrderId);

  if (!items?.length) {
    await db.from("group_orders").update({ status: "awaiting_payment" }).eq("id", groupOrderId);
    return;
  }

  const total = items.reduce(
    (s: number, i: { price: number; qty: number }) => s + i.price * i.qty, 0
  );

  const { error: orderErr } = await db.from("orders").insert({
    user_id:        locked.host_user_id,
    table_number:   locked.table_number,
    items:          items.map((i: { item_id: string; item_name: string; price: number; qty: number }) => ({
      id: i.item_id, name: i.item_name, price: i.price, qty: i.qty,
    })),
    total:          +total.toFixed(2),
    payment_method: locked.payment_mode === "host" ? "group_host" : "group_individual",
    status:         "pending",
  });

  if (orderErr) {
    console.error(`Group order ${groupOrderId}: order insert failed — reverting lock`, orderErr);
    await db.from("group_orders").update({ status: "awaiting_payment" }).eq("id", groupOrderId);
    return;
  }

  await db.from("group_orders").update({ status: "placed" }).eq("id", groupOrderId);
  console.log(`Group order ${groupOrderId} placed successfully`);
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const sig  = req.headers.get("stripe-signature");
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig!, WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return json({ error: `Webhook Error: ${err.message}` }, 400);
  }

  // ── Handle expired sessions: clean up ghost card_pending orders ────────────
  if (event.type === "checkout.session.expired") {
    const expiredSession = event.data.object as Stripe.Checkout.Session;
    const expMeta = expiredSession.metadata ?? {};
    if (expMeta.userId) {
      const db = createClient(SUPABASE_URL, SUPABASE_SKEY);
      await db.from("orders")
        .delete()
        .eq("user_id", expMeta.userId)
        .eq("payment_method", "card_pending");
      console.log(`Expired session: cleaned ghost orders for user ${expMeta.userId}`);
    }
    return json({ received: true });
  }

  if (event.type !== "checkout.session.completed") {
    return json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const meta    = session.metadata ?? {};
  const { type, userId, orderId, amount } = meta;

  const db = createClient(SUPABASE_URL, SUPABASE_SKEY);

  try {
    if (type === "topup") {
      // ── Add credits to user (server-side amount from Stripe, not client) ──
      const topupAmt = session.amount_total ? session.amount_total / 100 : parseFloat(amount ?? "0");
      if (!userId || topupAmt <= 0) throw new Error("Invalid topup metadata");

      // Use RPC for atomic add (avoids read-then-write race on concurrent topups)
      const { error: rpcErr } = await db.rpc("add_credits", {
        p_user_id: userId,
        p_amount:  topupAmt,
      });

      if (rpcErr) {
        // Fallback: upsert if account doesn't exist yet
        const { data: cur } = await db
          .from("user_credits")
          .select("balance")
          .eq("user_id", userId)
          .maybeSingle();
        const newBal = +((cur?.balance ?? 0) + topupAmt).toFixed(2);
        await db.from("user_credits").upsert({
          user_id: userId, balance: newBal, updated_at: new Date().toISOString(),
        });
      }

      await db.from("credit_topups").insert({
        user_id:           userId,
        amount:            topupAmt,
        method:            "stripe",
        stripe_session_id: session.id,
      });

      console.log(`Topup: user ${userId} +$${topupAmt}`);

    } else if (type === "order") {
      // ── Mark order as paid via card ──
      if (!orderId) throw new Error("Missing orderId in metadata");
      await db.from("orders")
        .update({ payment_method: "card", stripe_session_id: session.id, status: "pending" })
        .eq("id", orderId);
      console.log(`Order ${orderId} marked as card-paid`);

    } else if (type === "group_host_payment") {
      const groupOrderId = meta.groupOrderId;
      if (!groupOrderId || !userId) throw new Error("Missing groupOrderId or userId");

      await db.from("group_order_members")
        .update({ payment_status: "paid" })
        .eq("group_order_id", groupOrderId);

      await placeGroupOrderIfReady(db, groupOrderId);
      console.log(`Group ${groupOrderId}: host paid via card`);

    } else if (type === "group_individual_payment") {
      const groupOrderId = meta.groupOrderId;
      if (!groupOrderId || !userId) throw new Error("Missing groupOrderId or userId");

      const { data: members } = await db.from("group_order_members")
        .select("*").eq("group_order_id", groupOrderId);
      const assignedToMe = (members || [])
        .filter((m: { pay_for_user_id: string }) => m.pay_for_user_id === userId)
        .map((m: { user_id: string }) => m.user_id);

      await db.from("group_order_members")
        .update({ payment_status: "paid" })
        .eq("group_order_id", groupOrderId)
        .in("user_id", [userId, ...assignedToMe]);

      await placeGroupOrderIfReady(db, groupOrderId);
      console.log(`Group ${groupOrderId}: member ${userId} paid via card`);
    }

    return json({ received: true });

  } catch (err) {
    console.error("Webhook handler error:", err);
    return json({ error: err.message }, 500);
  }
});
