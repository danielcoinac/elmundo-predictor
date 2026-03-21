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
          status:            "pending", // bar still needs to confirm
        })
        .eq("id", orderId);

      console.log(`Order ${orderId} marked as card-paid`);
    }

    return json({ received: true });

  } catch (err) {
    console.error("Webhook handler error:", err);
    return json({ error: err.message }, 500);
  }
});
