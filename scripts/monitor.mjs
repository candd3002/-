// Server-side monitor (runs on a schedule in GitHub Actions, no browser needed).
// Same analysis as the app (pages-site/analysis.js). Sends Telegram messages for new setups and for
// stop / TP1 exits. Tokens come from environment secrets only.
import { createRequire } from "module";
import fs from "fs";
import https from "https";

const require = createRequire(import.meta.url);
const A = require("../pages-site/analysis.js");

const INSTR = [
  { id: "XAU", sym: "XAUUSD", name: "XAU/USD", digits: 2 },
  { id: "EURUSD", sym: "EURUSD", name: "EUR/USD", digits: 5 },
  { id: "GBPUSD", sym: "GBPUSD", name: "GBP/USD", digits: 5 },
  { id: "BTC", sym: "BTCUSD", name: "BTC/USD", digits: 2 }
];
const STYLES = [
  { id: "scalp", tf: "15m", profile: "scalp", ar: "مضاربة سريعة", en: "Scalp" },
  { id: "day", tf: "1h", profile: "balanced", ar: "تداول يومي ICT", en: "Day ICT" },
  { id: "swing", tf: "4h", profile: "balanced", ar: "تداول متدرج", en: "Swing" }
];
const TF_MS = { "15m": 15 * 60e3, "1h": 60 * 60e3, "4h": 4 * 60 * 60e3 };
const STATE_FILE = process.env.STATE_FILE || "alerts-state.json";
const DRY = process.env.MONITOR_DRY === "1";
const MOCK = process.env.MOCK_FILE ? JSON.parse(fs.readFileSync(process.env.MOCK_FILE, "utf8")) : null;

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch (e) { return { init: false, seen: {}, open: {} }; }
}
function saveState(s) { fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 1)); }

function toBars(raw) {
  return raw.map(b => ({ t: Date.parse(b.openTime), o: +b.open, h: +b.high, l: +b.low, c: +b.close, v: +(b.tickVolume || 1) }))
    .filter(b => isFinite(b.t) && isFinite(b.c)).sort((a, b) => a.t - b.t);
}
async function fetchBars(sym, tf) {
  if (MOCK) return toBars(MOCK[sym + "|" + tf] || []);
  const r = await fetch("https://biquote.io/api/" + sym + "/ohlc?interval=" + tf, { cache: "no-store" });
  if (!r.ok) throw new Error("biquote " + r.status + " " + sym + " " + tf);
  const j = await r.json();
  return toBars(j.bars || []);
}

function sendTelegram(text) {
  if (DRY) { console.log("[dry] would send:\n" + text + "\n"); return Promise.resolve(); }
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) { console.log("Telegram secrets missing; message not sent:\n" + text); return Promise.resolve(); }
  const body = JSON.stringify({ chat_id: chat, text: text, disable_web_page_preview: true });
  return new Promise((resolve, reject) => {
    const req = https.request({ host: "api.telegram.org", path: "/bot" + token + "/sendMessage", method: "POST",
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) } }, res => {
      let d = ""; res.on("data", c => (d += c)); res.on("end", () => (res.statusCode === 200 ? resolve() : reject(new Error("telegram " + res.statusCode + " " + d.slice(0, 120)))));
    });
    req.on("error", reject); req.write(body); req.end();
  });
}

function setupText(inst, style, sig, title) {
  const d = inst.digits, f = v => (v == null || isNaN(v) ? "—" : v.toFixed(d));
  const side = sig.dir === "LONG" ? "شراء / BUY" : "بيع / SELL";
  return [title, inst.name + " · " + side + " · " + style.tf.toUpperCase() + " · " + style.ar,
    "دخول / Entry: " + f(sig.entry) + "   وقف / Stop: " + f(sig.sl),
    "TP1 " + f(sig.tp1) + "   TP2 " + f(sig.tp2) + "   TP3 " + f(sig.tp3),
    "تعليمي، ليس نصيحة مالية / Educational, not advice"].join("\n");
}

