import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
});

const WEBHOOK_SECRET     = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const SUPABASE_URL       = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SKEY      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function placeGroupOrderIfReady(db: any, groupOrderId: string) {
  const { data: members } = await db.from("group_order_members").select("*").eq("group_order_id", groupOrderId);
  if (!members?.every((m: { payment_status: string }) => m.payment_status === "paid")) return;

  const { data: items } = await db.from("group_order_items").select("*").eq("group_order_id", groupOrderId);
  const { data: groupOrder } = await db.from("group_orders").select("*").eq("id", groupOrderId).maybeSingle();
  if (!items || !groupOrder || groupOrder.status !== "awaiting_payment") return;

  const total = items.reduce((s: number, i: { price: number; qty: number }) => s + i.price * i.qty, 0);
  await db.from("orders").insert({
    user_id:        groupOrder.host_user_id,
    table_number:   groupOrder.table_number,
    items:          items.map((i: { item_id: string; item_name: string; price: number; qty: number }) => ({
      id: i.item_id, name: i.item_name, price: i.price, qty: i.qty,
    })),
    total:          +total.toFixed(2),
    payment_method: groupOrder.payment_mode === "host" ? "group_host" : "group_individual",
    status:         "pending",
  });
  await db.from("group_orders").update({ status: "placed" }).eq("id", groupOrderId);
  console.log(`Group order ${groupOrderId} placed`);
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

  if (event.type !== "checkout.session.completed") {
    return json({ received: true });
  }

  const session  = event.data.object as Stripe.Checkout.Session;
  const meta     = session.metadata ?? {};
  const { type, userId, orderId, amount, total } = meta;

  const db = createClient(SUPABASE_URL, SUPABASE_SKEY);

  try {
    if (type === "topup") {
      // ── Add credits to user ──
      const topupAmt = parseFloat(amount ?? "0");
      if (!userId || topupAmt <= 0) throw new Error("Invalid topup metadata");

      const { data: cur } = await db
        .from("user_credits")
        .select("balance")
        .eq("user_id", userId)
        .maybeSingle();

      const newBal = +((cur?.balance ?? 0) + topupAmt).toFixed(2);

      await db.from("user_credits").upsert({
        user_id:    userId,
        balance:    newBal,
        updated_at: new Date().toISOString(),
      });

      await db.from("credit_topups").insert({
        user_id:           userId,
        amount:            topupAmt,
        method:            "stripe",
        stripe_session_id: session.id,
      });

      console.log(`Topup: user ${userId} +$${topupAmt} → balance $${newBal}`);

    } else if (type === "order") {
      // ── Mark order as paid via card ──
      if (!orderId) throw new Error("Missing orderId in metadata");

      await db.from("orders")
        .update({
          payment_method:    "card",
          stripe_session_id: session.id,
          status:            "pending",
        })
        .eq("id", orderId);

      console.log(`Order ${orderId} marked as card-paid`);

    } else if (type === "group_host_payment") {
      // ── Group order: host pays full bill via card ──
      const groupOrderId = meta.groupOrderId;
      if (!groupOrderId || !userId) throw new Error("Missing groupOrderId or userId in metadata");

      // Mark all members as paid
      await db.from("group_order_members")
        .update({ payment_status: "paid" })
        .eq("group_order_id", groupOrderId);

      await placeGroupOrderIfReady(db, groupOrderId);
      console.log(`Group order ${groupOrderId} host paid via card`);

    } else if (type === "group_individual_payment") {
      // ── Group order: member pays their share via card ──
      const groupOrderId = meta.groupOrderId;
      if (!groupOrderId || !userId) throw new Error("Missing groupOrderId or userId in metadata");

      // Mark this user + anyone assigned to them as paid
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
      console.log(`Group order ${groupOrderId} member ${userId} paid via card`);
    }

    return json({ received: true });

  } catch (err) {
    console.error("Webhook handler error:", err);
    return json({ error: err.message }, 500);
  }
});
