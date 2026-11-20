// ---- Free server monitor on Cloudflare Workers (cron) ----
// Sends Web Push notifications to the app (no Telegram).
// Binding needed: KV namespace MONITOR_KV. No secrets needed: VAPID keys are generated and kept in KV.
const INSTR = [
  { id: "XAU", sym: "XAUUSD", name: "XAU/USD", digits: 2 },
  { id: "EURUSD", sym: "EURUSD", name: "EUR/USD", digits: 5 },
  { id: "GBPUSD", sym: "GBPUSD", name: "GBP/USD", digits: 5 },
  { id: "BTC", sym: "BTCUSD", name: "BTC/USD", digits: 2 }
];
const STYLES = [
  { id: "scalp", tf: "15m", profile: "scalp", ar: "مضاربة سريعة" },
  { id: "day", tf: "1h", profile: "balanced", ar: "تداول يومي ICT" },
  { id: "swing", tf: "4h", profile: "balanced", ar: "تداول متدرج" }
];
const TF_MS = { "15m": 15 * 60e3, "1h": 60 * 60e3, "4h": 4 * 60 * 60e3 };
const SITE = "https://baqersniper.pages.dev";
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type" };

function toBars(raw) {
  return raw.map(b => ({ t: Date.parse(b.openTime), o: +b.open, h: +b.high, l: +b.low, c: +b.close, v: +(b.tickVolume || 1) }))
    .filter(b => isFinite(b.t) && isFinite(b.c)).sort((a, b) => a.t - b.t);
}
async function fetchBars(sym, tf) {
  const r = await fetch("https://biquote.io/api/" + sym + "/ohlc?interval=" + tf, { cache: "no-store" });
  if (!r.ok) throw new Error("biquote " + r.status + " " + sym + " " + tf);
  const j = await r.json();
  return toBars(j.bars || []);
}

