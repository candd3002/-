// Phone-notification monitor (Cloudflare Worker "alert"). Deployed by Workers Builds from this folder.
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

// Urgency high: Apple and Google deliver at once instead of batching (they may delay "normal" pushes
// for a long time on a sleeping phone). TTL 15 min: a message that cannot arrive in time is dropped.
async function pushAll(env) {
  const subs = await getSubs(env);
  if (!subs.length) return;
  const vapid = await getVapid(env);
  const keep = [];
  for (const s of subs) {
    try {
      const r = await fetch(s.endpoint, { method: "POST", headers: { TTL: "900", Urgency: "high", Authorization: await vapidAuth(vapid, s.endpoint) } });
      if (r.status === 404 || r.status === 410) continue; // subscription expired or removed
      keep.push(s);
    } catch (e) { keep.push(s); }
  }
  if (keep.length !== subs.length) await env.MONITOR_KV.put("subs", JSON.stringify(keep));
}

// ---- Bar archive: closed candles kept in KV, saved once per hour (KV free plan write limit) ----
const HIST_KEEP = 10000;
async function getHist(env, id, tf) { const r = await env.MONITOR_KV.get("hist:" + id + ":" + tf); return r ? JSON.parse(r) : []; }
async function saveHist(env, id, tf, bars) {
  const map = new Map();
  for (const b of await getHist(env, id, tf)) map.set(b.t, b);
  for (const b of bars) map.set(b.t, { t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v });
  const arr = [...map.values()].sort((a, b) => a.t - b.t).slice(-HIST_KEEP);
  await env.MONITOR_KV.put("hist:" + id + ":" + tf, JSON.stringify(arr));
  return arr.length;
}

// ---- Monitor ----
// One profile, the same as the app, so a setup is announced once and matches what the app shows.
const PROFILES = ["balanced"];
const TFS = ["15m", "1h", "4h"];
const PNAME = { balanced: "متوازن / balanced", sniper: "قناص / sniper", scalp: "مضاربة / scalp" };
function fmt(inst, v) { return v == null || isNaN(v) ? "—" : v.toFixed(inst.digits); }
function setupMsg(inst, tf, profile, sig, priceNow, movedR) {
  const side = sig.dir === "LONG" ? "شراء / BUY" : "بيع / SELL";
  const warn = movedR >= 0.5 ? "\nالسعر تحرك بعيداً عن الدخول: لا تطارد، انتظر عودته لمنطقة الدخول" : "";
  return { title: "دخول " + (sig.dir === "LONG" ? "شراء" : "بيع") + " · " + inst.name + " · " + tf.toUpperCase(),
    body: side + " · الآن " + fmt(inst, priceNow) + "\n" +
      "دخول " + fmt(inst, sig.entry) + " · وقف " + fmt(inst, sig.sl) + "\nTP1 " + fmt(inst, sig.tp1) + " · TP2 " + fmt(inst, sig.tp2) + " · TP3 " + fmt(inst, sig.tp3) + warn };
}
function fmtMove(inst, pts) {
  if (inst.digits === 5) return (pts * 10000).toFixed(1) + " pip";
  return pts.toFixed(2) + " نقطة";
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
      out.push({ id: "exit|" + id + "|" + b.t, title: (won ? "صفقة رابحة · " : "صفقة خاسرة · ") + inst.name + " · " + tr.tf.toUpperCase(),
        body: label + "\n" + (won ? "أُغلقت بعد الهدف " + tr.tpHits : "وصل وقف الخسارة") + " · " + (pts >= 0 ? "+" : "−") + fmtMove(inst, Math.abs(pts)) });
      hist.push({ t: now, kind: won ? "win" : "loss", inst: inst.name, tf: tr.tf, profile: tr.profile || "", dir: tr.dir, entry: tr.entry, pts: pts, digits: dg });
      delete state.open[id]; return;
    }
    for (let k = tr.tpHits + 1; k <= 3; k++) {
      const level = tr["tp" + k];
      const hit = long ? b.h >= level : b.l <= level;
      if (!hit) break;
      tr.tpHits = k;
      const pts = Math.abs(level - tr.entry);
      out.push({ id: "tp|" + id + "|" + k, title: "وصل الهدف " + k + " · " + inst.name + " · " + tr.tf.toUpperCase(),
        body: label + "\nالسعر " + fmt(inst, level) + " · +" + fmtMove(inst, pts) });
      hist.push({ t: now, kind: "tp" + k, inst: inst.name, tf: tr.tf, profile: tr.profile || "", dir: tr.dir, entry: tr.entry, pts: pts, digits: dg });
      if (k === 3) {
        hist.push({ t: now, kind: "win", inst: inst.name, tf: tr.tf, profile: tr.profile || "", dir: tr.dir, entry: tr.entry, pts: Math.abs(tr.tp3 - tr.entry), digits: dg });
        delete state.open[id]; return;
      }
    }
  }
}
// KV free plan: 1,000 writes per day for the whole account. Everything the monitor keeps (open trades,
// seen setups, the notification feed and the trade history) lives in ONE key, written only when it
// changed. The candle archive is saved every 6 hours.
async function loadState(env) {
  const raw = await env.MONITOR_KV.get("state");
  const state = raw ? JSON.parse(raw) : { init: false, seen: {}, open: {} };
  if (!state.history) { try { state.history = JSON.parse((await env.MONITOR_KV.get("history")) || "[]"); } catch (e) { state.history = []; } }
  if (!state.feed) { try { const l = JSON.parse((await env.MONITOR_KV.get("latest")) || "{}"); state.feed = (l.items || []).map(it => Object.assign({ at: l.at || Date.now() }, it)); } catch (e) { state.feed = []; } }
  return { state, before: JSON.stringify(state) };
}

