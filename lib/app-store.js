// Shared app data for the owner panel, kept in the Cloudflare KV binding AUTH_KV.
// cfg: owner settings shown to everyone · sigs: official signals · members: verified emails.
export const CFG_KEYS = { analystNote: 220, banner: 120, bannerOn: 0, bio: 600, insta: 120, channel: 200, bookUrl: 300, maintenance: 0, maintenanceMsg: 120 };
export async function getJSON(env, key, dflt) {
  if (!env.AUTH_KV) return dflt;
  try { const v = await env.AUTH_KV.get(key); return v ? JSON.parse(v) : dflt; } catch (e) { return dflt; }
}
export async function putJSON(env, key, val) { await env.AUTH_KV.put(key, JSON.stringify(val)); }
export function cleanCfg(prev, patch) {
  const out = Object.assign({}, prev);
  for (const k of Object.keys(CFG_KEYS)) {
    if (!(k in (patch || {}))) continue;
    const max = CFG_KEYS[k], v = patch[k];
    out[k] = max === 0 ? !!v : String(v == null ? "" : v).slice(0, max);
  }
  for (const k of ["channel", "bookUrl"]) if (out[k] && !/^https?:\/\//i.test(out[k])) out[k] = "";
  out.updatedAt = Date.now();
  return out;
}
export async function addMember(env, email, name) {
  if (!env.AUTH_KV) return;
  const list = await getJSON(env, "members", []);
  const now = Date.now(), i = list.findIndex(m => m.email === email);
  if (i >= 0) { list[i].name = name || list[i].name; list[i].lastSeen = now; }
  else list.unshift({ email, name: name || "", joinedAt: now, lastSeen: now });
  await putJSON(env, "members", list.slice(0, 5000));
}
