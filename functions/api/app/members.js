// GET /api/app/members (owner only) -> everyone who verified their email.
import { json, readSession } from "../../../lib/auth.js";
import { getJSON } from "../../../lib/app-store.js";
export async function onRequest({ request, env }) {
  const s = await readSession(request, env);
  if (!s) return json({ error: "signed_out" }, 401);
  if (!s.owner) return json({ error: "forbidden" }, 403);
  return json({ members: await getJSON(env, "members", []) });
}