// ---------------- economic news: calendar, headlines and news alerts ----------------
// Calendar: Forex Factory weekly feed (no key). Headlines: FXStreet RSS (Arabic + English).
// Both are cached at the edge, so the every-minute cron does not hit the sources each time.
const NEWS_TZ = "Europe/Helsinki";
const CAL_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";
const RSS = [
  { url: "https://ar.fxstreet.com/rss/news", source: "FXStreet العربية", lang: "ar" },
  { url: "https://xml.fxstreet.com/news/forex-news/index.xml", source: "FXStreet", lang: "en" }
];
const WATCH = ["USD", "EUR", "GBP", "CNY", "ALL"]; // currencies that move gold, EUR/USD, GBP/USD, BTC
async function cachedFetch(url, ttl) {
  const r = await fetch(url, { cf: { cacheTtl: ttl, cacheEverything: true }, headers: { "user-agent": "BaqerSniper/1.0 (+https://baqersniper.pages.dev)" } });
  if (!r.ok) throw new Error(url + " HTTP " + r.status);
  return r;
}
async function getCalendar() {
  const rows = await (await cachedFetch(CAL_URL, 1800)).json();
  return (Array.isArray(rows) ? rows : []).map(e => {
    const t = Date.parse(e.date);
    const imp = /high/i.test(e.impact) ? 3 : /medium/i.test(e.impact) ? 2 : /holiday/i.test(e.impact) ? 0 : 1;
    return { id: "ff|" + e.country + "|" + e.title + "|" + t, t: t, cur: e.country || "", title: e.title || "", imp: imp,
      forecast: e.forecast || "", previous: e.previous || "", actual: e.actual || "" };
  }).filter(e => isFinite(e.t)).sort((a, b) => a.t - b.t);
}
function rssText(x, tag) {
  const m = new RegExp("<" + tag + "[^>]*>([\\s\\S]*?)</" + tag + ">", "i").exec(x);
  if (!m) return "";
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
}
async function getHeadlines() {
  const out = [];
  for (const f of RSS) {
    try {
      const xml = await (await cachedFetch(f.url, 600)).text();
      const items = xml.split(/<item[\s>]/i).slice(1);
      for (const it of items.slice(0, 15)) {
        const title = rssText(it, "title"), link = rssText(it, "link"), t = Date.parse(rssText(it, "pubDate"));
        if (!title || !/^https:\/\//.test(link) || !isFinite(t)) continue;
        if (Date.now() - t > 3 * 864e5) continue; // old items are left out
        out.push({ title: title.slice(0, 200), link: link, t: t, source: f.source, lang: f.lang, summary: rssText(it, "description").slice(0, 240) });
      }
    } catch (e) {}
  }
  return out.sort((a, b) => b.t - a.t).slice(0, 30);
}
const hm = t => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: NEWS_TZ });
const dayKey = t => new Date(t).toLocaleDateString("en-CA", { timeZone: NEWS_TZ });
const IMP_AR = { 3: "قوي", 2: "متوسط", 1: "ضعيف", 0: "عطلة" };
// Called from run(): a morning summary of today's strong news (08:00 local) and an alert 15 minutes
// before each strong (high impact) release. Each message once (ids kept in state.newsSent).
async function newsTick(state, out, now) {
  let cal;
  try { cal = await getCalendar(); } catch (e) { return; }
  state.newsSent = state.newsSent || {};
  const today = dayKey(now), local = new Date(now).toLocaleTimeString("en-GB", { hour: "2-digit", hour12: false, timeZone: NEWS_TZ });
  const strong = cal.filter(e => e.imp === 3 && WATCH.includes(e.cur));
  const todays = strong.filter(e => dayKey(e.t) === today && e.t > now - 3600e3);
  const briefId = "brief|" + today;
  if (+local >= 8 && !state.newsSent[briefId]) {
    state.newsSent[briefId] = now;
    out.push(todays.length
      ? { id: briefId, title: "أخبار اليوم القوية · " + todays.length, body: todays.slice(0, 6).map(e => hm(e.t) + " " + e.cur + " · " + e.title).join("\n") + "\nالمصدر: Forex Factory" }
      : { id: briefId, title: "أخبار اليوم", body: "لا توجد أخبار قوية اليوم على الدولار واليورو والباوند.\nالمصدر: Forex Factory" });
  }
  // Releases at the same minute (e.g. CPI m/m + core CPI) go out as one message.
  const groups = {};
  for (const e of strong) { const lead = e.t - now; if (lead > 15 * 60e3 || lead < 0) continue; (groups[e.t] = groups[e.t] || []).push(e); }
  for (const t of Object.keys(groups)) {
    const g = groups[t], id = "soon|" + g.map(e => e.id).join(",");
    if (g.every(e => state.newsSent["soon|" + e.id])) continue;
    g.forEach(e => { state.newsSent["soon|" + e.id] = now; });
    const lead = +t - now, curs = Array.from(new Set(g.map(e => e.cur))).join(" / ");
    out.push({ id: id.slice(0, 180), title: "بعد " + Math.max(1, Math.round(lead / 60e3)) + " دقيقة: خبر قوي · " + curs,
      body: g.slice(0, 4).map(e => e.title + (e.forecast ? " · المتوقع " + e.forecast : "") + (e.previous ? " · السابق " + e.previous : "")).join("\n") +
        "\n" + hm(+t) + " · تقلب متوقع، انتبه لصفقاتك · المصدر: Forex Factory" });
  }
  for (const k of Object.keys(state.newsSent)) if (now - state.newsSent[k] > 8 * 864e5) delete state.newsSent[k];
}
async function run(env) {
  const skipped = [];
  const { state, before } = await loadState(env);
  const hist = state.history;
  const now = Date.now(), firstRun = !state.init, out = [];
  const histDue = now - (state.histAt || 0) >= 6 * 3600e3;

  for (const inst of INSTR) {
    for (const tf of TFS) {
      let bars;
      try { bars = await fetchBars(inst.sym, tf); } catch (e) { skipped.push(inst.id + " " + tf + ": " + e.message); continue; }
      // Closed candles only: the forming candle never produces (or changes) a signal.
      // The live bars (with the forming candle) are still used for the current price and for exits.
      const live = bars, priceNow = live[live.length - 1].c;
      bars = A.closedBars(bars, TF_MS[tf], now);
      if (bars.length < 60) continue;
      if (histDue) await saveHist(env, inst.id, tf, bars);
      const last = bars[bars.length - 1];
      const fresh = now - (last.t + TF_MS[tf]) <= 2 * TF_MS[tf];
      for (const profile of PROFILES) {
        const r = A.analyze(bars, profile, null);
        if (!(r.ready && r.signal)) continue;
        const sig = r.signal;
        // Same rules as the app (analysis.js isRepeat): one setup = instrument + timeframe + direction +
        // the closed candle it formed on; silent while that direction is open and for a few candles after.
        const id = A.setupId(inst.id, tf, sig.dir, last.t);
        const known = Object.values(state.open).map(t => ({ inst: t.inst, tf: t.tf, dir: t.dir, t: t.t, status: "open" })).concat(state.recent || []);
        if (state.seen[id] || A.isRepeat(known, inst.id, tf, sig.dir, last.t, TF_MS[tf])) continue;
        state.seen[id] = now;
        state.recent = (state.recent || []).concat([{ inst: inst.id, tf: tf, dir: sig.dir, t: last.t, status: "seen" }]).slice(-300);
        // Late setup: the price already reached the first target before we could announce it.
        const risk = Math.abs(sig.entry - sig.sl) || 1, moved = (sig.dir === "LONG" ? priceNow - sig.entry : sig.entry - priceNow);
        if (!firstRun && fresh && moved >= Math.abs(sig.tp1 - sig.entry)) {
          hist.push({ t: now, kind: "late", inst: inst.name, tf: tf, profile: profile, dir: sig.dir, entry: sig.entry, digits: inst.digits });
          continue;
        }
        if (!firstRun && fresh) {
          const m = setupMsg(inst, tf, profile, sig, priceNow, moved / risk);
          state.open[id] = { inst: inst.id, tf: tf, profile: profile, dir: sig.dir, entry: sig.entry, sl: sig.sl,
            tp1: sig.tp1, tp2: sig.tp2, tp3: sig.tp3, tpHits: 0, t: last.t };
          out.push({ id: "new|" + id, title: m.title, body: m.body });
          hist.push({ t: now, kind: "open", inst: inst.name, tf: tf, profile: profile, dir: sig.dir, entry: sig.entry, digits: inst.digits });
        }
      }
      for (const id of Object.keys(state.open)) {
        const tr = state.open[id];
        if (tr.inst !== inst.id || tr.tf !== tf) continue;
        manage(tr, id, live, inst, now, out, hist, state);
      }
    }
  }
  const cutoff = now - 30 * 864e5;
  for (const k of Object.keys(state.seen)) if (state.seen[k] < cutoff) delete state.seen[k];
  state.recent = (state.recent || []).filter(r => now - r.t < 14 * 864e5);
  try { await newsTick(state, out, now); } catch (e) { skipped.push("news: " + e.message); }
  state.init = true;
  if (histDue) state.histAt = now;
  while (hist.length > 200) hist.shift();
  // Notification feed: the last 40 messages stay available, so a push that reaches the phone late
  // still shows the entry message and not only the later target/stop messages.
  if (out.length) state.feed = (state.feed || []).concat(out.map(it => Object.assign({ at: now }, it))).slice(-40);
  const hourly = now - (state.beatAt || 0) >= 3600e3;
  if (hourly) state.beatAt = now;
  if (JSON.stringify(state) !== before) await env.MONITOR_KV.put("state", JSON.stringify(state));
  if (out.length) await pushAll(env);
  console.log("run done: " + out.length + " notifications" + (firstRun ? " (first run: history recorded silently)" : ""));
  return { firstRun: firstRun, notifications: out.length, skipped: skipped, write: hourly || out.length > 0 };
}
async function runSafe(env) {
  const at = Date.now();
  try {
    const info = await run(env);
    // The run status is written at most once an hour (or when something was sent) to save KV writes.
    if (info.write) await env.MONITOR_KV.put("lastrun", JSON.stringify(Object.assign({ ok: true, at: at, finished: Date.now() }, info)));
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
    const res = e.kind === "late" ? "فاتت (وصل الهدف قبل الإشعار)" : e.kind === "open" ? "دخول / entry" : e.kind === "win" ? "ربح / win" : e.kind === "loss" ? "خسارة / loss" : "وصل الهدف " + e.kind.slice(2);
    const cls = e.kind === "win" ? "w" : e.kind === "loss" ? "l" : "o";
    const pts = (e.kind === "open" || e.kind === "late") ? "" : (e.pts >= 0 ? "+" : "") + d(e.digits, e.pts) + " pts";
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

// CSV export for MT5 (Custom Symbols import). Usage: /export.csv?symbol=XAU&tf=15m
async function exportCsv(url) {
  const id = url.searchParams.get("symbol") || "XAU";
  const tf = url.searchParams.get("tf") || "15m";
  const inst = INSTR.find(x => x.id === id);
  if (!inst || !TF_MS[tf]) return new Response("usage: /export.csv?symbol=XAU|EURUSD|GBPUSD|BTC&tf=15m|1h|4h", { status: 400 });
  const bars = await fetchBars(inst.sym, tf);
  const pad = n => String(n).padStart(2, "0");
  const lines = ["Date,Time,Open,High,Low,Close,Volume"];
  for (const b of bars) {
    const d = new Date(b.t);
    const date = d.getUTCFullYear() + "." + pad(d.getUTCMonth() + 1) + "." + pad(d.getUTCDate());
    const time = pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()) + ":00";
    lines.push([date, time, b.o.toFixed(inst.digits), b.h.toFixed(inst.digits), b.l.toFixed(inst.digits), b.c.toFixed(inst.digits), b.v].join(","));
  }
  return new Response(lines.join("\n") + "\n", { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "inline; filename=" + inst.sym + "_" + tf + ".csv" } });
}

