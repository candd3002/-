(function () {
  "use strict";
  var A = window.Analysis;
  var TF_MS = { "15m": 15 * 60e3, "1h": 60 * 60e3, "4h": 4 * 60 * 60e3 };
  var SAMPLE = { BTC: { base: 91527, vol: 0.0036, seed: 11 }, XAU: { base: 3716, vol: 0.0028, seed: 23 } };
  var st = { tf: "1h", view: "analysis", btc: null, btcChange: null, xau: null, xauSrc: "تجريبي", csv: null,
             res: null, lastSig: null, ws: null, poll: null };

  function $(id) { return document.getElementById(id); }
  function fmt(v) { return v == null || isNaN(v) ? "—" : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function txt(id, t) { var e = $(id); if (e) e.textContent = t; }

  // ---------- data ----------
  function klines(tf) {
    return fetch("https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=" + tf + "&limit=500")
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (rows) { return rows.map(function (k) { return { t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] }; }); });
  }
  function change24h() {
    return fetch("https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT")
      .then(function (r) { return r.json(); }).then(function (j) { return +j.priceChangePercent; });
  }
  function parseCSV(text) {
    var lines = text.split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (lines.length < 61) throw new Error("الملف يحتاج 60 شمعة على الأقل");
    var head = lines[0].split(/[,;\t]/).map(function (s) { return s.trim().toLowerCase().replace(/[<>]/g, ""); });
    var idx = { o: 2, h: 3, l: 4, c: 5 }, start = 0;
    if (/[a-z]/i.test(lines[0])) {
      start = 1;
      var f = function (names) { for (var k = 0; k < head.length; k++) if (names.indexOf(head[k]) >= 0) return k; return -1; };
      idx = { o: f(["open"]), h: f(["high"]), l: f(["low"]), c: f(["close"]) };
      if (idx.o < 0 || idx.h < 0 || idx.l < 0 || idx.c < 0) throw new Error("لم أجد أعمدة open/high/low/close");
    }
    var out = [];
    for (var i = start; i < lines.length; i++) {
      var p = lines[i].split(/[,;\t]/);
      var o = +p[idx.o], h = +p[idx.h], l = +p[idx.l], c = +p[idx.c];
      if ([o, h, l, c].some(isNaN)) continue;
      out.push({ t: i, o: o, h: h, l: l, c: c, v: 1 });
    }
    if (out.length < 60) throw new Error("عدد الشموع الصالحة أقل من 60");
    return out.slice(-500);
  }

  function gold() {
    if (st.csv) return st.csv;
    var g = SAMPLE.XAU;
    return A.sampleCandles(g.base, g.vol, 500, g.seed);
  }

  function refreshBtc() {
    return klines(st.tf).then(function (c) {
      st.btc = c; st.btcSrc = "Binance · حي";
      live(true);
      analyzeAndRender();
    }).catch(function () {
      var s = SAMPLE.BTC;
      st.btc = A.sampleCandles(s.base, s.vol, 500, s.seed);
      st.btcSrc = "تجريبي · تعذّر الوصول إلى Binance";
      live(false);
      analyzeAndRender();
    });
  }

  function live(on) {
    var l = $("live-text"), box = document.querySelector(".live");
    if (l) l.textContent = on ? "مباشر" : "تجريبي";
    if (box) box.classList.toggle("off", !on);
  }

  // Live candles: subscribe to the kline stream of the current timeframe; fall back to polling.
  function connect() {
    if (st.ws) { try { st.ws.close(); } catch (e) {} st.ws = null; }
    if (st.poll) { clearInterval(st.poll); st.poll = null; }
    if (!("WebSocket" in window)) { st.poll = setInterval(refreshBtc, 30000); return; }
    try {
      var ws = new WebSocket("wss://stream.binance.com:9443/ws/btcusdt@kline_" + st.tf);
      st.ws = ws;
      ws.onmessage = function (ev) {
        var k = JSON.parse(ev.data).k;
        if (!k || !st.btc) return;
        var bar = { t: k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v };
        var last = st.btc[st.btc.length - 1];
        if (last && last.t === bar.t) st.btc[st.btc.length - 1] = bar;
        else if (k.x || (last && bar.t > last.t)) { st.btc.push(bar); if (st.btc.length > 500) st.btc.shift(); }
        if (k.x || last.t === bar.t) analyzeAndRender();
        else { st.btc[st.btc.length - 1] = bar; analyzeAndRender(); }
        live(true);
      };
      ws.onerror = function () { live(false); };
      ws.onclose = function () { if (st.ws === ws) st.poll = st.poll || setInterval(refreshBtc, 30000); };
    } catch (e) { st.poll = setInterval(refreshBtc, 30000); }
  }

  // ---------- analysis & render ----------
  function analyzeAndRender() {
    var c = st.btc || [];
    var r = A.analyze(c);
    st.res = r;
    txt("btc-px", c.length ? fmt(c[c.length - 1].c) : "—");
    renderTickers();
    render();
    notifyIfNew(r);
  }

  function renderTickers() {
    var b = st.btc && st.btc.length ? st.btc[st.btc.length - 1].c : null;
    txt("btc-px", fmt(b));
    var p = $("btc-pct");
    if (st.btcChange != null) { p.textContent = (st.btcChange >= 0 ? "+" : "") + st.btcChange.toFixed(2) + "%"; p.classList.toggle("neg", st.btcChange < 0); }
    var g = gold(), gl = g[g.length - 1].c, gf = g[Math.max(0, g.length - 25)].o;
    txt("xau-px", fmt(gl));
    var gp = (gl - gf) / gf * 100, xp = $("xau-pct");
    xp.textContent = (gp >= 0 ? "+" : "") + gp.toFixed(2) + "%";
    xp.classList.toggle("neg", gp < 0);
    txt("src", st.btcSrc || "—");
  }

  function confidence(r) {
    var best = Math.max(r.longScore, r.shortScore);
    return Math.min(99, Math.round(best / 12 * 100));
  }

  function render() {
    var r = st.res;
    if (!r || !r.ready) { txt("trend-line", r ? r.reason : "جارٍ التحميل…"); return; }
    var s = r.signal, sell = s && s.dir === "SHORT", buy = s && s.dir === "LONG";
    var cls = buy ? "buy" : sell ? "sell" : "wait";

    txt("tf-name", st.tf === "15m" ? "15M" : st.tf === "4h" ? "4H" : "1H");
    document.querySelectorAll("[data-tf]").forEach(function (b) { b.setAttribute("aria-selected", String(b.getAttribute("data-tf") === st.tf)); });

    var badge = $("signal-badge");
    badge.className = "badge " + cls;
    badge.textContent = s ? (sell ? "إشارة بيع" : "إشارة شراء") + " • " + confidence(r) : "انتظار • " + confidence(r);

    var trendTxt = r.trend === "bear" ? "اتجاه هابط مؤسسي" : r.trend === "bull" ? "اتجاه صاعد مؤسسي" : "نطاق عرضي / تجميع";
    trendTxt += r.ev ? " (" + r.ev.type + (r.ev.dir === "bull" ? " صاعد" : " هابط") + ")" : "";
    if (!s && r.reasons.length) trendTxt = r.status;
    var tl = $("trend-line"); tl.textContent = trendTxt; tl.className = "trend " + cls;

    var tb = $("trend-bar");
    var diff = Math.abs(r.longScore - r.shortScore) / 12 * 100;
    tb.style.width = Math.min(100, Math.round(diff)) + "%";
    tb.className = r.longScore > r.shortScore ? "buy" : "";

    txt("z-ob", r.ob ? fmt(r.ob.lo) + " – " + fmt(r.ob.hi) : "—");
    txt("z-fvg", r.fvg ? fmt(r.fvg.lo) + " – " + fmt(r.fvg.hi) : "—");
    txt("z-ssl", r.ssl != null ? fmt(r.ssl) : "—");
    txt("z-bsl", r.bsl != null ? fmt(r.bsl) : "—");

    txt("p-sl", s ? fmt(s.sl) : "—");
    txt("p-en", s ? fmt(s.entry) : "—");
    txt("p-t1", s ? fmt(s.tp1) : "—");
    txt("p-t2", s ? fmt(s.tp2) : "—");
    txt("p-t3", s ? fmt(s.tp3) : "—");

    renderAnalysis(r);
    renderMarkets(r);
  }

  function renderAnalysis(r) {
    var ul = $("analysis"); ul.textContent = "";
    function item(head, body) {
      var li = document.createElement("li");
      var b = document.createElement("b"); b.textContent = head + ": ";
      li.appendChild(b); li.appendChild(document.createTextNode(body));
      ul.appendChild(li);
    }
    if (!r.ready) { item("الحالة", r.reason); return; }
    item("هيكل السوق", r.trend === "bear" ? "قمم وقيعان أدنى، والسوق في هيكل هابط." : r.trend === "bull" ? "قمم وقيعان أعلى، والسوق في هيكل صاعد." : "لا توجد قمم وقيعان مرتبة بوضوح الآن.");
    item("كسر الهيكل", r.ev ? r.ev.type + " " + (r.ev.dir === "bull" ? "صاعد" : "هابط") + " عند " + fmt(r.ev.level) + "." : "لا كسر حديث ضمن آخر 20 شمعة.");
    item("السيولة", (r.sweep ? (r.sweep.dir === "bear" ? "سُحبت سيولة فوق القمم عند " : "سُحبت سيولة تحت القيعان عند ") + fmt(r.sweep.level) + "." : "لا سحب سيولة حديث.") + " BSL " + fmt(r.bsl) + " و SSL " + fmt(r.ssl) + ".");
    item("الفجوة والكتلة", (r.fvg ? "فجوة FVG " + (r.fvg.dir === "bull" ? "صاعدة" : "هابطة") + " بين " + fmt(r.fvg.lo) + " و " + fmt(r.fvg.hi) + "." : "لا توجد فجوة غير مملوءة.") + " " + (r.ob ? "كتلة أوامر " + (r.ob.dir === "bull" ? "صاعدة" : "هابطة") + " عند " + fmt(r.ob.lo) + " – " + fmt(r.ob.hi) + "." : ""));
    item("EMA50 و RSI", "السعر " + (r.price > r.ema50 ? "فوق" : "تحت") + " EMA50 (" + fmt(r.ema50) + ") " + (r.emaRising ? "والمتوسط مائل للأعلى" : "والمتوسط مائل للأسفل") + "، و RSI عند " + r.rsi.toFixed(1) + (r.rsi >= 70 ? " وفي تشبع شرائي." : r.rsi <= 30 ? " وفي تشبع بيعي." : "."));
    item("التأكيدات", "مع الشراء " + r.longScore + "/12، مع البيع " + r.shortScore + "/12.");
    item("الخلاصة", r.status + (r.reasons.length ? ". " + r.reasons.join(". ") : ""));
  }

  function renderMarkets(r) {
    var box = $("markets"); box.textContent = "";
    function row(name, px, pct) {
      var d = document.createElement("div"); d.className = "muted"; d.style.cssText = "display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line)";
      var a = document.createElement("span"); a.textContent = name;
      var b = document.createElement("b"); b.style.color = "var(--fg)"; b.textContent = px + (pct != null ? "  " + (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%" : "");
      d.appendChild(a); d.appendChild(b); box.appendChild(d);
    }
    row("BTC/USDT", fmt(st.btc && st.btc.length ? st.btc[st.btc.length - 1].c : null), st.btcChange);
    var g = gold(); row("XAU/USD (" + st.xauSrc + ")", fmt(g[g.length - 1].c), null);
    row("حالة الإشارة BTC", r && r.signal ? r.signal.dir : "انتظار", null);
  }

  // ---------- clock ----------
  function tick() {
    var ms = TF_MS[st.tf], now = Date.now();
    var left = ms - (now % ms);
    var s = Math.floor(left / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
    txt("clock", [h, m, x].map(function (n) { return String(n).padStart(2, "0"); }).join(":"));
  }

  // ---------- notifications ----------
  function notifyIfNew(r) {
    if (!r || !r.signal) return;
    var key = r.signal.dir + ":" + Math.round(r.signal.entry);
    if (key === st.lastSig) return;
    st.lastSig = key;
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("رادار الأسواق: " + (r.signal.dir === "LONG" ? "شراء" : "بيع"), { body: "دخول " + fmt(r.signal.entry) + " · وقف " + fmt(r.signal.sl) });
    }
  }

  // ---------- views ----------
  function setView(v) {
    st.view = v;
    $("app").setAttribute("data-view", v);
    document.querySelectorAll(".nav button").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-tab") === v); });
    ["markets", "alerts", "settings", "calendar"].forEach(function (p) {
      var e = $(p + "-panel"); if (e) e.hidden = p !== v;
    });
  }

  // ---------- controls ----------
  document.querySelectorAll("[data-tf]").forEach(function (b) {
    b.addEventListener("click", function () { st.tf = b.getAttribute("data-tf"); render(); refreshBtc(); connect(); tick(); });
  });
  document.querySelectorAll(".nav [data-tab]").forEach(function (b) {
    b.addEventListener("click", function () { setView(b.getAttribute("data-tab")); });
  });
  $("menu-btn").addEventListener("click", function () { setView("settings"); });
  $("notify-btn").addEventListener("click", function () {
    if (!("Notification" in window)) { txt("alerts-note", "المتصفح لا يدعم الإشعارات."); return; }
    Notification.requestPermission().then(function (p) { txt("alerts-note", p === "granted" ? "الإشعارات مفعّلة." : "لم تُفعّل الإشعارات."); });
  });
  $("csv").addEventListener("change", function (ev) {
    var f = ev.target.files && ev.target.files[0]; if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      try { st.csv = parseCSV(String(rd.result)); st.xauSrc = "ملف MT5"; txt("csv-note", "تم تحميل " + st.csv.length + " شمعة من الذهب."); }
      catch (e) { txt("csv-note", e.message); }
      renderTickers();
    };
    rd.readAsText(f);
  });

  // ---------- boot ----------
  setView("analysis");
  st.xauSrc = "تجريبي";
  var gl = gold(); txt("xau-px", fmt(gl[gl.length - 1].c));
  setInterval(tick, 1000); tick();
  refreshBtc();
  change24h().then(function (c) { st.btcChange = c; renderTickers(); }).catch(function () { txt("btc-pct", "—"); });
  connect();
  setInterval(function () { change24h().then(function (c) { st.btcChange = c; renderTickers(); }).catch(function () {}); }, 60000);
})();
