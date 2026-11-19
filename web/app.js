(function () {
  "use strict";
  var A = window.Analysis;
  var TF_MS = { "15m": 15 * 60e3, "1h": 60 * 60e3, "4h": 4 * 60 * 60e3 };

  // Instruments. Only BTC has a keyless live feed. Others use a CSV you export (MT5)
  // or clearly labelled sample candles until a data provider is connected.
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

  var st = {
    inst: "BTC", tf: "1h", profile: "balanced",
    btc: null, btcChange: null, btcFetchedTf: null,
    csv: {}, res: null, lastSig: null, ws: null, poll: null
  };

  function $(id) { return document.getElementById(id); }
  function txt(id, t) { var e = $(id); if (e) e.textContent = t; }
  function fmtD(v, d) {
    if (v == null || isNaN(v)) return "—";
    return v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function fmt(v) { return fmtD(v, BY[st.inst].digits); }

  // ---------- candles per instrument ----------
  function sampleFor(x) { return A.sampleCandles(x.base, x.vol, 500, x.seed); }
  function candlesFor(id) {
    if (id === "BTC") return st.btc || sampleFor(BY.BTC);
    return st.csv[id] || sampleFor(BY[id]);
  }
  function sourceFor(id) {
    if (id === "BTC") return st.btc && st.btcFetchedTf ? "Binance · حي" : "تجريبي";
    return st.csv[id] ? "ملف CSV" : "تجريبي";
  }
  function changeFor(id) {
    if (id === "BTC" && st.btcChange != null) return st.btcChange;
    var c = candlesFor(id), from = c[Math.max(0, c.length - 25)].o, last = c[c.length - 1].c;
    return (last - from) / from * 100;
  }

  // ---------- data loading ----------
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
    return klines(st.tf).then(function (c) {
      st.btc = c; st.btcFetchedTf = st.tf; live(true);
    }).catch(function () {
      st.btc = null; st.btcFetchedTf = null; live(false);
    });
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

  function live(on) {
    var l = $("live-text"), box = document.querySelector(".live");
    if (l) l.textContent = on ? "مباشر" : "تجريبي";
    if (box) box.classList.toggle("off", !on);
  }

  // Live candles for BTC: kline stream of the current timeframe, polling as fallback.
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
    var done = st.inst === "BTC" && st.btcFetchedTf !== st.tf ? loadBtc() : Promise.resolve();
    done.then(analyzeAndRender);
  }

  // ---------- analysis & render ----------
  function analyzeAndRender() {
    var c = candlesFor(st.inst);
    st.res = A.analyze(c, st.profile);
    renderTickers();
    render();
    notifyIfNew(st.res);
  }

  function renderTickers() {
    var row = $("tickers"); if (!row) return;
    row.textContent = "";
    INST.forEach(function (x) {
      var c = candlesFor(x.id), last = c[c.length - 1].c, ch = changeFor(x.id);
      var b = document.createElement("button");
      b.type = "button";
      b.className = "tk" + (x.id === st.inst ? " on" : "") + (x.id === "XAU" ? " gold" : "");
      b.setAttribute("aria-pressed", String(x.id === st.inst));
      var pct = document.createElement("span");
      pct.className = "pct" + (ch < 0 ? " neg" : "");
      pct.textContent = (ch >= 0 ? "+" : "") + ch.toFixed(2) + "%";
      var px = document.createElement("span");
      px.className = "px"; px.textContent = fmtD(last, x.digits);
      var sym = document.createElement("span");
      sym.className = "sym"; sym.textContent = x.name + (x.live ? "" : (st.csv[x.id] ? " · CSV" : " · تجريبي"));
      b.appendChild(pct); b.appendChild(px); b.appendChild(sym);
      b.addEventListener("click", function () { setInst(x.id); });
      row.appendChild(b);
    });
    txt("asset-name", BY[st.inst].name);
    txt("src", sourceFor(st.inst));
  }

  function confidence(r) { return Math.min(99, Math.round(Math.max(r.longScore, r.shortScore) / 12 * 100)); }

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
    tb.style.width = Math.min(100, Math.round(Math.abs(r.longScore - r.shortScore) / 12 * 100)) + "%";
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
    renderMarkets();
    var note = $("csv-note");
    if (note) note.textContent = BY[st.inst].live ? "" : (st.csv[st.inst] ? "" : "لا يوجد مصدر حي لهذا الأصل بعد. ارفع ملف CSV من MT5 أو اربط مزود بيانات.");
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

  function renderMarkets() {
    var box = $("markets"); if (!box) return;
    box.textContent = "";
    INST.forEach(function (x) {
      var c = candlesFor(x.id), last = c[c.length - 1].c, ch = changeFor(x.id);
      var d = document.createElement("div");
      d.className = "muted";
      d.style.cssText = "display:flex;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid var(--line)";
      var a = document.createElement("span"); a.textContent = x.name + " · " + sourceFor(x.id);
      var b = document.createElement("b"); b.style.color = "var(--fg)"; b.style.fontVariantNumeric = "tabular-nums";
      b.textContent = fmtD(last, x.digits) + "  " + (ch >= 0 ? "+" : "") + ch.toFixed(2) + "%";
      d.appendChild(a); d.appendChild(b); box.appendChild(d);
    });
  }

  // ---------- clock & notifications ----------
  function tick() {
    var ms = TF_MS[st.tf], left = ms - (Date.now() % ms), s = Math.floor(left / 1000);
    txt("clock", [Math.floor(s / 3600), Math.floor(s % 3600 / 60), s % 60].map(function (n) { return String(n).padStart(2, "0"); }).join(":"));
  }
  function notifyIfNew(r) {
    if (!r || !r.signal) return;
    var key = st.inst + ":" + r.signal.dir + ":" + r.signal.entry.toFixed(BY[st.inst].digits);
    if (key === st.lastSig) return;
    st.lastSig = key;
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("باقر سنايبر · " + BY[st.inst].name + ": " + (r.signal.dir === "LONG" ? "شراء" : "بيع"),
        { body: "دخول " + fmt(r.signal.entry) + " · وقف " + fmt(r.signal.sl) });
    }
  }

  // ---------- views & controls ----------
  function setView(v) {
    $("app").setAttribute("data-view", v);
    document.querySelectorAll(".nav button").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-tab") === v); });
    ["markets", "alerts", "settings", "calendar"].forEach(function (p) { var e = $(p + "-panel"); if (e) e.hidden = p !== v; });
  }
  function setInst(id) {
    st.inst = id;
    if (id === "BTC") { loadBtc().then(function () { connect(); analyzeAndRender(); }); }
    else { stopStreams(); live(false); analyzeAndRender(); }
    var sel = $("inst-select"); if (sel) sel.value = id;
  }

  document.querySelectorAll("[data-tf]").forEach(function (b) {
    b.addEventListener("click", function () {
      st.tf = b.getAttribute("data-tf");
      tick();
      if (st.inst === "BTC") loadBtc().then(function () { connect(); analyzeAndRender(); });
      else analyzeAndRender();
    });
  });
  document.querySelectorAll(".nav [data-tab]").forEach(function (b) {
    b.addEventListener("click", function () { setView(b.getAttribute("data-tab")); });
  });
  $("menu-btn").addEventListener("click", function () { setView("settings"); });
  $("notify-btn").addEventListener("click", function () {
    if (!("Notification" in window)) { txt("alerts-note", "المتصفح لا يدعم الإشعارات."); return; }
    Notification.requestPermission().then(function (p) { txt("alerts-note", p === "granted" ? "الإشعارات مفعّلة." : "لم تُفعّل الإشعارات."); });
  });

  var sel = $("inst-select");
  if (sel) {
    INST.forEach(function (x) { var o = document.createElement("option"); o.value = x.id; o.textContent = x.name; sel.appendChild(o); });
    sel.value = st.inst;
    sel.addEventListener("change", function () { setInst(sel.value); });
  }
  $("csv").addEventListener("change", function (ev) {
    var f = ev.target.files && ev.target.files[0]; if (!f || !sel) return;
    var target = sel.value, rd = new FileReader();
    rd.onload = function () {
      try {
        st.csv[target] = parseCSV(String(rd.result));
        txt("csv-note", BY[target].name + ": تم تحميل " + st.csv[target].length + " شمعة.");
        if (st.inst === target) analyzeAndRender(); else renderTickers();
      } catch (e) { txt("csv-note", e.message); }
    };
    rd.readAsText(f);
  });

  try { st.profile = localStorage.getItem("sniperProfile") || "balanced"; } catch (e) {}
  var prof = $("profile");
  if (prof) {
    prof.value = st.profile;
    prof.addEventListener("change", function () {
      st.profile = prof.value;
      try { localStorage.setItem("sniperProfile", st.profile); } catch (e) {}
      analyzeAndRender();
    });
  }

  // ---------- boot ----------
  setView("analysis");
  setInterval(tick, 1000); tick();
  loadBtc().then(function () { connect(); analyzeAndRender(); });
  change24h().then(function (c) { st.btcChange = c; renderTickers(); }).catch(function () {});
  setInterval(function () { change24h().then(function (c) { st.btcChange = c; renderTickers(); }).catch(function () {}); }, 60000);
})();
