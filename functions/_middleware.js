// Gate for the whole site: without a verified-email session nobody gets the app (HTML, scripts or data).
// Only the sign-in page, the /api/auth endpoints and the brand images it shows are public.
import { readSession, json } from "../lib/auth.js";
import { loginPage, setupPage } from "../lib/login-page.js";
import { getJSON } from "../lib/app-store.js";

const PUBLIC = [/^\/api\/auth\//, /^\/assets\/(cover|me|apple-touch-icon)\.(jpg|png)$/, /^\/(logo|icon)\.svg$/, /^\/favicon\.ico$/, /^\/manifest\.webmanifest$/];

// The maintenance flag is read from KV at most every 30 s per worker instance.
let CFG = null, CFG_AT = 0;
async function cfgCached(env) {
  if (!env.AUTH_KV) return {};
  if (!CFG || Date.now() - CFG_AT > 30000) { CFG = await getJSON(env, "cfg", {}); CFG_AT = Date.now(); }
  return CFG;
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  if (PUBLIC.some(re => re.test(url.pathname))) return context.next();
  const html = { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-frame-options": "DENY", "referrer-policy": "same-origin" };
  if (!env.AUTH_SECRET) {
    if (url.pathname.startsWith("/api/")) return json({ error: "setup" }, 503);
    return new Response(setupPage(), { status: 503, headers: html });
  }
  const s = await readSession(request, env);
  if (s) {
    // Maintenance mode (owner panel): everyone except the owner sees the maintenance page.
    if (!s.owner && !url.pathname.startsWith("/api/auth/")) {
      const cfg = await cfgCached(env);
      if (cfg.maintenance) {
        if (url.pathname.startsWith("/api/")) return json({ error: "maintenance" }, 503);
        return new Response(maintenancePage(cfg.maintenanceMsg), { status: 503, headers: html });
      }
    }
    const res = await context.next();
    // Signed-in pages must never be cached by a shared cache.
    const out = new Response(res.body, res);
    if ((out.headers.get("content-type") || "").includes("text/html")) out.headers.set("cache-control", "private, no-store");
    return out;
  }
  if (url.pathname.startsWith("/api/")) return json({ error: "signed_out" }, 401);
  return new Response(loginPage(), { status: 401, headers: html });
}

function maintenancePage(msg) {
  const m = String(msg || "نعمل على تحسينات جديدة. نعود قريباً.").replace(/[<>&"]/g, "");
  return '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Baqer Sniper</title>' +
    '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0a0b;color:#f4efe6;font-family:Tahoma,Arial,sans-serif;padding:16px;text-align:center}img{width:96px;height:96px;border-radius:50%;object-fit:cover;border:3px solid #d4af6a}b{color:#d4af6a;letter-spacing:.3em;font-size:13px}p{color:#a39b8d;line-height:1.8}</style></head>' +
    '<body><div><img src="/assets/me.jpg" alt=""><p><b>BAQER SNIPER</b></p><h1>التطبيق قيد التحديث</h1><p>' + m + '</p><p>— محمد باقر</p></div></body></html>';
}
