// POST /api/app/config  (owner only) -> merges the allowed fields into the shared settings.
import { json, readSession } from "../../../lib/auth.js";
import { getJSON, putJSON, cleanCfg } from "../../../lib/app-store.js";
export async function onRequestPost({ request, env }) {
  const s = await readSession(request, env);
  if (!s) return json({ error: "signed_out" }, 401);
  if (!s.owner) return json({ error: "forbidden" }, 403);
  if (!env.AUTH_KV) return json({ error: "no_kv" }, 503);
  let patch; try { patch = await request.json(); } catch (e) { return json({ error: "bad_json" }, 400); }
  const cfg = cleanCfg(await getJSON(env, "cfg", {}), patch);
  await putJSON(env, "cfg", cfg);
  return json({ ok: true, cfg });
}
export function onRequest() { return json({ error: "POST only" }, 405); }
