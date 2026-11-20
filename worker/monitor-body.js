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
const PROFILES = ["balanced", "sniper"];
const TFS = ["15m", "1h", "4h"];
const PNAME = { balanced: "متوازن / balanced", sniper: "قناص / sniper", scalp: "مضاربة / scalp" };
function fmt(inst, v) { return v == null || isNaN(v) ? "—" : v.toFixed(inst.digits); }
function setupMsg(inst, tf, profile, sig) {
  const side = sig.dir === "LONG" ? "شراء / BUY" : "بيع / SELL";
  return { title: "دخول / Entry: " + side,
    body: inst.name + " · " + tf.toUpperCase() + " · " + (PNAME[profile] || profile) + "\n" +
      "دخول " + fmt(inst, sig.entry) + " · وقف " + fmt(inst, sig.sl) + "\nTP1 " + fmt(inst, sig.tp1) + " · TP2 " + fmt(inst, sig.tp2) + " · TP3 " + fmt(inst, sig.tp3) };
}
// Walks the bars after the entry: reports each target hit once, then the close (stop or TP3).
function manage(tr, id, bars, inst, now, out, hist, state) {
  tr.tpHits = tr.tpHits || 0;
  const long = tr.dir === "LONG", dg = inst.digits;
  const label = inst.name + " · " + tr.tf.toUpperCase() + " · " + (PNAME[tr.profile] || tr.profile || "");
  for (const b of bars) {
    if (b.t <= tr.t) continue;
    const stopHit = long ? b.l <= tr.sl : b.h >= tr.sl;
    if (stopHit) {
      const won = tr.tpHits > 0;
      const lvl = won ? tr["tp" + tr.tpHits] : tr.sl;
      const pts = won ? Math.abs(lvl - tr.entry) : -Math.abs(tr.entry - tr.sl);
      out.push({ id: "exit|" + id + "|" + b.t, title: won ? "صفقة رابحة / Win" : "صفقة خاسرة / Loss",
        body: label + "\n" + (won ? "أُغلقت بعد الهدف " + tr.tpHits : "وصل وقف الخسارة") + " · " + (pts >= 0 ? "+" : "") + pts.toFixed(dg) + " pts" });
      hist.push({ t: now, kind: won ? "win" : "loss", inst: inst.name, tf: tr.tf, profile: tr.profile || "", dir: tr.dir, entry: tr.entry, pts: pts, digits: dg });
      delete state.open[id]; return;
    }
    for (let k = tr.tpHits + 1; k <= 3; k++) {
      const level = tr["tp" + k];
      const hit = long ? b.h >= level : b.l <= level;
      if (!hit) break;
      tr.tpHits = k;
      const pts = Math.abs(level - tr.entry);
      out.push({ id: "tp|" + id + "|" + k, title: "وصل الهدف " + k + " / TP" + k + " hit",
        body: label + "\nالسعر " + fmt(inst, level) + " · +" + pts.toFixed(dg) + " pts" });
      hist.push({ t: now, kind: "tp" + k, inst: inst.name, tf: tr.tf, profile: tr.profile || "", dir: tr.dir, entry: tr.entry, pts: pts, digits: dg });
      if (k === 3) { delete state.open[id]; return; }
    }
  }
}
async function run(env) {
  const skipped = [];
  const hist = JSON.parse((await env.MONITOR_KV.get("history")) || "[]");
  const raw = await env.MONITOR_KV.get("state");
  const state = raw ? JSON.parse(raw) : { init: false, seen: {}, open: {} };
  const now = Date.now(), firstRun = !state.init, out = [];

  for (const inst of INSTR) {
    for (const tf of TFS) {
      let bars;
      try { bars = await fetchBars(inst.sym, tf); } catch (e) { skipped.push(inst.id + " " + tf + ": " + e.message); continue; }
      if (bars.length < 60) continue;
      const last = bars[bars.length - 1];
      const fresh = now - last.t <= 2 * TF_MS[tf];
      for (const profile of PROFILES) {
        const r = A.analyze(bars, profile, null);
        if (!(r.ready && r.signal)) continue;
        const sig = r.signal;
        const id = inst.id + "|" + tf + "|" + profile + "|" + sig.key + "|" + sig.entry.toFixed(inst.digits);
        if (state.seen[id]) continue;
        state.seen[id] = now;
        if (!firstRun && fresh) {
          const m = setupMsg(inst, tf, profile, sig);
          state.open[id] = { inst: inst.id, tf: tf, profile: profile, dir: sig.dir, entry: sig.entry, sl: sig.sl,
            tp1: sig.tp1, tp2: sig.tp2, tp3: sig.tp3, tpHits: 0, t: last.t };
          out.push({ id: "new|" + id, title: m.title, body: m.body });
          hist.push({ t: now, kind: "open", inst: inst.name, tf: tf, profile: profile, dir: sig.dir, entry: sig.entry, digits: inst.digits });
        }
      }
      for (const id of Object.keys(state.open)) {
        const tr = state.open[id];
        if (tr.inst !== inst.id || tr.tf !== tf) continue;
        manage(tr, id, bars, inst, now, out, hist, state);
      }
    }
  }
  const cutoff = now - 30 * 864e5;
  for (const k of Object.keys(state.seen)) if (state.seen[k] < cutoff) delete state.seen[k];
  state.init = true;
  await env.MONITOR_KV.put("state", JSON.stringify(state));
  while (hist.length > 200) hist.shift();
  await env.MONITOR_KV.put("history", JSON.stringify(hist));
  if (out.length) {
    await env.MONITOR_KV.put("latest", JSON.stringify({ at: now, items: out }));
    await pushAll(env);
  }
  console.log("run done: " + out.length + " notifications" + (firstRun ? " (first run: history recorded silently)" : ""));
  return { firstRun: firstRun, notifications: out.length, skipped: skipped };
}
async function runSafe(env) {
  const at = Date.now();
  try {
    const info = await run(env);
    await env.MONITOR_KV.put("lastrun", JSON.stringify(Object.assign({ ok: true, at: at, finished: Date.now() }, info)));
  } catch (e) {
    await env.MONITOR_KV.put("lastrun", JSON.stringify({ ok: false, at: at, error: String(e && e.stack || e).slice(0, 500) }));
  }
}

