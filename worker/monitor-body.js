// ---- Free server monitor on Cloudflare Workers (cron, no GitHub billing) ----
// Bindings needed: KV namespace MONITOR_KV; secrets TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID.
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
async function telegram(env, text) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) { console.log("Telegram not configured; message:\n" + text); return; }
  const r = await fetch("https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/sendMessage", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: text, disable_web_page_preview: true })
  });
  if (!r.ok) console.log("Telegram error " + r.status + " " + (await r.text()).slice(0, 120));
}
function setupText(inst, style, sig) {
  const d = inst.digits, f = v => (v == null || isNaN(v) ? "—" : v.toFixed(d));
  const side = sig.dir === "LONG" ? "شراء / BUY" : "بيع / SELL";
  return ["إشارة جديدة / New setup", inst.name + " · " + side + " · " + style.tf.toUpperCase() + " · " + style.ar,
    "دخول / Entry: " + f(sig.entry) + "   وقف / Stop: " + f(sig.sl),
    "TP1 " + f(sig.tp1) + "   TP2 " + f(sig.tp2) + "   TP3 " + f(sig.tp3),
    "تعليمي، ليس نصيحة مالية / Educational, not advice"].join("\n");
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
            state.open[id] = { inst: inst.id, style: style.id, tf: style.tf, dir: r.signal.dir, entry: r.signal.entry,
              sl: r.signal.sl, tp1: r.signal.tp1, tp2: r.signal.tp2, tp3: r.signal.tp3, t: last.t };
            out.push(setupText(inst, style, r.signal));
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
          out.push([won ? "صفقة رابحة / Win" : "صفقة خاسرة / Loss", inst.name + " · " + (won ? "+" : "−") + pts.toFixed(inst.digits) + " نقطة / pts · " + style.tf.toUpperCase(),
            "دخول " + tr.entry.toFixed(inst.digits) + " · وقف " + tr.sl.toFixed(inst.digits) + " · TP1 " + tr.tp1.toFixed(inst.digits)].join("\n"));
          delete state.open[id];
          break;
        }
      }
    }
  }
  // keep the stored state small: forget setups older than 30 days
  const cutoff = now - 30 * 864e5;
  for (const k of Object.keys(state.seen)) if (state.seen[k] < cutoff) delete state.seen[k];
  state.init = true;
  await env.MONITOR_KV.put("state", JSON.stringify(state));
  for (const m of out) await telegram(env, m);
  console.log("run done: " + out.length + " messages" + (firstRun ? " (first run: history recorded silently)" : ""));
}
export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(run(env)); },
  async fetch() { return new Response("baqer monitor ok", { headers: { "content-type": "text/plain" } }); }
};