// Backtest with the same engine as the app: /backtest?symbol=XAU&tf=15m&profile=balanced
async function backtestRoute(url, env) {
  const id = url.searchParams.get("symbol") || "XAU";
  const tf = url.searchParams.get("tf") || "15m";
  const profile = url.searchParams.get("profile") || "balanced";
  const inst = INSTR.find(x => x.id === id);
  if (!inst || !TF_MS[tf]) return new Response("usage: /backtest?symbol=XAU|EURUSD|GBPUSD|BTC&tf=15m|1h|4h&profile=balanced|sniper", { status: 400 });
  let bars = await fetchBars(inst.sym, tf);
  const archived = url.searchParams.get("src") === "live" ? [] : await getHist(env, inst.id, tf);
  if (archived.length > bars.length) bars = archived;
  if (bars.length < 80) return new Response("not enough bars: " + bars.length, { status: 500 });
  const r = A.backtest(bars, 120, profile);
  const f = (v, d) => (v == null || isNaN(v) ? "—" : Number(v).toFixed(d));
  const rows = r.trades.slice().reverse().map(t => {
    const dt = new Date(bars[t.i].t).toISOString().replace("T", " ").slice(0, 16);
    const res = t.outcome === "tp1" ? "ربح / win" : t.outcome === "stop" ? "خسارة / loss" : "انتهى الوقت";
    return "<tr class=\"" + (t.R > 0 ? "w" : t.R < 0 ? "l" : "o") + "\"><td>" + dt + "</td><td>" + (t.dir === "LONG" ? "شراء" : "بيع") +
      "</td><td>" + t.grade + "</td><td>" + res + "</td><td>" + (t.R >= 0 ? "+" : "") + f(t.R, 2) + "R</td></tr>";
  }).join("");
  const html = '<!doctype html><html dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>باك تيست</title>' +
    '<style>body{font-family:system-ui,sans-serif;background:#0b1424;color:#eee;margin:16px}table{width:100%;border-collapse:collapse;font-size:14px}td,th{border-bottom:1px solid #1e2c44;padding:6px;text-align:start}.w td:nth-child(5){color:#6fd08c}.l td:nth-child(5){color:#ff6b6b}h2{color:#e8c35a}</style></head>' +
    "<body><h2>باك تيست: " + inst.name + " · " + tf + " · " + profile + "</h2>" +
    "<p>" + (archived.length > 0 && bars === archived ? "من الأرشيف" : "من biquote المباشر") + " · الشموع: " + bars.length + " · الصفقات: " + r.count + " · الرابحة: " + r.wins + " · نسبة الربح: " + f(r.winRate * 100, 1) + "% · الصافي: " + f(r.netR, 2) + "R · عامل الربح: " + f(r.profitFactor, 2) + "</p>" +
    '<table><tr><th>الوقت UTC</th><th>الاتجاه</th><th>الدرجة</th><th>النتيجة</th><th>R</th></tr>' +
    (rows || '<tr><td colspan="5">لا توجد صفقات في هذه البيانات</td></tr>') + "</table></body></html>";
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(runSafe(env)); },
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === "/vapid-public") { const v = await getVapid(env); return json({ key: v.pub }); }
    if (url.pathname === "/history") { const h = (await loadState(env)).state.history || []; return new Response(historyHtml(h), { headers: { "content-type": "text/html; charset=utf-8" } }); }
    if (url.pathname === "/backtest") return backtestRoute(url, env);
    if (url.pathname === "/export.csv") return exportCsv(url);
    if (url.pathname === "/status") { const r = await env.MONITOR_KV.get("lastrun"); return json(r ? JSON.parse(r) : { note: "no run yet" }); }
    // Calendar (this week) and latest headlines, with their sources, for the app's news page.
    if (url.pathname === "/news") {
      let calendar = [], headlines = [], err = null;
      try { calendar = await getCalendar(); } catch (e) { err = e.message; }
      try { headlines = await getHeadlines(); } catch (e) {}
      return new Response(JSON.stringify({ at: Date.now(), calendar: calendar, headlines: headlines, error: err,
        sources: [{ name: "Forex Factory", url: "https://www.forexfactory.com/calendar", what: "الأجندة الاقتصادية" }, { name: "FXStreet", url: "https://www.fxstreet.com/news", what: "الأخبار" }] }),
        { headers: Object.assign({ "content-type": "application/json", "cache-control": "public, max-age=120" }, CORS) });
    }
    // Open trades (the ones the phone was told about), so the app shows the same trade.
    if (url.pathname === "/open") { const st = (await loadState(env)).state; return json({ at: Date.now(), open: Object.keys(st.open || {}).map(id => Object.assign({ id: id }, st.open[id])) }); }
    if (url.pathname === "/latest") { const st = (await loadState(env)).state; return json({ at: Date.now(), items: st.feed || [] }); }
    if (url.pathname === "/unsubscribe" && req.method === "POST") {
      let sub; try { sub = await req.json(); } catch (e) { return json({ error: "bad json" }, 400); }
      const subs = (await getSubs(env)).filter(s => !sub || s.endpoint !== sub.endpoint);
      await env.MONITOR_KV.put("subs", JSON.stringify(subs));
      return json({ ok: true, left: subs.length });
    }
    if (url.pathname === "/subscribe" && req.method === "POST") {
      let sub; try { sub = await req.json(); } catch (e) { return json({ error: "bad json" }, 400); }
      if (!sub || typeof sub.endpoint !== "string" || !sub.endpoint.startsWith("https://")) return json({ error: "bad subscription" }, 400);
      const subs = (await getSubs(env)).filter(s => s.endpoint !== sub.endpoint);
      subs.push({ endpoint: sub.endpoint, keys: sub.keys || {} });
      await env.MONITOR_KV.put("subs", JSON.stringify(subs.slice(-50)));
      return json({ ok: true }, 201);
    }
    if (url.pathname === "/test") {
      const { state } = await loadState(env);
      state.feed = (state.feed || []).concat([{ id: "test|" + Date.now(), at: Date.now(), title: "اختبار الإشعارات", body: "الإشعارات تعمل من التطبيق. هذه ليست إشارة تداول." }]).slice(-40);
      await env.MONITOR_KV.put("state", JSON.stringify(state));
      await pushAll(env);
      return json({ ok: true });
    }
    return new Response("baqer monitor ok", { headers: { "content-type": "text/plain" } });
  }
};
