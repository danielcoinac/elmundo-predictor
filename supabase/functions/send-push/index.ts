import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Web Push utilities — pure Deno, no npm needed
async function generatePushHeaders(endpoint: string, vapidPublic: string, vapidPrivate: string, subject: string) {
  // Import VAPID private key
  const rawPrivate = base64UrlDecode(vapidPrivate);
  const rawPublic = base64UrlDecode(vapidPublic);

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    buildPkcs8(rawPrivate, rawPublic),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const audience = new URL(endpoint).origin;
  const expiry = Math.floor(Date.now() / 1000) + 12 * 60 * 60; // 12 hours

  const header = base64UrlEncode(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const payload = base64UrlEncode(JSON.stringify({ aud: audience, exp: expiry, sub: subject }));
  const unsigned = `${header}.${payload}`;

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    new TextEncoder().encode(unsigned)
  );

  const jwt = `${unsigned}.${base64UrlEncode(new Uint8Array(derToRaw(signature)))}`;

  return {
    Authorization: `vapid t=${jwt}, k=${vapidPublic}`,
    TTL: "86400",
    "Content-Type": "application/json",
    Urgency: "high",
  };
}

// Convert DER signature to raw r||s format
function derToRaw(derSig: ArrayBuffer): Uint8Array {
  const sig = new Uint8Array(derSig);
  // DER: 0x30 <len> 0x02 <rlen> <r> 0x02 <slen> <s>
  let offset = 2;
  const rLen = sig[offset + 1];
  const r = sig.slice(offset + 2, offset + 2 + rLen);
  offset = offset + 2 + rLen;
  const sLen = sig[offset + 1];
  const s = sig.slice(offset + 2, offset + 2 + sLen);

  const raw = new Uint8Array(64);
  raw.set(r.length > 32 ? r.slice(r.length - 32) : r, 32 - Math.min(r.length, 32));
  raw.set(s.length > 32 ? s.slice(s.length - 32) : s, 64 - Math.min(s.length, 32));
  return raw;
}

// Build PKCS#8 wrapper around raw EC private key
function buildPkcs8(rawPrivate: Uint8Array, rawPublic: Uint8Array): Uint8Array {
  // EC P-256 PKCS8 DER template
  const prefix = new Uint8Array([
    0x30, 0x81, 0x87, 0x02, 0x01, 0x00, 0x30, 0x13, 0x06, 0x07,
    0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a,
    0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x04, 0x6d, 0x30,
    0x6b, 0x02, 0x01, 0x01, 0x04, 0x20,
  ]);
  const middle = new Uint8Array([0xa1, 0x44, 0x03, 0x42, 0x00]);
  // rawPublic should be 65 bytes (uncompressed point: 0x04 || x || y)
  const pubUncompressed = rawPublic.length === 65 ? rawPublic : prependUncompressed(rawPublic);
  const pkcs8 = new Uint8Array(prefix.length + 32 + middle.length + pubUncompressed.length);
  pkcs8.set(prefix, 0);
  // Ensure private key is exactly 32 bytes
  const privPadded = rawPrivate.length >= 32 ? rawPrivate.slice(rawPrivate.length - 32) : rawPrivate;
  pkcs8.set(privPadded, prefix.length);
  pkcs8.set(middle, prefix.length + 32);
  pkcs8.set(pubUncompressed, prefix.length + 32 + middle.length);
  return pkcs8;
}

function prependUncompressed(key: Uint8Array): Uint8Array {
  if (key[0] === 0x04) return key;
  const out = new Uint8Array(65);
  out[0] = 0x04;
  out.set(key, 1);
  return out;
}

function base64UrlDecode(str: string): Uint8Array {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  return Uint8Array.from([...bin].map((c) => c.charCodeAt(0)));
}

function base64UrlEncode(data: string | Uint8Array): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const b64 = btoa(String.fromCharCode(...bytes));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ══════════════════════════════════════════════════════════════════════════
//  EDGE FUNCTION: send-push
// ══════════════════════════════════════════════════════════════════════════

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 204, headers: CORS_HEADERS });
  }

  try {
    const { title, body, tag, url, user_ids } = await req.json();
    if (!title || !body) return new Response(JSON.stringify({ error: "title and body required" }), { status: 400 });

    const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:info@elmundobonaire.com";
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Fetch subscriptions — either specific users or all
    let query = sb.from("push_subscriptions").select("*");
    if (user_ids && user_ids.length > 0) {
      query = query.in("user_id", user_ids);
    }
    const { data: subs, error } = await query;
    if (error) throw error;
    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }

    const payload = JSON.stringify({ title, body, tag: tag || "el-mundo", url: url || "/" });
    let sent = 0;
    const stale: string[] = [];

    await Promise.allSettled(
      subs.map(async (sub: any) => {
        try {
          const headers = await generatePushHeaders(sub.endpoint, VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT);
          const res = await fetch(sub.endpoint, {
            method: "POST",
            headers,
            body: payload,
          });
          if (res.status === 201 || res.status === 200) {
            sent++;
          } else if (res.status === 404 || res.status === 410) {
            // Subscription expired or unsubscribed — mark for cleanup
            stale.push(sub.id);
          }
        } catch {}
      })
    );

    // Clean up expired subscriptions
    if (stale.length > 0) {
      await sb.from("push_subscriptions").delete().in("id", stale);
    }

    return new Response(JSON.stringify({ sent, cleaned: stale.length }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
