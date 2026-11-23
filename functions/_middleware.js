// Gate for the whole site: without a verified-email session nobody gets the app (HTML, scripts or data).
// Only the sign-in page, the /api/auth endpoints and the brand images it shows are public.
import { readSession, json } from "../lib/auth.js";
import { loginPage, setupPage } from "../lib/login-page.js";

const PUBLIC = [/^\/api\/auth\//, /^\/assets\/(cover|me|apple-touch-icon)\.(jpg|png)$/, /^\/(logo|icon)\.svg$/, /^\/favicon\.ico$/, /^\/manifest\.webmanifest$/];

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
    const res = await context.next();
    // Signed-in pages must never be cached by a shared cache.
    const out = new Response(res.body, res);
    if ((out.headers.get("content-type") || "").includes("text/html")) out.headers.set("cache-control", "private, no-store");
    return out;
  }
  if (url.pathname.startsWith("/api/")) return json({ error: "signed_out" }, 401);
  return new Response(loginPage(), { status: 401, headers: html });
}
