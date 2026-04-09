import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.7";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 204, headers: CORS_HEADERS });
  }

  try {
    const { title, body, tag, url, user_ids } = JSON.parse(await req.text());
    if (!title || !body) {
      return new Response(JSON.stringify({ error: "title and body required" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:info@elmundobonaire.com";
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Fetch subscriptions
    let query = sb.from("push_subscriptions").select("*");
    if (user_ids && user_ids.length > 0) {
      query = query.in("user_id", user_ids);
    }
    const { data: subs, error } = await query;
    if (error) throw error;
    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const payload = JSON.stringify({ title, body, tag: tag || "el-mundo", url: url || "/" });
    let sent = 0;
    const stale: string[] = [];
    const errors: string[] = [];

    await Promise.allSettled(
      subs.map(async (sub: any) => {
        const pushSub = {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth },
        };
        try {
          await webpush.sendNotification(pushSub, payload);
          sent++;
        } catch (e: any) {
          if (e.statusCode === 404 || e.statusCode === 410) {
            stale.push(sub.id);
          } else {
            errors.push(`${e.statusCode || "err"}: ${String(e.body || e.message).substring(0, 150)}`);
          }
        }
      })
    );

    if (stale.length > 0) {
      await sb.from("push_subscriptions").delete().in("id", stale);
    }

    return new Response(JSON.stringify({ sent, cleaned: stale.length, total: subs.length, errors: errors.length ? errors : undefined }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
