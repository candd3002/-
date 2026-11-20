// Cloudflare Pages Function: /api/notify
// Sends one alert to a Telegram chat. The bot token and chat id are secrets (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID).
// The site itself is protected by Cloudflare Access, so only invited people can reach this endpoint.
const HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

export async function onRequest(context) {
  if (context.request.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: HEADERS });
  const env = context.env;
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return new Response(JSON.stringify({ error: "Telegram is not configured" }), { status: 503, headers: HEADERS });
  let body;
  try { body = await context.request.json(); } catch (e) { return new Response(JSON.stringify({ error: "bad json" }), { status: 400, headers: HEADERS }); }
  const text = String((body && body.text) || "").slice(0, 500);
  if (!text) return new Response(JSON.stringify({ error: "empty" }), { status: 400, headers: HEADERS });
  const r = await fetch("https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/sendMessage", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: text, disable_web_page_preview: true })
  });
  return new Response(JSON.stringify({ ok: r.ok }), { status: r.ok ? 200 : 502, headers: HEADERS });
}
