import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PAYPAL_CLIENT_ID     = Deno.env.get("PAYPAL_CLIENT_ID")!;
const PAYPAL_SECRET        = Deno.env.get("PAYPAL_SECRET")!;
const PAYPAL_ENV           = Deno.env.get("PAYPAL_ENV") ?? "sandbox";
const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const PAYPAL_BASE = PAYPAL_ENV === "live"
  ? "https://api-m.paypal.com"
  : "https://api-m.sandbox.paypal.com";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function getPayPalToken(): Promise<string> {
  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`)}`,
      "Content-Type":  "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data = await res.json();
  console.log("PayPal token response:", JSON.stringify(data));
  if (!data.access_token) throw new Error(`PayPal auth failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json();
    console.log("Request body:", JSON.stringify(body));

    const { orderId, userId, expectedAmount, skipCredits } = body;

    if (!orderId || !userId || !expectedAmount) {
      return json({ error: "Missing required fields: orderId, userId, expectedAmount" }, 400);
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
    console.log("PayPal capture response:", JSON.stringify(capture));

    if (capture.status !== "COMPLETED") {
      return json({ error: "Payment not completed", details: capture }, 400);
    }

    // 3. Verify amount
    const capturedAmount = parseFloat(
      capture.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value ?? "0"
    );
    console.log(`Captured: ${capturedAmount}, Expected: ${expectedAmount}`);

    if (Math.abs(capturedAmount - expectedAmount) > 0.01) {
      return json({ error: `Amount mismatch: captured ${capturedAmount}, expected ${expectedAmount}` }, 400);
    }

    // 4. skipCredits = group order payments (just confirm, don't add to wallet)
    if (skipCredits) {
      return json({ success: true, capturedAmount });
    }

    // 5. Add credits to user
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Get current balance
    const { data: cur, error: fetchErr } = await db
      .from("user_credits")
      .select("balance")
      .eq("user_id", userId)
      .maybeSingle();

    if (fetchErr) {
      console.error("Fetch credits error:", JSON.stringify(fetchErr));
      return json({ error: `Failed to fetch balance: ${fetchErr.message}` }, 500);
    }

    const newBal = +((cur?.balance ?? 0) + capturedAmount).toFixed(2);
    console.log(`Old balance: ${cur?.balance ?? 0}, New balance: ${newBal}`);

    // Upsert new balance
    const { error: upsertErr } = await db.from("user_credits").upsert({
      user_id:    userId,
      balance:    newBal,
      updated_at: new Date().toISOString(),
    });

    if (upsertErr) {
      console.error("Upsert credits error:", JSON.stringify(upsertErr));
      return json({ error: `Failed to update balance: ${upsertErr.message}` }, 500);
    }

    // Record top-up log (non-fatal — table may not exist yet)
    const { error: logErr } = await db.from("credit_topups").insert({
      user_id:         userId,
      amount:          capturedAmount,
      method:          "paypal",
      paypal_order_id: orderId,
    });
    if (logErr) console.warn("credit_topups insert failed (non-fatal):", JSON.stringify(logErr));

    console.log("Success! New balance:", newBal);
    return json({ success: true, newBalance: newBal });

  } catch (err) {
    console.error("Unhandled error:", err);
    return json({ error: String(err) }, 500);
  }
});
