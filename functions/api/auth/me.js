// GET /api/auth/me  ->  who is signed in (name, email, owner) or 401.
import { json, readSession } from "../../../lib/auth.js";
export async function onRequest({ request, env }) {
  const s = await readSession(request, env);
  return s ? json({ ok: true, name: s.name, email: s.email, owner: s.owner }) : json({ error: "signed_out" }, 401);
}
