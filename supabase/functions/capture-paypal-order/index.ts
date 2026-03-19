import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PAYPAL_CLIENT_ID      = Deno.env.get("PAYPAL_CLIENT_ID")!;
const PAYPAL_SECRET         = Deno.env.get("PAYPAL_SECRET")!;
const PAYPAL_ENV            = Deno.env.get("PAYPAL_ENV") ?? "sandbox"; // "sandbox" | "live"
const SUPABASE_URL          = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const PAYPAL_BASE = PAYPAL_ENV === "live"
  ? "https://api-m.paypal.com"
  : "https://api-m.sandbox.paypal.com";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getPayPalToken(): Promise<string> {
  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`)}`,
      "Content-Type":  "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const json = await res.json();
  if (!json.access_token) throw new Error("Failed to get PayPal token");
  return json.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { orderId, userId, expectedAmount, skipCredits } = await req.json();

    if (!orderId || !userId || !expectedAmount) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // 1. Get PayPal access token
    const token = await getPayPalToken();

    // 2. Capture the order server-side
    const captureRes = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderId}/capture`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type":  "application/json",
      },
    });
    const capture = await captureRes.json();

    if (capture.status !== "COMPLETED") {
      return new Response(JSON.stringify({ error: "Payment not completed", details: capture }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // 3. Verify amount matches what the frontend claimed
    const capturedAmount = parseFloat(
      capture.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value ?? "0"
    );
    if (Math.abs(capturedAmount - expectedAmount) > 0.01) {
      return new Response(JSON.stringify({ error: "Amount mismatch" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // 4. When skipCredits is true (group orders): just return success without touching credits tables
    if (skipCredits) {
      return new Response(JSON.stringify({ success: true, capturedAmount }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // 5. Add credits to user in Supabase (standard top-up / cart PayPal flow)
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: cur } = await db
      .from("user_credits")
      .select("balance")
      .eq("user_id", userId)
      .maybeSingle();

    const newBal = +((cur?.balance ?? 0) + capturedAmount).toFixed(2);

    await db.from("user_credits").upsert({
      user_id:    userId,
      balance:    newBal,
      updated_at: new Date().toISOString(),
    });

    await db.from("credit_topups").insert({
      user_id:          userId,
      amount:           capturedAmount,
      method:           "paypal",
      paypal_order_id:  orderId,
    });

    return new Response(JSON.stringify({ success: true, newBalance: newBal }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
