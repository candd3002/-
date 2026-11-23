// POST /api/app/signal (owner only) { op: "add" | "toggle" | "delete", ... } -> official signals list.
import { json, readSession } from "../../../lib/auth.js";
import { getJSON, putJSON } from "../../../lib/app-store.js";
const ASSETS = ["XAU", "XAG", "EUR", "GBP", "BTC", "ETH", "SOL", "XRP"];
const num = v => (v === null || v === "" || v === undefined || !isFinite(+v) ? null : +v);
export async function onRequestPost({ request, env }) {
  const s = await readSession(request, env);
  if (!s) return json({ error: "signed_out" }, 401);
  if (!s.owner) return json({ error: "forbidden" }, 403);
  if (!env.AUTH_KV) return json({ error: "no_kv" }, 503);
  let b; try { b = await request.json(); } catch (e) { return json({ error: "bad_json" }, 400); }
  let sigs = await getJSON(env, "sigs", []);
  if (b.op === "add") {
    const doc = { id: crypto.randomUUID(), asset: String(b.asset), sell: !!b.sell, entry: num(b.entry), sl: num(b.sl),
      tp1: num(b.tp1), tp2: num(b.tp2), tp3: num(b.tp3), note: String(b.note || "").slice(0, 140), at: Date.now(), active: true };
    if (!ASSETS.includes(doc.asset) || doc.entry == null || doc.sl == null) return json({ error: "bad_signal" }, 400);
    if (doc.sell ? doc.sl <= doc.entry : doc.sl >= doc.entry) return json({ error: "bad_stop" }, 400);
    sigs.unshift(doc); sigs = sigs.slice(0, 50);
  } else if (b.op === "toggle") {
    const x = sigs.find(z => z.id === b.id); if (!x) return json({ error: "not_found" }, 404);
    x.active = x.active === false;
  } else if (b.op === "delete") {
    sigs = sigs.filter(z => z.id !== b.id);
  } else return json({ error: "bad_op" }, 400);
  await putJSON(env, "sigs", sigs);
  return json({ ok: true, sigs });
}
export function onRequest() { return json({ error: "POST only" }, 405); }
