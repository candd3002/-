// POST /api/auth/logout  ->  clears the session cookie.
import { json, cookie, SESSION_COOKIE } from "../../../lib/auth.js";
export async function onRequest() {
  return json({ ok: true }, 200, [["set-cookie", cookie(SESSION_COOKIE, "", 0)]]);
}
