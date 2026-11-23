// Email verification for Baqer Sniper (Cloudflare Pages Functions, no database needed).
//
// Flow: /api/auth/start emails a 6-digit code and sets a short-lived signed "pending" cookie.
//       /api/auth/verify checks the code against that cookie and sets a signed session cookie.
// Cookies are HttpOnly + Secure + signed with HMAC-SHA256 (secret AUTH_SECRET), so they cannot be
// read by page scripts or forged. The code itself is never stored, only its HMAC.
//
// Environment (Cloudflare Pages > Settings > Variables and Secrets):
//   AUTH_SECRET      required, long random string
//   RESEND_API_KEY   key from resend.com (or BREVO_API_KEY for Brevo)
//   MAIL_FROM        sender, e.g. "Baqer Sniper <login@yourdomain.com>"
//   OWNER_EMAIL      optional, your email (comma-separated list allowed): marked as owner
//   ALLOWED_EMAILS   optional, comma-separated: when set, only these addresses may sign in
//   AUTH_KV          optional KV binding: exact limits on codes sent and wrong attempts

export const SESSION_COOKIE = "bs_s";
export const PENDING_COOKIE = "bs_p";
export const SESSION_DAYS = 30;
export const CODE_MINUTES = 10;
export const MAX_ATTEMPTS = 5;
export const MAX_SENDS_PER_HOUR = 5;

const enc = new TextEncoder();

