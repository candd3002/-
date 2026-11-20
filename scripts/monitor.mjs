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

async function main() {
  const state = loadState();
  const now = Date.now();
  const firstRun = !state.init;
  const notes = [];

  for (const inst of INSTR) {
    for (const style of STYLES) {
      let bars;
      try { bars = await fetchBars(inst.sym, style.tf); } catch (e) { console.log("skip " + inst.id + " " + style.tf + ": " + e.message); continue; }
      if (bars.length < 60) continue;
      const last = bars[bars.length - 1];
      const fresh = now - last.t <= 2 * TF_MS[style.tf];

      // 1) new setup on the latest bars
      const r = A.analyze(bars, style.profile, null);
      if (r.ready && r.signal) {
        const id = inst.id + "|" + style.id + "|" + r.signal.key + "|" + r.signal.entry.toFixed(inst.digits);
        if (!state.seen[id]) {
          state.seen[id] = now;
          // Old setups found on the very first run are remembered silently, never announced.
          if (!firstRun && fresh) {
            state.open[id] = { inst: inst.id, style: style.id, tf: style.tf, dir: r.signal.dir, entry: r.signal.entry,
              sl: r.signal.sl, tp1: r.signal.tp1, tp2: r.signal.tp2, tp3: r.signal.tp3, t: last.t };
            notes.push(setupText(inst, style, r.signal, "إشارة جديدة / New setup"));
          }
        }
      }

      // 2) exits for open trades on this instrument and timeframe
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
          notes.push([won ? "صفقة رابحة / Win" : "صفقة خاسرة / Loss",
            inst.name + " · " + (won ? "+" : "−") + pts.toFixed(inst.digits) + " نقطة / pts · " + style.tf.toUpperCase(),
            "دخول " + tr.entry.toFixed(inst.digits) + " · وقف " + tr.sl.toFixed(inst.digits) + " · TP1 " + tr.tp1.toFixed(inst.digits)].join("\n"));
          delete state.open[id];
          break;
        }
      }
    }
  }

  state.init = true;
  saveState(state);
  for (const n of notes) await sendTelegram(n);
  console.log("done: " + notes.length + " messages" + (firstRun ? " (first run: history recorded silently)" : ""));
}
main().catch(e => { console.error(e); process.exit(1); });
