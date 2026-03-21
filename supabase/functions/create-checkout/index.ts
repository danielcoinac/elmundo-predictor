import Stripe from "https://esm.sh/stripe@14.21.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json();
    const { type, amount, userId, userEmail, orderId, items, total, successUrl, cancelUrl } = body;

    if (type === "topup") {
      // ── TOP UP ──
      if (!amount || !userId) return json({ error: "Missing amount or userId" }, 400);

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: {
              name: "El Mundo Credits",
              description: `Add $${Number(amount).toFixed(2)} credits to your account`,
            },
            unit_amount: Math.round(Number(amount) * 100),
          },
          quantity: 1,
        }],
        mode: "payment",
        success_url: `${successUrl}?stripe=topup_success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${cancelUrl}?stripe=cancelled`,
        customer_email: userEmail,
        metadata: { type: "topup", userId, amount: String(amount) },
      });

      return json({ url: session.url });

    } else if (type === "order") {
      // ── ORDER PAYMENT ──
      if (!orderId || !userId || !items || !total) return json({ error: "Missing order fields" }, 400);

      const lineItems = items.map((item: { name: string; qty: number; price: number }) => ({
        price_data: {
          currency: "usd",
          product_data: { name: item.name },
          unit_amount: Math.round(item.price * 100),
        },
        quantity: item.qty,
      }));

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: lineItems,
        mode: "payment",
        success_url: `${successUrl}?stripe=order_success&session_id={CHECKOUT_SESSION_ID}&order_id=${orderId}`,
        cancel_url: `${cancelUrl}?stripe=cancelled`,
        customer_email: userEmail,
        metadata: { type: "order", userId, orderId, total: String(total) },
      });

      return json({ url: session.url });

    } else {
      return json({ error: "Invalid type — must be 'topup' or 'order'" }, 400);
    }

  } catch (err) {
    console.error("create-checkout error:", err);
    return json({ error: err.message }, 400);
  }
});
