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

  // ---------- translations (UI chrome) ----------
  var I18N = {
    en: {
      tag: "ICT · SMC · STRUCTURE", sample: "Sample", live: "Live", swing: "Swing", scalp: "Scalp", dayIct: "Day ICT",
      bias: "Bias", orderBlock: "ORDER BLOCK", fvgLbl: "FAIR VALUE GAP", sslLbl: "SELL-SIDE LIQ.", bslLbl: "BUY-SIDE LIQ.",
      sniperEntry: "SNIPER ENTRY", stop: "Stop", entry: "Entry", finalTarget: "Final target", targets: "Targets", sweep: "Sweep",
      noSetup: "No active setup", marketsTitle: "Markets", alertsTitle: "Alerts", settingsTitle: "Settings", calendarTitle: "Calendar",
      alertSignal: "Notify me when a new signal appears", alertTp: "Notify me when a trade closes (win or loss)",
      enableNotif: "Enable notifications", alertsNote: "Notifications appear only while the page is open in your browser.",
      risk: "Risk profile", riskBalanced: "Balanced (targets 1.5R, 2.5R, 4R)", riskSniper: "Sniper (tight stop, far targets)",
      riskNote: "Sniper uses a tighter stop and farther targets. Far targets are hit less often. This is a setting, not a promise of results.",
      instrument: "Instrument", importCsv: "Import candles (CSV from MT5)",
      sessLondon: "London session", sessNewYork: "New York session", sessAsia: "Asia session",
      calendarNote: "Times are Riyadh time. Economic news appears once a data provider is connected.",
      disclaimer: "Educational analysis, not financial advice. Trades do not guarantee profit, and leverage can cause large losses. Size your risk yourself.",
      account: "Account", signIn: "Sign in", signOut: "Sign out", namePh: "Name", emailPh: "Email",
      localAccount: "This sign-in is saved on this device only.", signedInAs: "Signed in as ", notSigned: "Not signed in.",
      language: "Language", go: "Go to", menuSettings: "Settings and risk profile", about: "About",
      aboutText: "Baqer Sniper is an educational market-structure tool. It does not place trades and does not guarantee results.",
      navSettings: "Settings", navAlerts: "Alerts", navCalendar: "Calendar", navAnalysis: "Analysis", navMarkets: "Markets",
      trend: "Trend", journal: "Trade journal", clearJournal: "Clear journal", noTrades: "No closed trades yet. Every signal is recorded and closes at its stop or first target.",
      closedTrades: "Closed trades", wins: "wins", losses: "losses", winRate: "win rate", learnNote: "After recent losses, decisions need 2 more points.",
      paused: "Paused patterns", loading: "Loading…", csvLoaded: " loaded ", candles: " candles.",
      csvNeeds: "The file needs at least 60 candles.", csvColumns: "Could not find open, high, low, close columns.",
      notifOff: "This browser does not support notifications.", notifOn: "Notifications are on.", notifNo: "Notifications were not enabled.",
      waitWord: "Wait", buyWord: "BUY", sellWord: "SELL", ranging: "Ranging, accumulating",
      bullTrend: "Institutional short-term uptrend", bearTrend: "Institutional short-term downtrend",
      noActive: "No active setup", sourceLive: "Binance · live", sourceSample: "Sample", sourceCsv: "CSV file", sourceLinked: "Linked feed", sourceAuto: "Auto feed"
    },
    ar: {
      tag: "ICT · SMC · الهيكل", sample: "عينة", live: "مباشر", swing: "سوينغ", scalp: "سكالب", dayIct: "يومي ICT",
      bias: "الاتجاه", orderBlock: "كتلة الأوامر", fvgLbl: "فجوة القيمة العادلة", sslLbl: "سيولة البيع SSL", bslLbl: "سيولة الشراء BSL",
      sniperEntry: "دخول القناص", stop: "وقف", entry: "دخول", finalTarget: "الهدف النهائي", targets: "الأهداف", sweep: "سحب",
      noSetup: "لا توجد صفقة نشطة", marketsTitle: "الأسواق", alertsTitle: "التنبيهات", settingsTitle: "الإعدادات", calendarTitle: "التقويم",
      alertSignal: "أخبرني عند ظهور إشارة جديدة", alertTp: "أخبرني عند إغلاق صفقة (ربح أو خسارة)",
      enableNotif: "تفعيل الإشعارات", alertsNote: "تظهر الإشعارات فقط أثناء فتح الصفحة في المتصفح.",
      risk: "نمط المخاطرة", riskBalanced: "متوازن (أهداف 1.5R و2.5R و4R)", riskSniper: "Sniper (وقف قريب وأهداف بعيدة)",
      riskNote: "نمط Sniper يطلب وقفاً أضيق وأهدافاً أبعد. الأهداف البعيدة تُصاب بنسبة أقل. هذا خيار وليس ضماناً لأي نتيجة.",
      instrument: "الأصل", importCsv: "استيراد الشموع (CSV من MT5)",
      sessLondon: "جلسة لندن", sessNewYork: "جلسة نيويورك", sessAsia: "جلسة آسيا",
      calendarNote: "الأوقات بتوقيت الرياض. تظهر أخبار الاقتصاد عند ربط مزود بيانات.",
      disclaimer: "تحليل تعليمي وليس نصيحة مالية. الصفقات لا تضمن ربحاً، والرافعة قد تسبب خسائر كبيرة. حدّد مخاطرتك بنفسك.",
      account: "الحساب", signIn: "تسجيل الدخول", signOut: "تسجيل الخروج", namePh: "الاسم", emailPh: "البريد الإلكتروني",
      localAccount: "يُحفظ تسجيل الدخول على هذا الجهاز فقط.", signedInAs: "مسجّل الدخول باسم ", notSigned: "غير مسجّل الدخول.",
      language: "اللغة", go: "انتقل إلى", menuSettings: "الإعدادات ونمط المخاطرة", about: "عن التطبيق",
      aboutText: "باقر سنايبر أداة تعليمية لتحليل هيكل السوق. لا تنفّذ صفقات ولا تضمن نتائج.",
      navSettings: "الإعدادات", navAlerts: "التنبيهات", navCalendar: "التقويم", navAnalysis: "التحليل", navMarkets: "الأسواق",
      trend: "الاتجاه", journal: "سجل الصفقات", clearJournal: "مسح السجل", noTrades: "لا توجد صفقات مغلقة بعد. تُسجَّل كل إشارة وتُغلق عند الوقف أو الهدف الأول.",
      closedTrades: "صفقات مغلقة", wins: "ربح", losses: "خسارة", winRate: "نسبة النجاح", learnNote: "بعد خسائر حديثة يحتاج القرار إلى نقطتين إضافيتين.",
      paused: "أنماط موقوفة", loading: "جارٍ التحميل…", csvLoaded: " تم تحميل ", candles: " شمعة.",
      csvNeeds: "يحتاج الملف إلى 60 شمعة على الأقل.", csvColumns: "لم أجد أعمدة open وhigh وlow وclose.",
      notifOff: "هذا المتصفح لا يدعم الإشعارات.", notifOn: "الإشعارات مفعّلة.", notifNo: "لم تُفعّل الإشعارات.",
      waitWord: "انتظار", buyWord: "شراء", sellWord: "بيع", ranging: "عرضي، يتجمع السعر",
      bullTrend: "اتجاه صاعد مؤسسي قصير المدى", bearTrend: "اتجاه هابط مؤسسي قصير المدى",
      noActive: "لا توجد صفقة نشطة", sourceLive: "Binance · مباشر", sourceSample: "عينة", sourceCsv: "ملف CSV", sourceLinked: "رابط بيانات", sourceAuto: "بيانات تلقائية"
    }
  };
  I18N.ar.alertsNote = "تظهر الإشعارات فقط أثناء فتح الصفحة في المتصفح.";
  I18N.en.welSub = "Market structure, explained simply.";
  I18N.en.riskScalp = "Scalp (very tight stop, quick targets)";
  I18N.en.analysisTitle = "Detailed ICT + SMC analysis";
  I18N.ar.analysisTitle = "التحليل التفصيلي بنظام ICT + SMC";
  I18N.ar.swing = "تداول متدرج"; I18N.ar.scalp = "مضاربة سريعة"; I18N.ar.dayIct = "تداول يومي ICT";
  I18N.ar.bias = "اتجاه السوق"; I18N.ar.fvgLbl = "فجوة FVG"; I18N.ar.sslLbl = "سيولة بيعية SSL"; I18N.ar.bslLbl = "سيولة شرائية BSL";
  I18N.ar.orderBlock = "كتلة الأوامر"; I18N.ar.sniperEntry = "منطقة الدخول";
  I18N.ar.tag = "تحليل الذهب والعملات الرقمية";
  I18N.ar.riskScalp = "Scalp (وقف ضيق جداً وأهداف سريعة)";
  I18N.en.welGuest = "Continue without signing in";
  I18N.en.welContinue = "Continue";
  I18N.en.welHint = "Your sign-in is saved on this device only.";
  I18N.en.welBack = "Welcome back, ";
  I18N.ar.welSub = "هيكل السوق، مشروحاً ببساطة.";
  I18N.ar.welGuest = "المتابعة دون تسجيل دخول";
  I18N.ar.welContinue = "متابعة";
  I18N.ar.welHint = "يُحفظ تسجيل الدخول على هذا الجهاز فقط.";
  I18N.ar.welBack = "أهلاً بعودتك، ";
  I18N.en.dataUrl = "Live data link (CSV or JSON)";
  I18N.en.dataSave = "Connect data";
  I18N.en.dataClear = "Disconnect";
  I18N.en.dataNote = "The app reads this link every minute. The file needs columns open, high, low, close (and time if available). Each instrument can have its own link.";
  I18N.en.dataOk = "Connected. Last update: ";
  I18N.en.dataFail = "Could not read this link. Check that it is public and returns candles.";
  I18N.ar.dataUrl = "رابط البيانات الحية (CSV أو JSON)";
  I18N.ar.dataSave = "ربط البيانات";
  I18N.ar.dataClear = "فصل";
  I18N.ar.dataNote = "يقرأ التطبيق هذا الرابط كل دقيقة. الملف يحتاج أعمدة open وhigh وlow وclose، والوقت إن توفّر. لكل أصل رابطه الخاص.";
  I18N.ar.dataOk = "تم الربط. آخر تحديث: ";
  I18N.ar.dataFail = "تعذّرت قراءة الرابط. تأكد أنه عام ويعيد شموعاً.";
  I18N.ar.signedInAs = "مسجّل الدخول باسم ";

  var feeds = {}; // id -> { url, updated, ok } (user-provided links)
  var AUTO = { XAU: "XAUUSD", XAG: "XAGUSD", EURUSD: "EURUSD", GBPUSD: "GBPUSD", NAS100: "NAS100" };
  var autoOk = {}; // id -> true when the built-in data function returned candles
  var st = { inst: "BTC", tf: "1h", profile: "balanced", lang: "en", btc: null, btcFetchedTf: null, btcChange: null,
             csv: {}, res: null, lastSig: null, ws: null, poll: null, prefs: { signal: true, tp: true } };

  function $(id) { return document.getElementById(id); }
  function T(k) { return (I18N[st.lang] && I18N[st.lang][k]) || I18N.en[k] || k; }
  function txt(id, t) { var e = $(id); if (e) e.textContent = t; }
  function fmtD(v, d) {
    if (v == null || isNaN(v)) return "—";
    return v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function fmt(v) { return fmtD(v, BY[st.inst].digits); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function store(key, val) { try { if (val === undefined) return JSON.parse(localStorage.getItem(key) || "null"); localStorage.setItem(key, JSON.stringify(val)); } catch (e) { return val === undefined ? null : undefined; } }

  // ---------- candles ----------
  function sampleFor(x) { return A.sampleCandles(x.base, x.vol, 500, x.seed); }
  function candlesFor(id) {
    if (id === "BTC") return st.btc || sampleFor(BY.BTC);
    return st.csv[id] || sampleFor(BY[id]);
  }
  function parseJSONCandles(text) {
    var arr = JSON.parse(text);
    if (arr && !Array.isArray(arr) && Array.isArray(arr.candles)) arr = arr.candles;
    if (!Array.isArray(arr)) throw new Error("bad json");
    var out = [];
    arr.forEach(function (k, i) {
      var o = +(k.o != null ? k.o : k.open), h = +(k.h != null ? k.h : k.high);
      var l = +(k.l != null ? k.l : k.low), c = +(k.c != null ? k.c : k.close);
      if ([o, h, l, c].some(isNaN)) return;
      out.push({ t: k.t != null ? +k.t : i, o: o, h: h, l: l, c: c, v: +(k.v || 1) });
    });
    if (out.length < 60) throw new Error(T("csvNeeds"));
    return out.slice(-500);
  }
  function loadFeed(id) {
    var f = feeds[id]; if (!f || !f.url) return Promise.resolve();
    return fetch(f.url, { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
      .then(function (text) {
        var t = text.trim();
        st.csv[id] = (t[0] === "[" || t[0] === "{") ? parseJSONCandles(t) : parseCSV(t);
        f.updated = new Date(); f.ok = true;
        feedNote(id);
      })
      .catch(function () { f.ok = false; feedNote(id); });
  }
  function feedNote(id) {
    var f = feeds[id];
    if (!f) return;
    txt("data-note", f.ok ? T("dataOk") + f.updated.toLocaleTimeString() : T("dataFail"));
  }
  function saveFeeds() { store("baqerFeeds", feeds); }
  function connectedNow(id) { return !!(feeds[id] && feeds[id].ok); }
  // Built-in feed: loads only the selected instrument (saves the provider quota) and
  // reuses it for 2 minutes per timeframe.
  var autoKey = {}, autoAt = {};
  function autoLoad() {
    var x = BY[st.inst];
    if (!x || !AUTO[x.id] || connectedNow(x.id)) return Promise.resolve();
    var key = x.id + "|" + st.tf;
    if (autoKey[key] && Date.now() - (autoAt[key] || 0) < 120000) return Promise.resolve();
    var url = "/.netlify/functions/candles?symbol=" + AUTO[x.id] + "&interval=" + st.tf;
    return fetch(url, { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
      .then(function (text) {
        st.csv[x.id] = parseJSONCandles(text);
        autoOk[x.id] = true; autoKey[key] = true; autoAt[key] = Date.now();
      })
      .catch(function () { autoOk[x.id] = false; });
  }
  function refreshFeeds() {
    var ids = Object.keys(feeds);
    var userJobs = ids.map(loadFeed);
    Promise.all(userJobs.concat([autoLoad()])).then(function () { analyzeAndRender(); });
  }
  function sourceFor(id) {
    if (id === "BTC") return st.btc && st.btcFetchedTf ? T("sourceLive") : T("sourceSample");
    if (connectedNow(id)) return T("sourceLinked");
    if (autoOk[id]) return T("sourceAuto");
    return st.csv[id] ? T("sourceCsv") : T("sourceSample");
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
    if (lines.length < 61) throw new Error(T("csvNeeds"));
    var head = lines[0].split(/[,;\t]/).map(function (s) { return s.trim().toLowerCase().replace(/[<>]/g, ""); });
    var idx = { o: 2, h: 3, l: 4, c: 5 }, start = 0;
    if (/[a-z]/i.test(lines[0])) {
      start = 1;
      var f = function (names) { for (var k = 0; k < head.length; k++) if (names.indexOf(head[k]) >= 0) return k; return -1; };
      idx = { o: f(["open"]), h: f(["high"]), l: f(["low"]), c: f(["close"]) };
      if (idx.o < 0 || idx.h < 0 || idx.l < 0 || idx.c < 0) throw new Error(T("csvColumns"));
    }
    var out = [];
    for (var i = start; i < lines.length; i++) {
      var p = lines[i].split(/[,;\t]/);
      var o = +p[idx.o], h = +p[idx.h], l = +p[idx.l], c = +p[idx.c];
      if ([o, h, l, c].some(isNaN)) continue;
      out.push({ t: i, o: o, h: h, l: l, c: c, v: 1 });
    }
    if (out.length < 60) throw new Error(T("csvNeeds"));
    return out.slice(-500);
  }
  function live(on) { var box = $("live"); if (box) box.classList.toggle("off", !on); txt("live-text", on ? T("live") : T("sample")); }
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
    renderMarkets();
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
    if (!r || !r.ready) { txt("trend-line", r ? r.reason : T("loading")); return; }
    var s = r.signal, sell = s && s.dir === "SHORT", buy = s && s.dir === "LONG";
    var cls = buy ? "buy" : sell ? "sell" : "wait";
    var conf = Math.min(99, Math.round(Math.max(r.longScore, r.shortScore) / 12 * 100));

    txt("tf-name", TF_NAME[st.tf]);
    txt("chart-title", T("bias") + " · " + TF_NAME[st.tf]);
    document.querySelectorAll("[data-tf]").forEach(function (b) { b.setAttribute("aria-selected", String(b.getAttribute("data-tf") === st.tf)); });

    var badge = $("signal-badge");
    badge.className = "badge " + cls;
    badge.textContent = s ? (sell ? T("sellWord") : T("buyWord")) + " · " + conf : T("waitWord") + " · " + conf;

    var trendTxt = r.trend === "bear" ? T("bearTrend") : r.trend === "bull" ? T("bullTrend") : T("ranging");
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
      txt("rr", T("noActive"));
    }
    renderLevels(r);
  }

  // ---------- chart ----------
  function svgEl(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { if (attrs[k] != null) e.setAttribute(k, attrs[k]); });
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
    gu.appendChild(svgEl("stop", { offset: 0, "stop-color": "#7ff5c8" })); gu.appendChild(svgEl("stop", { offset: 1, "stop-color": "#1ea877" }));
    var gd = svgEl("linearGradient", { id: "cDn", x1: 0, x2: 0, y1: 0, y2: 1 });
    gd.appendChild(svgEl("stop", { offset: 0, "stop-color": "#ffa3a3" })); gd.appendChild(svgEl("stop", { offset: 1, "stop-color": "#d93d48" }));
    var go = svgEl("linearGradient", { id: "obFill", x1: 0, x2: 0, y1: 0, y2: 1 });
    go.appendChild(svgEl("stop", { offset: 0, "stop-color": "#e8b44a", "stop-opacity": ".28" })); go.appendChild(svgEl("stop", { offset: 1, "stop-color": "#e8b44a", "stop-opacity": ".06" }));
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
    if (r.ob) zone(r.ob.i >= off ? r.ob : { lo: r.ob.lo, hi: r.ob.hi, i: off }, "url(#obFill)", null, T("orderBlock"));
    if (r.fvg) zone(r.fvg.i >= off ? r.fvg : { lo: r.fvg.lo, hi: r.fvg.hi, i: off }, "rgba(127,184,255,.14)", "rgba(127,184,255,.45)", "FVG");

    function hline(price, color, label, dash) {
      var y = Y(price);
      svg.appendChild(svgEl("line", { x1: 0, y1: y, x2: W, y2: y, stroke: color, "stroke-width": 1, "stroke-dasharray": dash || null, opacity: dash ? 0.75 : 1 }));
      var t = svgEl("text", { x: areaR + 6, y: y + 3, "font-family": "Inter, sans-serif", "font-size": 9, fill: color });
      t.textContent = label; svg.appendChild(t);
    }
    vis.forEach(function (k, i) {
      var up = k.c >= k.o, x = X(i);
      svg.appendChild(svgEl("line", { x1: x, y1: Y(k.h), x2: x, y2: Y(k.l), stroke: up ? "#5ff0b5" : "#ff8a8a", "stroke-width": 1.1, opacity: 0.7 }));
    });
    var g = svgEl("g", { filter: "url(#glow)" });
    vis.forEach(function (k, i) {
      var up = k.c >= k.o, x = X(i), top = Y(Math.max(k.o, k.c)), bot = Y(Math.min(k.o, k.c));
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
    var sty = A.story(r, st.lang);
    if (!sty) { box.textContent = r && r.reason ? r.reason : T("loading"); return; }
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

  // ---------- trade journal ----------
  var JKEY = "baqerJournal";
  function loadJournal() { return store(JKEY) || []; }
  function saveJournal(j) { store(JKEY, j.slice(-300)); }
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
        if (hitStop) { e.status = "loss"; e.closed = true; changed = true; break; }
        if (hitTP) { e.status = "win"; e.closed = true; changed = true; break; }
      }
    });
    if (changed) saveJournal(j);
  }
  function renderJournal() {
    var box = $("journal-box"); if (!box) return;
    var s = journalStats(loadJournal()), L = learnFromJournal();
    box.textContent = "";
    box.appendChild(el("h2", "", T("journal")));
    box.appendChild(el("p", "muted", s.closed
      ? T("closedTrades") + ": " + s.closed + " · " + T("wins") + ": " + s.wins + " · " + T("losses") + ": " + s.losses + " · " + T("winRate") + ": " + Math.round(s.wins / s.closed * 100) + "%"
      : T("noTrades")));
    var extra = (L.extra ? T("learnNote") + " " : "") + (L.block.length ? T("paused") + ": " + L.block.length + "." : "");
    if (extra) box.appendChild(el("p", "muted", extra));
    var btn = el("button", "btn", T("clearJournal")); btn.type = "button";
    btn.addEventListener("click", function () { saveJournal([]); analyzeAndRender(); });
    box.appendChild(btn);
  }

  // ---------- alerts ----------
  function notifyIfNew(r) {
    if (!r || !r.signal || !st.prefs.signal) return;
    var key = st.inst + ":" + r.signal.dir + ":" + r.signal.entry.toFixed(BY[st.inst].digits);
    if (key === st.lastSig) return;
    st.lastSig = key;
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("Baqer Sniper · " + BY[st.inst].name + ": " + (r.signal.dir === "LONG" ? "Buy" : "Sell"),
        { body: "Entry " + fmt(r.signal.entry) + " · Stop " + fmt(r.signal.sl) });
    }
  }

  // ---------- language ----------
  function applyLang() {
    document.documentElement.lang = st.lang;
    document.documentElement.dir = st.lang === "ar" ? "rtl" : "ltr";
    var bn = $("brand-name");
    if (bn) bn.textContent = st.lang === "ar" ? "رادار الأسواق" : "BAQER SNIPER";
    document.querySelectorAll("[data-i18n]").forEach(function (e) { e.textContent = T(e.getAttribute("data-i18n")); });
    document.querySelectorAll("[data-i18nph]").forEach(function (e) { e.setAttribute("placeholder", T(e.getAttribute("data-i18nph"))); });
    document.querySelectorAll("[data-lang]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-lang") === st.lang)); });
    var sel = $("inst-select"); if (sel) { sel.value = st.inst; }
    document.title = st.lang === "ar" ? "باقر سنايبر" : "Baqer Sniper";
    renderAccount();
    analyzeAndRender();
    setView(currentView());
  }
  function setLang(lang) {
    st.lang = lang === "ar" ? "ar" : "en";
    store("baqerLang", st.lang);
    applyLang();
  }

  // ---------- account (local sign-in, saved on this device only) ----------
  function renderAccount() {
    var u = store("baqerUser");
    txt("acct-state", u ? T("signedInAs") + u.name : T("notSigned"));
    var out = $("signout"); if (out) out.hidden = !u;
    var form = $("signin-form"); if (form) form.hidden = !!u;
  }

  // ---------- menu drawer ----------
  function openMenu(open) {
    $("drawer").hidden = !open; $("scrim").hidden = !open;
    $("menu-btn").setAttribute("aria-expanded", String(open));
  }

  // ---------- views ----------
  function currentView() { return $("app").getAttribute("data-view") || "analysis"; }
  function setView(v) {
    $("app").setAttribute("data-view", v);
    document.querySelectorAll(".nav button").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-tab") === v); });
    ["markets", "alerts", "settings", "calendar"].forEach(function (p) { var e = $(p + "-panel"); if (e) e.hidden = p !== v; });
    if (v === "analysis") render();
  }
  function setInst(id) {
    st.inst = id;
    if (id === "BTC") { loadBtc().then(function () { connect(); analyzeAndRender(); }); }
    else { stopStreams(); live(false); autoLoad().then(analyzeAndRender); }
    var sel = $("inst-select"); if (sel) sel.value = id;
  }
  // Each trading style sets its timeframe and risk profile together.
  var STYLE = { "15m": "scalp", "1h": "balanced", "4h": "balanced" };
  function setTf(tf) {
    st.tf = tf; tick();
    st.profile = STYLE[tf] || "balanced";
    var pr = $("profile"); if (pr) pr.value = st.profile;
    autoLoad().then(function () { if (st.inst !== "BTC") analyzeAndRender(); });
    if (st.inst === "BTC") loadBtc().then(function () { connect(); analyzeAndRender(); });
    else analyzeAndRender();
  }

  // ---------- welcome screen (shown on every open) ----------
  function showWelcome() {
    var u = store("baqerUser");
    var back = $("wel-back"), fresh = $("wel-new");
    if (u) {
      back.hidden = false; fresh.hidden = true;
      txt("wel-hi", T("welBack") + u.name);
    } else {
      back.hidden = true; fresh.hidden = false;
    }
    $("welcome").hidden = false;
    document.body.style.overflow = "hidden";
  }
  function hideWelcome() {
    $("welcome").hidden = true;
    document.body.style.overflow = "";
  }
  $("wel-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var name = $("wel-name").value.trim(), email = $("wel-email").value.trim();
    if (!name || !email) return;
    store("baqerUser", { name: name, email: email });
    renderAccount();
    hideWelcome();
  });
  $("wel-guest").addEventListener("click", hideWelcome);
  $("wel-continue").addEventListener("click", hideWelcome);

  // ---------- wiring ----------
  document.querySelectorAll("[data-tf]").forEach(function (b) { b.addEventListener("click", function () { setTf(b.getAttribute("data-tf")); }); });
  document.querySelectorAll(".nav [data-tab]").forEach(function (b) { b.addEventListener("click", function () { setView(b.getAttribute("data-tab")); }); });
  document.querySelectorAll("[data-lang]").forEach(function (b) { b.addEventListener("click", function () { setLang(b.getAttribute("data-lang")); }); });
  document.querySelectorAll("[data-go]").forEach(function (b) { b.addEventListener("click", function () { openMenu(false); setView(b.getAttribute("data-go")); }); });
  $("menu-btn").addEventListener("click", function () { openMenu(true); });
  $("drawer-close").addEventListener("click", function () { openMenu(false); });
  $("scrim").addEventListener("click", function () { openMenu(false); });
  $("signin-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var name = $("su-name").value.trim(), email = $("su-email").value.trim();
    if (!name || !email) return;
    store("baqerUser", { name: name, email: email });
    $("signin-form").reset();
    renderAccount();
  });
  $("signout").addEventListener("click", function () { store("baqerUser", null); renderAccount(); });
  $("notify-btn").addEventListener("click", function () {
    if (!("Notification" in window)) { txt("alerts-note", T("notifOff")); return; }
    Notification.requestPermission().then(function (p) { txt("alerts-note", p === "granted" ? T("notifOn") : T("notifNo")); });
  });
  var pSig = $("pref-signal"), pTp = $("pref-tp");
  pSig.checked = st.prefs.signal; pTp.checked = st.prefs.tp;
  pSig.addEventListener("change", function () { st.prefs.signal = pSig.checked; store("baqerPrefs", st.prefs); });
  pTp.addEventListener("change", function () { st.prefs.tp = pTp.checked; store("baqerPrefs", st.prefs); });

  var sel = $("inst-select");
  INST.forEach(function (x) { var o = el("option", "", x.name); o.value = x.id; sel.appendChild(o); });
  sel.value = st.inst;
  sel.addEventListener("change", function () { setInst(sel.value); showFeedFor(sel.value); });
  function showFeedFor(id) {
    var f = feeds[id];
    $("data-url").value = f ? f.url : "";
    txt("data-note", f && f.ok ? T("dataOk") + f.updated.toLocaleTimeString() : (f ? T("dataFail") : ""));
  }
  $("data-save").addEventListener("click", function () {
    var id = sel.value, url = $("data-url").value.trim();
    if (!url) { txt("data-note", T("dataFail")); return; }
    feeds[id] = { url: url, ok: false };
    saveFeeds();
    loadFeed(id).then(function () { if (st.inst === id) analyzeAndRender(); else renderTickers(); });
  });
  $("data-clear").addEventListener("click", function () {
    var id = sel.value;
    delete feeds[id]; delete st.csv[id]; saveFeeds();
    $("data-url").value = "";
    txt("data-note", "");
    if (st.inst === id) analyzeAndRender(); else renderTickers();
  });

  $("csv").addEventListener("change", function (ev) {
    var f = ev.target.files && ev.target.files[0]; if (!f) return;
    var target = sel.value, rd = new FileReader();
    rd.onload = function () {
      try {
        st.csv[target] = parseCSV(String(rd.result));
        txt("csv-note", BY[target].name + T("csvLoaded") + st.csv[target].length + T("candles"));
        if (st.inst === target) analyzeAndRender(); else renderTickers();
      } catch (e) { txt("csv-note", e.message); }
    };
    rd.readAsText(f);
  });

  feeds = store("baqerFeeds") || {};
  setInterval(refreshFeeds, 60000);
  refreshFeeds();
  setInterval(function () { autoLoad().then(function () { if (st.inst !== "BTC") analyzeAndRender(); }); }, 120000);
  showFeedFor(sel.value);
  var prof = $("profile");
  st.profile = store("sniperProfile") || "balanced";
  prof.value = st.profile;
  prof.addEventListener("change", function () { st.profile = prof.value; store("sniperProfile", st.profile); analyzeAndRender(); });

  function tick() {
    var ms = TF_MS[st.tf], left = ms - (Date.now() % ms), s = Math.floor(left / 1000);
    txt("clock", [Math.floor(s / 3600), Math.floor(s % 3600 / 60), s % 60].map(function (n) { return String(n).padStart(2, "0"); }).join(":"));
  }

  // ---------- boot ----------
  st.lang = store("baqerLang") === "ar" ? "ar" : "en";
  st.prefs = store("baqerPrefs") || st.prefs;
  pSig.checked = st.prefs.signal; pTp.checked = st.prefs.tp;
  applyLang();
  setView("analysis");
  showWelcome();
  setInterval(tick, 1000); tick();
  loadBtc().then(function () { connect(); analyzeAndRender(); });
  change24h().then(function (c) { st.btcChange = c; renderTickers(); }).catch(function () {});
  setInterval(function () { change24h().then(function (c) { st.btcChange = c; renderTickers(); }).catch(function () {}); }, 60000);
})();