// ---- HTTP: subscribe from the app, expose the public key, send a test ----
function json(obj, status) { return new Response(JSON.stringify(obj), { status: status || 200, headers: Object.assign({ "content-type": "application/json" }, CORS) }); }
function historyHtml(h) {
  const d = (n, x) => (x == null || isNaN(x) ? "—" : Number(x).toFixed(n));
  const rows = h.slice().reverse().map(e => {
    const dt = new Date(e.t).toISOString().replace("T", " ").slice(0, 16);
    const res = e.kind === "open" ? "دخول / entry" : e.kind === "win" ? "ربح / win" : e.kind === "loss" ? "خسارة / loss" : "وصل الهدف " + e.kind.slice(2);
    const cls = e.kind === "win" ? "w" : e.kind === "loss" ? "l" : "o";
    const pts = e.kind === "open" ? "" : (e.pts >= 0 ? "+" : "") + d(e.digits, e.pts) + " pts";
    return '<tr class="' + cls + '"><td>' + dt + "</td><td>" + e.inst + " · " + e.tf + "</td><td>" +
      (e.dir === "LONG" ? "شراء" : "بيع") + "</td><td>" + d(e.digits, e.entry) + "</td><td>" + res + "</td><td>" + pts + "</td></tr>";
  }).join("");
  const closed = h.filter(e => e.kind === "win" || e.kind === "loss");
  const wins = closed.filter(e => e.kind === "win").length;
  const net = closed.reduce((s, e) => s + (e.pts || 0), 0);
  const summary = "ربح " + wins + " · خسارة " + (closed.length - wins) + " · صافي " + net.toFixed(2) + " نقطة";
  return '<!doctype html><html dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>سجل الصفقات</title>' +
    '<style>body{font-family:system-ui,sans-serif;background:#0b1424;color:#eee;margin:16px}table{width:100%;border-collapse:collapse;font-size:14px}td,th{border-bottom:1px solid #1e2c44;padding:6px;text-align:start}.w td:nth-child(5){color:#6fd08c}.l td:nth-child(5){color:#ff6b6b}h2{color:#e8c35a}</style></head>' +
    "<body><h2>سجل الصفقات</h2><p>" + summary + '</p><table><tr><th>الوقت UTC</th><th>الأداة</th><th>الاتجاه</th><th>الدخول</th><th>النتيجة</th><th>النقاط</th></tr>' +
    (rows || '<tr><td colspan="6">لا توجد صفقات بعد</td></tr>') + "</table></body></html>";
}

export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(runSafe(env)); },
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === "/vapid-public") { const v = await getVapid(env); return json({ key: v.pub }); }
    if (url.pathname === "/history") { const h = JSON.parse((await env.MONITOR_KV.get("history")) || "[]"); return new Response(historyHtml(h), { headers: { "content-type": "text/html; charset=utf-8" } }); }
    if (url.pathname === "/status") { const r = await env.MONITOR_KV.get("lastrun"); return json(r ? JSON.parse(r) : { note: "no run yet" }); }
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
