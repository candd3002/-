// POST /api/auth/verify  { code }  ->  checks the code, sets the 30-day session cookie.
import { json, unsign, getCookie, codeMac, sign, cookie, bump, isAllowed,
  PENDING_COOKIE, SESSION_COOKIE, SESSION_DAYS, MAX_ATTEMPTS, CODE_MINUTES, isOwner } from "../../../lib/auth.js";
import { addMember } from "../../../lib/app-store.js";

export async function onRequestPost({ request, env }) {
  if (!env.AUTH_SECRET) return json({ error: "setup" }, 503);
  const p = await unsign(env.AUTH_SECRET, getCookie(request, PENDING_COOKIE));
  if (!p || p.k !== "p") return json({ error: "expired" }, 400);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "bad_json" }, 400); }
  const code = String((body && body.code) || "").replace(/\D/g, "");
  if (code.length !== 6) return json({ error: "bad_code" }, 400);
  // Wrong guesses are counted per code request; after MAX_ATTEMPTS the code is dead.
  const tries = await bump(env, "try:" + p.j, CODE_MINUTES * 60);
  if (tries > MAX_ATTEMPTS) return json({ error: "too_many" }, 429, [["set-cookie", cookie(PENDING_COOKIE, "", 0)]]);
  const mac = await codeMac(env.AUTH_SECRET, p.e, code, p.x, p.j);
  if (mac !== p.h) return json({ error: "wrong_code", left: Math.max(0, MAX_ATTEMPTS - tries) }, 400);
  if (!isAllowed(env, p.e)) return json({ error: "not_allowed" }, 403);
  try { await addMember(env, p.e, p.n); } catch (e) {}
  const session = await sign(env.AUTH_SECRET, { k: "s", e: p.e, n: p.n, x: Date.now() + SESSION_DAYS * 864e5 });
  return json({ ok: true, name: p.n, email: p.e, owner: isOwner(env, p.e) }, 200, [
    ["set-cookie", cookie(SESSION_COOKIE, session, SESSION_DAYS * 86400)],
    ["set-cookie", cookie(PENDING_COOKIE, "", 0)]
  ]);
}
export function onRequest() { return json({ error: "POST only" }, 405); }