// ---- Web Push (VAPID, no payload: the service worker fetches the text from /latest) ----
const b64u = bytes => { let s = ""; for (const x of new Uint8Array(bytes)) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const b64uJson = obj => b64u(new TextEncoder().encode(JSON.stringify(obj)));

async function getVapid(env) {
  const raw = await env.MONITOR_KV.get("vapid");
  if (raw) return JSON.parse(raw);
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  const pub = b64u(await crypto.subtle.exportKey("raw", kp.publicKey));
  const v = { jwk: jwk, pub: pub };
  await env.MONITOR_KV.put("vapid", JSON.stringify(v));
  return v;
}
async function vapidAuth(vapid, endpoint) {
  const aud = new URL(endpoint).origin;
  const data = b64uJson({ typ: "JWT", alg: "ES256" }) + "." + b64uJson({ aud: aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SITE });
  const key = await crypto.subtle.importKey("jwk", vapid.jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(data));
  return "vapid t=" + data + "." + b64u(sig) + ", k=" + vapid.pub;
}
async function getSubs(env) { const r = await env.MONITOR_KV.get("subs"); return r ? JSON.parse(r) : []; }

async function pushAll(env) {
  const subs = await getSubs(env);
  if (!subs.length) return;
  const vapid = await getVapid(env);
  const keep = [];
  for (const s of subs) {
    try {
      const r = await fetch(s.endpoint, { method: "POST", headers: { TTL: "3600", Authorization: await vapidAuth(vapid, s.endpoint) } });
      if (r.status === 404 || r.status === 410) continue; // subscription expired or removed
      keep.push(s);
    } catch (e) { keep.push(s); }
  }
  if (keep.length !== subs.length) await env.MONITOR_KV.put("subs", JSON.stringify(keep));
}

// ---- Monitor ----
function setupMsg(inst, style, sig) {
  const d = inst.digits, f = v => (v == null || isNaN(v) ? "—" : v.toFixed(d));
  const side = sig.dir === "LONG" ? "شراء / BUY" : "بيع / SELL";
  return { title: "إشارة جديدة / New setup",
    body: inst.name + " · " + side + " · " + style.tf.toUpperCase() + " · " + style.ar + "\n" +
      "دخول " + f(sig.entry) + " · وقف " + f(sig.sl) + "\nTP1 " + f(sig.tp1) + " · TP2 " + f(sig.tp2) + " · TP3 " + f(sig.tp3) };
}
async function run(env) {
  const raw = await env.MONITOR_KV.get("state");
  const state = raw ? JSON.parse(raw) : { init: false, seen: {}, open: {} };
  const now = Date.now(), firstRun = !state.init, out = [];

  for (const inst of INSTR) {
    for (const style of STYLES) {
      let bars;
      try { bars = await fetchBars(inst.sym, style.tf); } catch (e) { console.log("skip " + inst.id + " " + style.tf + ": " + e.message); continue; }
      if (bars.length < 60) continue;
      const last = bars[bars.length - 1];
      const fresh = now - last.t <= 2 * TF_MS[style.tf];
      const r = A.analyze(bars, style.profile, null);
      if (r.ready && r.signal) {
        const id = inst.id + "|" + style.id + "|" + r.signal.key + "|" + r.signal.entry.toFixed(inst.digits);
        if (!state.seen[id]) {
          state.seen[id] = now;
          if (!firstRun && fresh) {
            const m = setupMsg(inst, style, r.signal);
            state.open[id] = { inst: inst.id, style: style.id, tf: style.tf, dir: r.signal.dir, entry: r.signal.entry,
              sl: r.signal.sl, tp1: r.signal.tp1, tp2: r.signal.tp2, tp3: r.signal.tp3, t: last.t };
            out.push({ id: "new|" + id, title: m.title, body: m.body });
          }
        }
      }
      for (const id of Object.keys(state.open)) {
        const tr = state.open[id];
        if (tr.inst !== inst.id || tr.tf !== style.tf) continue;
        const long = tr.dir === "LONG";
        for (const b of bars) {
          if (b.t <= tr.t) continue;
          const hitStop = long ? b.l <= tr.sl : b.h >= tr.sl;
          const hitTp = long ? b.h >= tr.tp1 : b.l <= tr.tp1;
          if (!hitStop && !hitTp) continue;
          const won = hitTp && !hitStop;
          const pts = won ? Math.abs(tr.tp1 - tr.entry) : Math.abs(tr.entry - tr.sl);
          out.push({ id: "exit|" + id, title: won ? "صفقة رابحة / Win" : "صفقة خاسرة / Loss",
            body: inst.name + " · " + (won ? "+" : "−") + pts.toFixed(inst.digits) + " نقطة / pts · " + style.tf.toUpperCase() + "\n" +
              "دخول " + tr.entry.toFixed(inst.digits) + " · وقف " + tr.sl.toFixed(inst.digits) + " · TP1 " + tr.tp1.toFixed(inst.digits) });
          delete state.open[id];
          break;
        }
      }
    }
  }
  const cutoff = now - 30 * 864e5;
  for (const k of Object.keys(state.seen)) if (state.seen[k] < cutoff) delete state.seen[k];
  state.init = true;
  await env.MONITOR_KV.put("state", JSON.stringify(state));
  if (out.length) {
    await env.MONITOR_KV.put("latest", JSON.stringify({ at: now, items: out }));
    await pushAll(env);
  }
  console.log("run done: " + out.length + " notifications" + (firstRun ? " (first run: history recorded silently)" : ""));
}

// ---- HTTP: subscribe from the app, expose the public key, send a test ----
function json(obj, status) { return new Response(JSON.stringify(obj), { status: status || 200, headers: Object.assign({ "content-type": "application/json" }, CORS) }); }
export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(run(env)); },
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === "/vapid-public") { const v = await getVapid(env); return json({ key: v.pub }); }
    if (url.pathname === "/latest") { const r = await env.MONITOR_KV.get("latest"); return json(r ? JSON.parse(r) : { items: [] }); }
    if (url.pathname === "/subscribe" && req.method === "POST") {
      let sub; try { sub = await req.json(); } catch (e) { return json({ error: "bad json" }, 400); }
      if (!sub || typeof sub.endpoint !== "string" || !sub.endpoint.startsWith("https://")) return json({ error: "bad subscription" }, 400);
      const subs = (await getSubs(env)).filter(s => s.endpoint !== sub.endpoint);
      subs.push({ endpoint: sub.endpoint, keys: sub.keys || {} });
      await env.MONITOR_KV.put("subs", JSON.stringify(subs.slice(-50)));
      return json({ ok: true }, 201);
    }
    if (url.pathname === "/test") {
      await env.MONITOR_KV.put("latest", JSON.stringify({ at: Date.now(), items: [{ id: "test|" + Date.now(), title: "اختبار الإشعارات", body: "الإشعارات تعمل من التطبيق. هذه ليست إشارة تداول." }] }));
      await pushAll(env);
      return json({ ok: true });
    }
    return new Response("baqer monitor ok", { headers: { "content-type": "text/plain" } });
  }
};
