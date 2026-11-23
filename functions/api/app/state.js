// GET /api/app/state -> who is signed in, owner settings and official signals (any verified user).
import { json, readSession } from "../../../lib/auth.js";
import { getJSON } from "../../../lib/app-store.js";
export async function onRequest({ request, env }) {
  const s = await readSession(request, env);
  if (!s) return json({ error: "signed_out" }, 401);
  const [cfg, sigs] = await Promise.all([getJSON(env, "cfg", {}), getJSON(env, "sigs", [])]);
  return json({ me: { name: s.name, email: s.email, owner: s.owner }, cfg, sigs, kv: !!env.AUTH_KV });
}