// No repeats: a setup is identified by instrument + timeframe + direction + the closed bar it formed on
// (never the entry price), and the same instrument/timeframe/direction stays silent while a trade is
// open and for a few bars after it. Same rules as the app (pages-site/analysis.js: isRepeat).
async function main() {
  const state = loadState();
  const now = Date.now();
  const firstRun = !state.init;
  const notes = [];
  state.trades = state.trades || [];
  // Older state files kept open trades in state.open: carry them over once.
  for (const id of Object.keys(state.open || {})) {
    const o = state.open[id];
    state.trades.push({ id, inst: o.inst, tf: o.tf, dir: o.dir, entry: o.entry, sl: o.sl, tp1: o.tp1, tp2: o.tp2, tp3: o.tp3, t: o.t, status: "open" });
  }
  state.open = {};

  for (const inst of INSTR) {
    for (const style of STYLES) {
      let raw;
      try { raw = await fetchBars(inst.sym, style.tf); } catch (e) { console.log("skip " + inst.id + " " + style.tf + ": " + e.message); continue; }
      const bars = A.closedBars(raw, TF_MS[style.tf], now); // the forming candle is never analysed
      if (bars.length < 60) continue;
      const last = bars[bars.length - 1];
      const fresh = now - last.t <= 2 * TF_MS[style.tf] + TF_MS[style.tf];

      // 1) exits first, so a trade that just closed frees its slot only after the cooldown
      for (const tr of state.trades) {
        if (tr.status !== "open" || tr.inst !== inst.id || tr.tf !== style.tf) continue;
        const ex = A.resolveExit(tr, bars);
        if (!ex) continue;
        tr.status = ex.status; tr.closeT = ex.closeT;
        if (firstRun) continue;
        const won = ex.status === "win";
        const pts = won ? Math.abs(tr.tp1 - tr.entry) : Math.abs(tr.entry - tr.sl);
        notes.push([won ? "صفقة رابحة / Win" : "صفقة خاسرة / Loss",
          inst.name + " · " + (won ? "+" : "−") + pts.toFixed(inst.digits) + " نقطة / pts · " + style.tf.toUpperCase(),
          "دخول " + tr.entry.toFixed(inst.digits) + " · وقف " + tr.sl.toFixed(inst.digits) + " · TP1 " + tr.tp1.toFixed(inst.digits)].join("\n"));
      }

      // 2) new setup on the last closed bar
      const r = A.analyze(bars, style.profile, null);
      if (r.ready && r.signal && !A.isRepeat(state.trades, inst.id, style.tf, r.signal.dir, last.t, TF_MS[style.tf])) {
        const s = r.signal;
        state.trades.push({ id: A.setupId(inst.id, style.tf, s.dir, last.t), inst: inst.id, style: style.id, tf: style.tf, dir: s.dir,
          entry: s.entry, sl: s.sl, tp1: s.tp1, tp2: s.tp2, tp3: s.tp3, t: last.t, status: "open" });
        // Setups found on the very first run, or on stale data, are remembered silently, never announced.
        if (!firstRun && fresh) notes.push(setupText(inst, style, s, "إشارة جديدة / New setup"));
      }
    }
  }

  // Keep the state small: closed trades older than 14 days are dropped.
  state.trades = state.trades.filter(t => t.status === "open" || now - (t.closeT || t.t) < 14 * 864e5);
  delete state.seen;
  state.init = true;
  saveState(state);
  let sent = 0;
  // A failed send is logged and skipped: the state is already saved, so it is never re-sent as a duplicate.
  for (const n of notes) { try { await sendTelegram(n); sent++; } catch (e) { console.log("send failed: " + e.message); } }
  console.log("done: " + sent + "/" + notes.length + " messages" + (firstRun ? " (first run: history recorded silently)" : ""));
}
main().catch(e => { console.error(e); process.exit(1); });
