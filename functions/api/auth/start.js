// POST /api/auth/start  { name, email }  ->  emails a 6-digit code, sets the signed pending cookie.
import { json, normEmail, validEmail, cleanName, isAllowed, randomCode, codeMac, nonce, sign, cookie, bump,
  sendCodeEmail, PENDING_COOKIE, CODE_MINUTES, MAX_SENDS_PER_HOUR } from "../../../lib/auth.js";

export async function onRequestPost({ request, env }) {
  if (!env.AUTH_SECRET) return json({ error: "setup", message: "AUTH_SECRET is not set" }, 503);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "bad_json" }, 400); }
  const email = normEmail(body && body.email), name = cleanName(body && body.name);
  if (!validEmail(email)) return json({ error: "bad_email" }, 400);
  if (!name) return json({ error: "bad_name" }, 400);
  if (!isAllowed(env, email)) return json({ error: "not_allowed" }, 403);
  const ip = request.headers.get("cf-connecting-ip") || "0";
  const nE = await bump(env, "send:e:" + email, 3600), nI = await bump(env, "send:i:" + ip, 3600);
  if (nE > MAX_SENDS_PER_HOUR || nI > MAX_SENDS_PER_HOUR * 4) return json({ error: "too_many" }, 429);
  const code = randomCode(), exp = Date.now() + CODE_MINUTES * 60e3, nn = nonce();
  try { await sendCodeEmail(env, email, name, code); }
  catch (e) { console.log("mail error: " + e.message); return json({ error: "mail_failed" }, 502); }
  const pending = await sign(env.AUTH_SECRET, { k: "p", e: email, n: name, x: exp, j: nn, h: await codeMac(env.AUTH_SECRET, email, code, exp, nn) });
  return json({ ok: true, minutes: CODE_MINUTES }, 200, [["set-cookie", cookie(PENDING_COOKIE, pending, CODE_MINUTES * 60)]]);
}
export function onRequest() { return json({ error: "POST only" }, 405); }
