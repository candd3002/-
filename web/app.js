(function () {
  "use strict";
  var A = window.Analysis;
  var NS = "http://www.w3.org/2000/svg";
  var TF_MS = { "15m": 15 * 60e3, "1h": 60 * 60e3, "4h": 4 * 60 * 60e3 };
  var TF_NAME = { "15m": "15M", "1h": "1H", "4h": "4H" };

  // Only BTC has a keyless live feed. Other instruments use CSV from MT5 or labelled sample candles.
  var INST = [
    { id: "BTC",    name: "BTC/USDT",   digits: 2, live: true,  base: 91527,  vol: 0.0036, seed: 11 },
    { id: "XAU",    name: "XAU/USD",    digits: 2,              base: 3716,   vol: 0.0028, seed: 23 },
    { id: "XAG",    name: "XAG/USD",    digits: 3,              base: 52.40,  vol: 0.0045, seed: 31 },
    { id: "EURUSD", name: "EUR/USD",    digits: 5,              base: 1.1650, vol: 0.0007, seed: 41 },
    { id: "GBPUSD", name: "GBP/USD",    digits: 5,              base: 1.3420, vol: 0.0008, seed: 53 },
    { id: "NAS100", name: "NASDAQ 100", digits: 2,              base: 25400,  vol: 0.0032, seed: 67 }
  ];
  var BY = {};
  INST.forEach(function (x) { BY[x.id] = x; });

  var st = { inst: "BTC", tf: "1h", profile: "balanced", btc: null, btcFetchedTf: null, btcChange: null,
             csv: {}, res: null, lastSig: null, ws: null, poll: null };

  function $(id) { return document.getElementById(id); }
  function txt(id, t) { var e = $(id); if (e) e.textContent = t; }
  function fmtD(v, d) {
    if (v == null || isNaN(v)) return "—";
    return v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function fmt(v) { return fmtD(v, BY[st.inst].digits); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  // ---------- candles ----------
  function sampleFor(x) { return A.sampleCandles(x.base, x.vol, 500, x.seed); }
  function candlesFor(id) {
    if (id === "BTC") return st.btc || sampleFor(BY.BTC);
    return st.csv[id] || sampleFor(BY[id]);
  }
  function sourceFor(id) {
    if (id === "BTC") return st.btc && st.btcFetchedTf ? "Binance · live" : "Sample";
    return st.csv[id] ? "CSV file" : "Sample";
  }
  function changeFor(id) {
    if (id === "BTC" && st.btcChange != null) return st.btcChange;
    var c = candlesFor(id), from = c[Math.max(0, c.length - 25)].o, last = c[c.length - 1].c;
    return (last - from) / from * 100;
  }

  // ---------- loading ----------
  function klines(tf) {
    return fetch("https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=" + tf + "&limit=500")
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (rows) { return rows.map(function (k) { return { t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] }; }); });
  }
  function change24h() {
    return fetch("https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT")
      .then(function (r) { return r.json(); }).then(function (j) { return +j.priceChangePercent; });
  }
  function loadBtc() {
    return klines(st.tf).then(function (c) { st.btc = c; st.btcFetchedTf = st.tf; live(true); })
      .catch(function () { st.btc = null; st.btcFetchedTf = null; live(false); });
  }
  function parseCSV(text) {
    var lines = text.split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (lines.length < 61) throw new Error("The file needs at least 60 candles.");
    var head = lines[0].split(/[,;\t]/).map(function (s) { return s.trim().toLowerCase().replace(/[<>]/g, ""); });
    var idx = { o: 2, h: 3, l: 4, c: 5 }, start = 0;
    if (/[a-z]/i.test(lines[0])) {
      start = 1;
      var f = function (names) { for (var k = 0; k < head.length; k++) if (names.indexOf(head[k]) >= 0) return k; return -1; };
      idx = { o: f(["open"]), h: f(["high"]), l: f(["low"]), c: f(["close"]) };
      if (idx.o < 0 || idx.h < 0 || idx.l < 0 || idx.c < 0) throw new Error("Could not find open, high, low, close columns.");
    }
    var out = [];
    for (var i = start; i < lines.length; i++) {
      var p = lines[i].split(/[,;\t]/);
      var o = +p[idx.o], h = +p[idx.h], l = +p[idx.l], c = +p[idx.c];
      if ([o, h, l, c].some(isNaN)) continue;
      out.push({ t: i, o: o, h: h, l: l, c: c, v: 1 });
    }
    if (out.length < 60) throw new Error("Fewer than 60 valid candles.");
    return out.slice(-500);
  }
  function live(on) {
    var box = $("live"); if (box) box.classList.toggle("off", !on);
    txt("live-text", on ? "Live" : "Sample");
  }
  function stopStreams() {
    if (st.ws) { try { st.ws.close(); } catch (e) {} st.ws = null; }
    if (st.poll) { clearInterval(st.poll); st.poll = null; }
  }
  function connect() {
    stopStreams();
    if (st.inst !== "BTC") return;
    if (!("WebSocket" in window)) { st.poll = setInterval(refresh, 30000); return; }
    try {
      var ws = new WebSocket("wss://stream.binance.com:9443/ws/btcusdt@kline_" + st.tf);
      st.ws = ws;
      ws.onmessage = function (ev) {
        var k = JSON.parse(ev.data).k;
        if (!k || !st.btc) return;
        var bar = { t: k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v };
        var last = st.btc[st.btc.length - 1];
        if (last && last.t === bar.t) st.btc[st.btc.length - 1] = bar;
        else if (bar.t > last.t) { st.btc.push(bar); if (st.btc.length > 500) st.btc.shift(); }
        live(true);
        analyzeAndRender();
      };
      ws.onerror = function () { live(false); };
      ws.onclose = function () { if (st.ws === ws && st.inst === "BTC") st.poll = st.poll || setInterval(refresh, 30000); };
    } catch (e) { st.poll = setInterval(refresh, 30000); }
  }
  function refresh() {
    var p = st.inst === "BTC" && st.btcFetchedTf !== st.tf ? loadBtc() : Promise.resolve();
    p.then(analyzeAndRender);
  }

  // ---------- analysis and render ----------
  function analyzeAndRender() {
    var c = candlesFor(st.inst);
    st.res = A.analyze(c, st.profile, learnFromJournal());
    journalUpdate();
    renderTickers();
    render();
    renderJournal();
    notifyIfNew(st.res);
  }

  function renderTickers() {
    var row = $("tickers"); if (!row) return;
    row.textContent = "";
    INST.forEach(function (x) {
      var c = candlesFor(x.id), last = c[c.length - 1].c, ch = changeFor(x.id);
      var b = el("button", "tk" + (x.id === st.inst ? " on" : ""));
      b.type = "button"; b.setAttribute("aria-pressed", String(x.id === st.inst));
      b.appendChild(el("span", "sym", x.name));
      b.appendChild(el("span", "px", fmtD(last, x.digits)));
      b.appendChild(el("span", "pct" + (ch < 0 ? " neg" : ""), (ch >= 0 ? "+" : "") + ch.toFixed(2) + "%"));
      b.addEventListener("click", function () { setInst(x.id); });
      row.appendChild(b);
    });
    txt("asset-name", BY[st.inst].name);
    txt("src", sourceFor(st.inst));
  }

  function render() {
    var r = st.res;
    if (!r || !r.ready) { txt("trend-line", r ? r.reason : "Loading…"); return; }
    var s = r.signal, sell = s && s.dir === "SHORT", buy = s && s.dir === "LONG";
    var cls = buy ? "buy" : sell ? "sell" : "wait";
    var conf = Math.min(99, Math.round(Math.max(r.longScore, r.shortScore) / 12 * 100));

    txt("tf-name", TF_NAME[st.tf]);
    txt("chart-title", "Structure · " + TF_NAME[st.tf]);
    document.querySelectorAll("[data-tf]").forEach(function (b) { b.setAttribute("aria-selected", String(b.getAttribute("data-tf") === st.tf)); });

    var badge = $("signal-badge");
    badge.className = "badge " + cls;
    badge.textContent = s ? (sell ? "SELL" : "BUY") + " · " + conf : "WAIT · " + conf;

    var trendTxt = r.trend === "bear" ? "Institutional short-term downtrend"
      : r.trend === "bull" ? "Institutional short-term uptrend" : "Ranging, accumulating";
    if (!s && r.reasons.length && r.trend == null) trendTxt = r.status;
    var tl = $("trend-line"); tl.textContent = trendTxt; tl.className = "trend " + cls;

    var tb = $("trend-bar");
    tb.style.width = Math.min(100, Math.round(Math.abs(r.longScore - r.shortScore) / 12 * 100)) + "%";
    tb.className = r.longScore > r.shortScore ? "buy" : "";

    var arc = $("ring-arc");
    arc.setAttribute("stroke", buy ? "#33d69a" : sell ? "#ff6b6b" : "#7d7a72");
    arc.setAttribute("stroke-dasharray", (conf / 100 * 195).toFixed(1) + " 195");
    txt("ring-num", String(conf));

    txt("chart-price", fmt(r.price));
    renderChart(r);

    txt("z-ob", r.ob ? fmt(r.ob.lo) + " – " + fmt(r.ob.hi) : "—");
    txt("z-fvg", r.fvg ? fmt(r.fvg.lo) + " – " + fmt(r.fvg.hi) : "—");
    txt("z-ssl", r.ssl != null ? fmt(r.ssl) : "—");
    txt("z-bsl", r.bsl != null ? fmt(r.bsl) : "—");

    if (s) {
      var rr = function (x) { return ((Math.abs(x - s.entry)) / s.risk).toFixed(1) + "R"; };
      txt("p-sl", fmt(s.sl)); txt("p-en", fmt(s.entry)); txt("p-t3", fmt(s.tp3));
      txt("p-t1", "TP1 " + rr(s.tp1)); txt("p-t2", "TP2 " + rr(s.tp2)); txt("p-t3b", "TP3 " + rr(s.tp3));
      txt("rr", "R : 1 → " + (Math.abs(s.tp3 - s.entry) / s.risk).toFixed(1));
    } else {
      txt("p-sl", "—"); txt("p-en", "—"); txt("p-t3", "—");
      txt("p-t1", "TP1 —"); txt("p-t2", "TP2 —"); txt("p-t3b", "TP3 —");
      txt("rr", "No active setup");
    }
    renderLevels(r);
    renderMarkets();
  }

  // ---------- chart: real candles with zones and levels ----------
  function svgEl(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }
  function renderChart(r) {
    var svg = $("chart"); if (!svg) return;
    svg.textContent = "";
    var c = candlesFor(st.inst), N = 60, off = Math.max(0, c.length - N), vis = c.slice(off);
    var W = 358, H = 170, padL = 4, areaR = 286, padT = 10, padB = 12;
    var lo = Infinity, hi = -Infinity;
    vis.forEach(function (k) { lo = Math.min(lo, k.l); hi = Math.max(hi, k.h); });
    var extra = [];
    if (r.signal) extra.push(r.signal.tp3, r.signal.sl);
    if (r.bsl != null) extra.push(r.bsl);
    if (r.ssl != null) extra.push(r.ssl);
    extra.forEach(function (v) { lo = Math.min(lo, v); hi = Math.max(hi, v); });
    var pad = (hi - lo) * 0.05; lo -= pad; hi += pad;
    function Y(p) { return padT + (hi - p) / (hi - lo) * (H - padT - padB); }
    var cw = (areaR - padL) / vis.length;
    function X(i) { return padL + i * cw + cw / 2; }

    var defs = svgEl("defs", {});
    var gu = svgEl("linearGradient", { id: "cUp", x1: 0, x2: 0, y1: 0, y2: 1 });
    gu.appendChild(svgEl("stop", { offset: 0, "stop-color": "#7ff5c8" }));
    gu.appendChild(svgEl("stop", { offset: 1, "stop-color": "#1ea877" }));
    var gd = svgEl("linearGradient", { id: "cDn", x1: 0, x2: 0, y1: 0, y2: 1 });
    gd.appendChild(svgEl("stop", { offset: 0, "stop-color": "#ffa3a3" }));
    gd.appendChild(svgEl("stop", { offset: 1, "stop-color": "#d93d48" }));
    var go = svgEl("linearGradient", { id: "obFill", x1: 0, x2: 0, y1: 0, y2: 1 });
    go.appendChild(svgEl("stop", { offset: 0, "stop-color": "#e8b44a", "stop-opacity": ".28" }));
    go.appendChild(svgEl("stop", { offset: 1, "stop-color": "#e8b44a", "stop-opacity": ".06" }));
    var glow = svgEl("filter", { id: "glow", x: "-20%", y: "-20%", width: "140%", height: "140%" });
    glow.appendChild(svgEl("feGaussianBlur", { stdDeviation: "1.1", result: "b" }));
    var mg = svgEl("feMerge", {}); mg.appendChild(svgEl("feMergeNode", { in: "b" })); mg.appendChild(svgEl("feMergeNode", { in: "SourceGraphic" }));
    glow.appendChild(mg);
    [gu, gd, go, glow].forEach(function (d) { defs.appendChild(d); });
    svg.appendChild(defs);

    function zone(z, fill, stroke, label) {
      if (!z) return;
      var s0 = Math.max(0, z.i - off), x0 = padL + s0 * cw, y0 = Y(z.hi), y1 = Y(z.lo);
      svg.appendChild(svgEl("rect", { x: x0, y: y0, width: areaR - x0, height: Math.max(2, y1 - y0), rx: 3, fill: fill, stroke: stroke || "none", "stroke-dasharray": stroke ? "3 3" : null }));
      var t = svgEl("text", { x: x0 + 4, y: y0 + 10, "font-family": "Inter, sans-serif", "font-size": 9, fill: stroke || "#e8b44a" });
      t.textContent = label; svg.appendChild(t);
    }
    if (r.ob && r.ob.i >= off) zone(r.ob, "url(#obFill)", null, "ORDER BLOCK");
    else if (r.ob) zone({ lo: r.ob.lo, hi: r.ob.hi, i: off }, "url(#obFill)", null, "ORDER BLOCK");
    if (r.fvg) zone(r.fvg, "rgba(127,184,255,.14)", "rgba(127,184,255,.45)", "FVG");

    function hline(price, color, label, dash, weight) {
      var y = Y(price);
      svg.appendChild(svgEl("line", { x1: 0, y1: y, x2: W, y2: y, stroke: color, "stroke-width": weight || 1, "stroke-dasharray": dash || null, opacity: dash ? 0.75 : 1 }));
      var t = svgEl("text", { x: areaR + 6, y: y + 3, "font-family": "Inter, sans-serif", "font-size": 9, fill: color });
      t.textContent = label; svg.appendChild(t);
    }

    vis.forEach(function (k, i) {
      var up = k.c >= k.o, x = X(i), col = up ? "#5ff0b5" : "#ff8a8a";
      svg.appendChild(svgEl("line", { x1: x, y1: Y(k.h), x2: x, y2: Y(k.l), stroke: col, "stroke-width": 1.1, opacity: 0.7 }));
    });
    var g = svgEl("g", { filter: "url(#glow)" });
    vis.forEach(function (k, i) {
      var up = k.c >= k.o, x = X(i);
      var top = Y(Math.max(k.o, k.c)), bot = Y(Math.min(k.o, k.c));
      g.appendChild(svgEl("rect", { x: x - cw * 0.32, y: top, width: cw * 0.64, height: Math.max(1, bot - top), rx: 1.5, fill: up ? "url(#cUp)" : "url(#cDn)" }));
    });
    svg.appendChild(g);

    if (r.bsl != null) hline(r.bsl, "#7fb8ff", "BSL " + fmt(r.bsl), "4 4");
    if (r.ev && r.ev.i >= off) {
      var ex = X(r.ev.i - off);
      var bos = svgEl("text", { x: Math.max(4, ex - 14), y: Y(r.ev.level) - 5, "font-family": "Inter, sans-serif", "font-size": 9, "font-weight": 700, fill: "#ff6b6b" });
      bos.textContent = r.ev.type; svg.appendChild(bos);
    }
    if (r.sweep && r.sweep.i >= off) {
      var sx = X(r.sweep.i - off), sy = Y(r.sweep.wick);
      svg.appendChild(svgEl("circle", { cx: sx, cy: sy, r: 4, fill: "none", stroke: "#e8b44a", "stroke-width": 1.5 }));
      svg.appendChild(svgEl("circle", { cx: sx, cy: sy, r: 1.6, fill: "#e8b44a" }));
    }
    if (r.signal) {
      var s = r.signal;
      hline(s.sl, "#ff6b6b", "SL " + fmt(s.sl));
      hline(s.entry, "#e8b44a", "ENTRY " + fmt(s.entry));
      hline(s.tp1, "#33d69a", "TP1 " + fmt(s.tp1), "4 4");
      hline(s.tp2, "#33d69a", "TP2 " + fmt(s.tp2), "4 4");
      hline(s.tp3, "#33d69a", "TP3 " + fmt(s.tp3), "4 4");
    }
    if (r.ssl != null) hline(r.ssl, "#ff8a8a", "SSL " + fmt(r.ssl), "4 4");
  }

  // ---------- three-level understanding ----------
  function renderLevels(r) {
    var box = $("analysis"); if (!box) return;
    box.textContent = "";
    var sty = A.story(r);
    if (!sty) { box.textContent = r && r.reason ? r.reason : "Loading…"; return; }
    [sty.l1, sty.l2, sty.l3].forEach(function (lv, idx) {
      var card = el("div", "lvl");
      var head = el("div", "lvl-h");
      head.appendChild(el("span", "lvl-n", String(idx + 1)));
      head.appendChild(el("b", "", lv.title));
      head.appendChild(el("span", "lvl-s", lv.state));
      var ul = el("ul", "lvl-l");
      lv.lines.forEach(function (t) { ul.appendChild(el("li", "", t)); });
      card.appendChild(head); card.appendChild(ul);
      box.appendChild(card);
    });
  }

  function renderMarkets() {
    var box = $("markets"); if (!box) return;
    box.textContent = "";
    INST.forEach(function (x) {
      var c = candlesFor(x.id), last = c[c.length - 1].c, ch = changeFor(x.id);
      var d = el("div", "muted");
      d.style.cssText = "display:flex;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.07)";
      d.appendChild(el("span", "", x.name + " · " + sourceFor(x.id)));
      d.appendChild(el("b", "", fmtD(last, x.digits) + "  " + (ch >= 0 ? "+" : "") + ch.toFixed(2) + "%"));
      box.appendChild(d);
    });
  }

  // ---------- trade journal: records signals, closes them at stop or target, learns ----------
  var JKEY = "baqerJournal";
  function loadJournal() { try { return JSON.parse(localStorage.getItem(JKEY) || "[]"); } catch (e) { return []; } }
  function saveJournal(j) { try { localStorage.setItem(JKEY, JSON.stringify(j.slice(-300))); } catch (e) {} }
  function journalStats(j) {
    var closed = j.filter(function (e) { return e.status !== "open"; });
    var wins = closed.filter(function (e) { return e.status === "win"; }).length;
    var byKey = {};
    closed.forEach(function (e) { var g = byKey[e.key] || (byKey[e.key] = { n: 0, w: 0 }); g.n++; if (e.status === "win") g.w++; });
    return { closed: closed.length, wins: wins, losses: closed.length - wins, byKey: byKey };
  }
  // Visible rule: a pattern that lost most of its last trades (6+ closed, under 25% wins) is paused;
  // poor overall results (5+ closed, under 40% wins) require 2 more points before a decision.
  function learnFromJournal() {
    var s = journalStats(loadJournal()), block = [];
    Object.keys(s.byKey).forEach(function (k) { var g = s.byKey[k]; if (g.n >= 6 && g.w / g.n < 0.25) block.push(k); });
    var overall = s.closed >= 5 ? s.wins / s.closed : 1;
    return { extra: overall < 0.4 ? 2 : 0, block: block };
  }
  function journalUpdate() {
    var j = loadJournal(), changed = false, r = st.res;
    if (r && r.ready && r.signal) {
      var sg = r.signal, d = BY[st.inst].digits, c = candlesFor(st.inst), t = c[c.length - 1].t;
      var id = st.inst + "|" + sg.key + "|" + sg.entry.toFixed(d);
      if (!j.some(function (e) { return e.id === id; })) {
        j.push({ id: id, inst: st.inst, key: sg.key, dir: sg.dir, entry: sg.entry, sl: sg.sl, tp1: sg.tp1, t: t, status: "open" });
        changed = true;
      }
    }
    j.forEach(function (e) {
      if (e.status !== "open") return;
      var c = candlesFor(e.inst), long = e.dir === "LONG";
      for (var i = 0; i < c.length; i++) {
        if (!(c[i].t > e.t)) continue;
        var hitStop = long ? c[i].l <= e.sl : c[i].h >= e.sl;
        var hitTP = long ? c[i].h >= e.tp1 : c[i].l <= e.tp1;
        if (hitStop) { e.status = "loss"; changed = true; break; }
        if (hitTP) { e.status = "win"; changed = true; break; }
      }
    });
    if (changed) saveJournal(j);
  }
  function renderJournal() {
    var box = $("journal-box"); if (!box) return;
    var s = journalStats(loadJournal()), L = learnFromJournal();
    box.textContent = "";
    box.appendChild(el("h2", "", "Trade journal"));
    box.appendChild(el("p", "muted", s.closed
      ? "Closed trades: " + s.closed + " · wins: " + s.wins + " · losses: " + s.losses + " · win rate: " + Math.round(s.wins / s.closed * 100) + "%"
      : "No closed trades yet. Every signal is recorded and closes at its stop or first target."));
    box.appendChild(el("p", "muted", (L.extra ? "After recent losses, decisions need 2 more points. " : "") +
      (L.block.length ? "Paused patterns: " + L.block.length + "." : "")));
    var btn = el("button", "btn", "Clear journal");
    btn.type = "button";
    btn.addEventListener("click", function () { saveJournal([]); analyzeAndRender(); });
    box.appendChild(btn);
  }

  // ---------- alerts ----------
  function notifyIfNew(r) {
    if (!r || !r.signal) return;
    var key = st.inst + ":" + r.signal.dir + ":" + r.signal.entry.toFixed(BY[st.inst].digits);
    if (key === st.lastSig) return;
    st.lastSig = key;
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("Baqer Sniper · " + BY[st.inst].name + ": " + (r.signal.dir === "LONG" ? "Buy" : "Sell"),
        { body: "Entry " + fmt(r.signal.entry) + " · Stop " + fmt(r.signal.sl) });
    }
  }

  // ---------- views and controls ----------
  function setView(v) {
    $("app").setAttribute("data-view", v);
    document.querySelectorAll(".nav button").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-tab") === v); });
    ["markets", "alerts", "settings", "calendar"].forEach(function (p) { var e = $(p + "-panel"); if (e) e.hidden = p !== v; });
    if (v === "analysis") render();
  }
  function setInst(id) {
    st.inst = id;
    if (id === "BTC") { loadBtc().then(function () { connect(); analyzeAndRender(); }); }
    else { stopStreams(); live(false); analyzeAndRender(); }
    var sel = $("inst-select"); if (sel) sel.value = id;
  }
  function setTf(tf) {
    st.tf = tf; tick();
    if (st.inst === "BTC") loadBtc().then(function () { connect(); analyzeAndRender(); });
    else analyzeAndRender();
  }

  document.querySelectorAll("[data-tf]").forEach(function (b) {
    b.addEventListener("click", function () { setTf(b.getAttribute("data-tf")); });
  });
  document.querySelectorAll(".nav [data-tab]").forEach(function (b) {
    b.addEventListener("click", function () { setView(b.getAttribute("data-tab")); });
  });
  $("notify-btn").addEventListener("click", function () {
    if (!("Notification" in window)) { txt("alerts-note", "This browser does not support notifications."); return; }
    Notification.requestPermission().then(function (p) { txt("alerts-note", p === "granted" ? "Notifications are on." : "Notifications were not enabled."); });
  });

  var sel = $("inst-select");
  INST.forEach(function (x) { var o = el("option", "", x.name); o.value = x.id; sel.appendChild(o); });
  sel.value = st.inst;
  sel.addEventListener("change", function () { setInst(sel.value); });

  $("csv").addEventListener("change", function (ev) {
    var f = ev.target.files && ev.target.files[0]; if (!f) return;
    var target = sel.value, rd = new FileReader();
    rd.onload = function () {
      try {
        st.csv[target] = parseCSV(String(rd.result));
        txt("csv-note", BY[target].name + ": loaded " + st.csv[target].length + " candles.");
        if (st.inst === target) analyzeAndRender(); else renderTickers();
      } catch (e) { txt("csv-note", e.message); }
    };
    rd.readAsText(f);
  });

  var prof = $("profile");
  try { st.profile = localStorage.getItem("sniperProfile") || "balanced"; } catch (e) {}
  prof.value = st.profile;
  prof.addEventListener("change", function () {
    st.profile = prof.value;
    try { localStorage.setItem("sniperProfile", st.profile); } catch (e) {}
    analyzeAndRender();
  });

  function tick() {
    var ms = TF_MS[st.tf], left = ms - (Date.now() % ms), s = Math.floor(left / 1000);
    txt("clock", [Math.floor(s / 3600), Math.floor(s % 3600 / 60), s % 60].map(function (n) { return String(n).padStart(2, "0"); }).join(":"));
  }

  // ---------- boot ----------
  setView("analysis");
  setInterval(tick, 1000); tick();
  loadBtc().then(function () { connect(); analyzeAndRender(); });
  change24h().then(function (c) { st.btcChange = c; renderTickers(); }).catch(function () {});
  setInterval(function () { change24h().then(function (c) { st.btcChange = c; renderTickers(); }).catch(function () {}); }, 60000);
})();