function b64url(bytes) {
  let s = "";
  const a = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64url(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function sign(secret, obj) {
  const body = b64url(enc.encode(JSON.stringify(obj)));
  return body + "." + (await hmac(secret, body));
}
export async function unsign(secret, token) {
  if (!token || typeof token !== "string" || token.indexOf(".") < 0) return null;
  const [body, mac] = token.split(".");
  if (!safeEqual(mac, await hmac(secret, body))) return null;
  try {
    const obj = JSON.parse(new TextDecoder().decode(unb64url(body)));
    if (!obj || typeof obj.x !== "number" || obj.x < Date.now()) return null;
    return obj;
  } catch (e) { return null; }
}

export function getCookie(request, name) {
  const h = request.headers.get("cookie") || "";
  for (const part of h.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
}
export function cookie(name, value, maxAgeSec) {
  return name + "=" + encodeURIComponent(value) + "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" + Math.max(0, Math.floor(maxAgeSec));
}

export function normEmail(e) { return String(e || "").trim().toLowerCase(); }
export function validEmail(e) { return e.length <= 254 && /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/i.test(e); }
export function cleanName(n) { return String(n || "").replace(/[<>"'`\\]/g, "").replace(/\s+/g, " ").trim().slice(0, 40); }
function listEnv(v) { return String(v || "").split(",").map(normEmail).filter(Boolean); }
export function isOwner(env, email) { return listEnv(env.OWNER_EMAIL).includes(email); }
export function isAllowed(env, email) {
  const allow = listEnv(env.ALLOWED_EMAILS);
  return !allow.length || allow.includes(email) || isOwner(env, email);
}

export async function readSession(request, env) {
  if (!env.AUTH_SECRET) return null;
  const s = await unsign(env.AUTH_SECRET, getCookie(request, SESSION_COOKIE));
  if (!s || s.k !== "s" || !s.e) return null;
  // Access can be withdrawn at any time by editing ALLOWED_EMAILS.
  if (!isAllowed(env, s.e)) return null;
  return { email: s.e, name: s.n || "", owner: isOwner(env, s.e) };
}

export function randomCode() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(a[0] % 1000000).padStart(6, "0");
}
export async function codeMac(secret, email, code, exp, nonce) {
  return hmac(secret, "code|" + email + "|" + code + "|" + exp + "|" + nonce);
}
export function nonce() { const a = new Uint8Array(12); crypto.getRandomValues(a); return b64url(a); }

// ---------- counters: KV when bound, otherwise the edge cache (per data centre, best effort) ----------
export async function peek(env, key) {
  if (env.AUTH_KV) return parseInt(await env.AUTH_KV.get(key), 10) || 0;
  try {
    const hit = await caches.default.match(new Request("https://auth-counter.local/" + encodeURIComponent(key)));
    return hit ? parseInt(await hit.text(), 10) || 0 : 0;
  } catch (e) { return 0; }
}
export async function bump(env, key, ttlSec) {
  if (env.AUTH_KV) {
    const n = (parseInt(await env.AUTH_KV.get(key), 10) || 0) + 1;
    await env.AUTH_KV.put(key, String(n), { expirationTtl: Math.max(60, ttlSec) });
    return n;
  }
  try {
    const cache = caches.default, req = new Request("https://auth-counter.local/" + encodeURIComponent(key));
    const hit = await cache.match(req);
    const n = (hit ? parseInt(await hit.text(), 10) || 0 : 0) + 1;
    await cache.put(req, new Response(String(n), { headers: { "cache-control": "max-age=" + ttlSec } }));
    return n;
  } catch (e) { return 1; }
}

// ---------- email ----------
export async function sendCodeEmail(env, to, name, code) {
  const subject = "رمز الدخول إلى Baqer Sniper: " + code;
  const text = "مرحبا " + (name || "") + "\n\nرمز الدخول: " + code + "\nصالح لمدة " + CODE_MINUTES + " دقائق.\n\n" +
    "Your Baqer Sniper sign-in code: " + code + " (valid " + CODE_MINUTES + " minutes).\n\nإذا لم تطلب هذا الرمز تجاهل الرسالة / If you did not ask for it, ignore this email.";
  const html = '<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;background:#0a0a0b;color:#f4efe6;padding:28px;text-align:center">' +
    '<div style="font-size:13px;letter-spacing:3px;color:#d4af6a">BAQER SNIPER</div>' +
    '<p style="font-size:16px">مرحبا ' + cleanName(name) + '</p><p style="color:#a39b8d">رمز الدخول إلى التطبيق</p>' +
    '<div style="font:700 34px monospace;letter-spacing:10px;color:#f6dc9c;margin:14px 0">' + code + '</div>' +
    '<p style="color:#a39b8d;font-size:12px">صالح لمدة ' + CODE_MINUTES + ' دقائق · Valid for ' + CODE_MINUTES + ' minutes</p>' +
    '<p style="color:#6d665b;font-size:11px">إذا لم تطلب هذا الرمز تجاهل الرسالة.</p></div>';
  const from = env.MAIL_FROM || "Baqer Sniper <onboarding@resend.dev>";
  if (env.RESEND_API_KEY) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: "Bearer " + env.RESEND_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text, html })
    });
    if (!r.ok) throw mailError("resend", r.status, await r.text());
    return;
  }
  if (env.BREVO_API_KEY) {
    const m = /^(.*)<(.+)>$/.exec(from), sender = m ? { name: m[1].trim(), email: m[2].trim() } : { name: "Baqer Sniper", email: from };
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": env.BREVO_API_KEY, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ sender, to: [{ email: to }], subject, textContent: text, htmlContent: html })
    });
    if (!r.ok) throw mailError("brevo", r.status, await r.text());
    return;
  }
  const e = new Error("no email provider configured (BREVO_API_KEY or RESEND_API_KEY)");
  e.reason = "mail_not_configured";
  throw e;
}
// Maps a provider refusal to a short reason the sign-in page can show (no secrets, no raw provider text).
function mailError(provider, status, text) {
  const t = String(text || "").toLowerCase();
  let reason = "mail_failed";
  if (status === 401 && /ip/.test(t)) reason = "mail_ip";
  else if (status === 401) reason = "mail_key";
  else if (status === 403 || /not (yet )?activated|suspend|review/.test(t)) reason = "mail_account";
  else if (status === 400 && /sender|from/.test(t)) reason = "mail_sender";
  else if (status === 429) reason = "mail_quota";
  const e = new Error(provider + " " + status + " " + String(text || "").slice(0, 300));
  e.reason = reason;
  return e;
}

export const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
export function json(obj, status, extraHeaders) {
  const h = new Headers(JSON_HEADERS);
  (extraHeaders || []).forEach(([k, v]) => h.append(k, v));
  return new Response(JSON.stringify(obj), { status: status || 200, headers: h });
}
