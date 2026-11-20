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
    { id: "EURUSD", name: "EUR/USD",    digits: 5,              base: 1.1650, vol: 0.0007, seed: 41 },
    { id: "GBPUSD", name: "GBP/USD",    digits: 5,              base: 1.3420, vol: 0.0008, seed: 53 }
  ];
  var BY = {};
  INST.forEach(function (x) { BY[x.id] = x; });

  // ---------- translations (UI chrome) ----------
  var I18N = {
    en: {
      tag: "ICT · SMC · STRUCTURE", sample: "Sample", live: "Live", swing: "Swing", scalp: "Scalp", dayIct: "Day ICT",
      bias: "Bias", orderBlock: "ORDER BLOCK", fvgLbl: "FAIR VALUE GAP", sslLbl: "SELL-SIDE LIQ.", bslLbl: "BUY-SIDE LIQ.",
      noSource: "No data source", noData: "No data for this instrument yet. Connect a data source in Settings.", tvLoad: "Loading TradingView…", tvFail: "TradingView could not load (needs internet).", chartTitle2: "Chart",
      sniperEntry: "SNIPER ENTRY", stop: "Stop", entry: "Entry", finalTarget: "Final target", targets: "Targets", sweep: "Sweep",
      noSetup: "No active setup", marketsTitle: "Markets", alertsTitle: "Alerts", settingsTitle: "Settings", calendarTitle: "Calendar",
      alertSignal: "Notify me when a new signal appears", alertTp: "Notify me when a trade closes (win or loss)",
      enableNotif: "Enable notifications", alertsNote: "Messages appear on screen while the site is open. On iPhone, system notifications need the site added to the Home Screen.",
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
  var NEW = {
    en: { appName: "Radar", appSub: "Gold & crypto market analysis", live: "Live", structTitle: "ICT + SMC structure",
          modeSwing: "Swing", modeScalp: "Scalp", modeDay: "Day ICT", marketTrend: "Market trend",
          stopLoss: "Stop loss", entryZone: "Entry zone", tp1: "TP1", tp2: "TP2", tp3: "TP3",
          detailTitle: "Detailed analysis (ICT + SMC)", signalBuy: "Buy signal", signalSell: "Sell signal", signalWait: "Wait" },
    ar: { appName: "رادار الأسواق", appSub: "تحليل الذهب والعملات الرقمية", live: "مباشر", structTitle: "هيكل ICT + SMC الفوري",
          modeSwing: "تداول متدرج", modeScalp: "مضاربة سريعة", modeDay: "تداول يومي ICT", marketTrend: "اتجاه السوق",
          stopLoss: "وقف الخسارة", entryZone: "منطقة الدخول", tp1: "الهدف 1", tp2: "الهدف 2", tp3: "الهدف 3",
          detailTitle: "التحليل التفصيلي بنظام ICT + SMC", signalBuy: "إشارة شراء", signalSell: "إشارة بيع", signalWait: "انتظار" }
  };
  Object.keys(NEW).forEach(function (l) { Object.keys(NEW[l]).forEach(function (k) { I18N[l][k] = NEW[l][k]; }); });
  I18N.en.chartTitle = "Live chart"; I18N.ar.chartTitle = "الشارت المباشر";
  I18N.en.zonesBtn = "Zones"; I18N.ar.zonesBtn = "المناطق";
  I18N.en.levelsBtn = "Levels"; I18N.ar.levelsBtn = "المستويات";
  I18N.en.sslLbl = "SSL liquidity"; I18N.en.bslLbl = "BSL liquidity"; I18N.en.fvgLbl = "FVG"; I18N.en.orderBlock = "Order block";
  I18N.ar.sslLbl = "سيولة بيعية SSL"; I18N.ar.bslLbl = "سيولة شرائية BSL"; I18N.ar.fvgLbl = "فجوة FVG"; I18N.ar.orderBlock = "كتلة الأوامر";
  I18N.en.dataUrl = "Live data link (CSV or JSON)";
  I18N.en.dataSave = "Connect data";
  I18N.en.dataClear = "Disconnect";
  I18N.en.dataNote = "The app reads this link every minute. The file needs columns open, high, low, close (and time if available). Each instrument can have its own link.";
  I18N.en.dataOk = "Connected. Last update: ";
  I18N.en.dataFail = "Could not read this link. Check that it is public and returns candles.";
  I18N.ar.dataUrl = "رابط البيانات الحية (CSV أو JSON)";
  I18N.ar.dataSave = "ربط البيانات";
  I18N.ar.dataClear = "فصل";
  I18N.ar.dataNote = "يقرأ التطبيق هذا الرابط كل دقيقة. الأعمدة المطلوبة: open، high، low، close، والوقت إن توفّر. لكل أصل رابطه الخاص.";
  I18N.ar.dataOk = "تم الربط. آخر تحديث: ";
  I18N.ar.dataFail = "تعذّرت قراءة الرابط. تأكد أنه عام ويعيد شموعاً.";
  var NEWS_TXT = {
    en: { newsTitle: "Market news", econTitle: "Economic calendar today", high: "High", medium: "Medium", low: "Low",
          upcoming: "Soon", forecast: "Forecast", previous: "Previous", actual: "Actual", refresh: "Refresh",
          newsNeed: "News needs a provider key. Add FINNHUB_KEY in Netlify environment variables, then redeploy.",
          noEvents: "No high or medium impact events in the next two days.", noNews: "No news available right now.",
          todaySummary: "High-impact events in the next 2 days: ", rule: "Rule of thumb: an actual above forecast usually strengthens the currency, and below weakens it." },
    ar: { newsTitle: "أخبار السوق", econTitle: "التقويم الاقتصادي اليوم", high: "تأثير عالٍ", medium: "تأثير متوسط", low: "تأثير منخفض",
          upcoming: "قريباً", forecast: "المتوقع", previous: "السابق", actual: "الفعلي", refresh: "تحديث",
          newsNeed: "الأخبار تحتاج مفتاح مزود. أضف FINNHUB_KEY في إعدادات Netlify ثم أعد النشر.",
          noEvents: "لا توجد أحداث ذات تأثير عالٍ أو متوسط خلال يومين.", noNews: "لا توجد أخبار متاحة الآن.",
          todaySummary: "أحداث عالية التأثير خلال يومين: ", rule: "قاعدة عامة: الفعلي أعلى من المتوقع يقوّي العملة غالباً، والأقل منه يضعفها." }
  };
  Object.keys(NEWS_TXT).forEach(function (l) { Object.keys(NEWS_TXT[l]).forEach(function (k) { I18N[l][k] = NEWS_TXT[l][k]; }); });
  I18N.ar.noSource = "لا يوجد مصدر بيانات";
  I18N.en.eduTitle = "Key concepts (ICT + SMC)"; I18N.ar.eduTitle = "المفاهيم الأساسية (ICT + SMC)";
  I18N.en.sourcePaxg = "Binance live (PAXG). May differ from XAU/USD on MT5 by a few dollars"; I18N.ar.sourcePaxg = "Binance مباشر (PAXG). قد يختلف عن XAU/USD في MT5 بعدة دولارات";
  I18N.en.sessOpen = "Open now"; I18N.en.sessClosed = "Closed"; I18N.en.sessTz = "Your time zone: ";
  I18N.ar.sessOpen = "مفتوحة الآن"; I18N.ar.sessClosed = "مغلقة"; I18N.ar.sessTz = "توقيتك: ";
  I18N.ar.noData = "لا توجد بيانات لهذا الأصل بعد. اربط مصدر بيانات من الإعدادات.";
  I18N.ar.tvLoad = "جارٍ تحميل TradingView…";
  I18N.ar.tvFail = "تعذّر تحميل TradingView (يحتاج اتصالاً بالإنترنت).";
  I18N.ar.signedInAs = "مسجّل الدخول باسم ";

  var feeds = {}; // id -> { url, updated, ok } (user-provided links)
  var AUTO = { XAU: "XAUUSD", XAG: "XAGUSD", EURUSD: "EURUSD", GBPUSD: "GBPUSD", NAS100: "NAS100" };
  // Only BTC streams live from Binance. Gold comes from Twelve Data (updates every minute).
  var LIVE_SYM = { BTC: "BTCUSDT" };
  var LV = {};
  var autoOk = {}; // id -> true when the built-in data function returned candles
  var MAS = [
    { key: "ema9", type: "ema", len: 9, color: "#ffd166" },
    { key: "ema21", type: "ema", len: 21, color: "#06d6a0" },
    { key: "sma20", type: "sma", len: 20, color: "#8ecae6" },
    { key: "sma100", type: "sma", len: 100, color: "#fb8500" }
  ];
  var st = { show: { ema: true, zones: true, levels: true, rsi: true, bb: false, ema9: false, ema21: false, sma20: false, sma100: false, sma200: false, macd: false }, inst: "BTC", tf: "1h", profile: "balanced", lang: "en", btc: null, btcFetchedTf: null, btcChange: null,
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
    if (id === "BTC") return st.btc || [];
    if (LIVE_SYM[id]) return (LV[id] && LV[id].c) || [];
    return st.csv[id] || [];
  }
  function arrFor(id) { return id === "BTC" ? st.btc : (LV[id] && LV[id].c); }
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
  function autoLoad(forId) {
    var x = BY[forId || st.inst];
    if (!x || !AUTO[x.id] || connectedNow(x.id)) return Promise.resolve();
    var key = x.id + "|" + st.tf;
    // Free data plan allows ~800 requests a day: refresh each instrument at most every 15 minutes.
    if (autoKey[key] && Date.now() - (autoAt[key] || 0) < 900000) return Promise.resolve();
    var url = "/api/candles?symbol=" + AUTO[x.id] + "&interval=" + st.tf;
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
    if (!candlesFor(id).length) return T("noSource");
    if (LIVE_SYM[id] && id !== "BTC") return T("sourcePaxg");
    if (id === "BTC") return st.btc && st.btcFetchedTf ? T("sourceLive") : T("sourceSample");
    if (connectedNow(id)) return T("sourceLinked");
    if (autoOk[id]) return T("sourceAuto");
    return st.csv[id] ? T("sourceCsv") : T("sourceSample");
  }
  function changeFor(id) {
    if (id === "BTC" && st.btcChange != null) return st.btcChange;
    var c = candlesFor(id); if (c.length < 2) return null;
    var from = c[Math.max(0, c.length - 25)].o, last = c[c.length - 1].c;
    return (last - from) / from * 100;
  }

  // ---------- loading ----------
  function klines(tf, sym) {
    return fetch("https://api.binance.com/api/v3/klines?symbol=" + (sym || "BTCUSDT") + "&interval=" + tf + "&limit=500")
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (rows) { return rows.map(function (k) { return { t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] }; }); });
  }
  function change24h() {
    return fetch("https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT")
      .then(function (r) { return r.json(); }).then(function (j) { return +j.priceChangePercent; });
  }
  function loadLive(id) {
    var tf = st.tf;
    return klines(tf, LIVE_SYM[id]).then(function (c) { LV[id] = { c: c, tf: tf }; if (id === "BTC") live(true); })
      .catch(function () { LV[id] = null; });
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
    var id = st.inst;
    if (!LIVE_SYM[id]) return;
    if (!("WebSocket" in window)) { st.poll = setInterval(refresh, 30000); return; }
    try {
      var ws = new WebSocket("wss://stream.binance.com:9443/ws/" + LIVE_SYM[id].toLowerCase() + "@kline_" + st.tf);
      st.ws = ws;
      ws.onmessage = function (ev) {
        var k = JSON.parse(ev.data).k;
        var arr = arrFor(id);
        if (!k || !arr) return;
        var bar = { t: k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v };
        var last = arr[arr.length - 1];
        if (last && last.t === bar.t) arr[arr.length - 1] = bar;
        else if (last && bar.t > last.t) { arr.push(bar); if (arr.length > 500) arr.shift(); }
        if (id === "BTC") live(true);
        analyzeAndRender();
      };
      ws.onerror = function () { if (id === "BTC") live(false); };
      ws.onclose = function () { if (st.ws === ws && st.inst === id) st.poll = st.poll || setInterval(refresh, 30000); };
    } catch (e) { st.poll = setInterval(refresh, 30000); }
  }
  function refresh() {
    var id = st.inst, p = Promise.resolve();
    if (id === "BTC" && st.btcFetchedTf !== st.tf) p = loadBtc();
    else if (LIVE_SYM[id] && id !== "BTC" && (!LV[id] || LV[id].tf !== st.tf)) p = loadLive(id);
    p.then(analyzeAndRender);
  }

  // ---------- analysis and render ----------
  function analyzeAndRender() {
    var c = candlesFor(st.inst);
    st.res = c.length ? A.analyze(c, st.profile, learnFromJournal()) : { ready: false, reason: T("noData") };
    var evs = journalUpdate();
    renderTickers();
    render();
    renderJournal();
    renderMarkets();
    if (OWN) paintOwn();
    evs.forEach(announce);
  }

  function renderTickers() {
    var row = $("tickers"); if (!row) return;
    row.textContent = "";
    INST.forEach(function (x) {
      var c = candlesFor(x.id), last = c.length ? c[c.length - 1].c : null, ch = changeFor(x.id);
      var b = el("button", "tk" + (x.id === "XAU" ? " gold" : ""));
      b.type = "button"; b.setAttribute("aria-pressed", String(x.id === st.inst));
      b.appendChild(el("span", "sym", x.name));
      b.appendChild(el("span", "px", fmtD(last, x.digits)));
      b.appendChild(el("span", "pct" + (ch != null && ch < 0 ? " neg" : ""), ch == null ? "—" : (ch >= 0 ? "+" : "") + ch.toFixed(2) + "%"));
      b.addEventListener("click", function () { setInst(x.id); });
      row.appendChild(b);
    });
    txt("asset-name", BY[st.inst].name);
    txt("src", sourceFor(st.inst));
  }

  function render() {
    var r = st.res;
    if (!r || !r.ready) { var nt = $("trend-line"); nt.textContent = r ? r.reason : T("loading"); nt.className = "trend note"; return; }
    var s = r.signal, sell = s && s.dir === "SHORT", buy = s && s.dir === "LONG";
    var cls = buy ? "buy" : sell ? "sell" : "wait";
    var conf = Math.min(99, Math.round(Math.max(r.longScore, r.shortScore) / 12 * 100));

    txt("tf-name", TF_NAME[st.tf]);
    txt("chart-title", T("bias") + " · " + TF_NAME[st.tf]);
    document.querySelectorAll("[data-tf]").forEach(function (b) { b.setAttribute("aria-selected", String(b.getAttribute("data-tf") === st.tf)); });

    var badge = $("signal-badge");
    badge.className = "badge " + cls;
    badge.textContent = s ? T(sell ? "signalSell" : "signalBuy") + " • " + conf : T("signalWait") + " • " + conf;

    var trendTxt = r.trend === "bear" ? T("bearTrend") : r.trend === "bull" ? T("bullTrend") : T("ranging");
    if (!s && r.reasons.length && !r.trend) trendTxt = T("ranging");
    var tl = $("trend-line"); tl.textContent = trendTxt; tl.className = "trend " + cls;

    var tb = $("trend-bar");
    tb.style.width = (s ? 100 : Math.min(100, Math.round(Math.abs(r.longScore - r.shortScore) / 12 * 100))) + "%";
    tb.className = r.longScore > r.shortScore ? "buy" : "";

    var arc = $("ring-arc");
    arc.setAttribute("stroke", buy ? "#33d69a" : sell ? "#ff6b6b" : "#7d7a72");
    arc.setAttribute("stroke-dasharray", (conf / 100 * 195).toFixed(1) + " 195");
    txt("ring-num", String(conf));

    renderChart(r);

    txt("z-ob", r.ob ? fmt(r.ob.lo) + " – " + fmt(r.ob.hi) : "—");
    txt("z-fvg", r.fvg ? fmt(r.fvg.lo) + " – " + fmt(r.fvg.hi) : "—");
    txt("z-ssl", r.ssl != null ? fmt(r.ssl) : "—");
    txt("z-bsl", r.bsl != null ? fmt(r.bsl) : "—");

    if (s) {
      var rr = function (x) { return ((Math.abs(x - s.entry)) / s.risk).toFixed(1) + "R"; };
      txt("p-sl", fmt(s.sl)); txt("p-en", fmt(s.entry));
      txt("p-t1", fmt(s.tp1)); txt("p-t2", fmt(s.tp2)); txt("p-t3", fmt(s.tp3));
    } else {
      txt("p-sl", "—"); txt("p-en", "—"); txt("p-t1", "—"); txt("p-t2", "—"); txt("p-t3", "—");
    }
    renderLevels(r);
  }

  // ---------- chart ----------
  function svgEl(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { if (attrs[k] != null) e.setAttribute(k, attrs[k]); });
    return e;
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
      card.appendChild(head); card.appendChild(el("p", "lvl-p", lv.lines.join(" ")));
      box.appendChild(card);
    });
  }

  // Loads every automatic instrument so the markets table shows live prices for all of them.
  function loadAllForMarkets() {
    return Promise.all(INST.map(function (x) { return LIVE_SYM[x.id] && x.id !== "BTC" ? loadLive(x.id) : autoLoad(x.id); })).then(function () { renderMarkets(); analyzeAndRender(); });
  }
  function renderMarkets() {
    var box = $("markets"); if (!box) return;
    box.textContent = "";
    INST.forEach(function (x) {
      var c = candlesFor(x.id), last = c.length ? c[c.length - 1].c : null, ch = changeFor(x.id);
      var d = el("div", "muted");
      d.style.cssText = "display:flex;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.07)";
      d.appendChild(el("span", "", x.name + " · " + sourceFor(x.id)));
      d.appendChild(el("b", "", fmtD(last, x.digits) + "  " + (ch == null ? "" : (ch >= 0 ? "+" : "") + ch.toFixed(2) + "%")));
      box.appendChild(d);
    });
  }

  // ---------- trade journal ----------
  var JKEY = "baqerJournal";
  function loadJournal() { return store(JKEY) || []; }
  function saveJournal(j) { store(JKEY, j.slice(-1500)); }
  function journalStats(j) {
    var closed = j.filter(function (e) { return e.status !== "open"; });
    var wins = closed.filter(function (e) { return e.status === "win"; }).length;
    var byKey = {};
    closed.forEach(function (e) { var g = byKey[e.key] || (byKey[e.key] = { n: 0, w: 0 }); g.n++; if (e.status === "win") g.w++; });
    return { closed: closed.length, wins: wins, losses: closed.length - wins, byKey: byKey };
  }
  // Visible rule: a pattern that lost most of its last trades (6+ closed, under 25% wins) is paused;
  // poor overall results (5+ closed, under 40% wins) require 2 more points before a decision.
  // Why did a loss happen? Tags are set when the trade closes:
  //  against_ema   : entered against the EMA50 trend
  //  tight_stop    : stopped out, then price reached TP1 within 20 candles
  //  quick_reversal: stopped out within 3 candles of entry
  function tagLoss(e) {
    var tags = [];
    var c = candlesFor(e.inst), long = e.dir === "LONG";
    if (e.against) tags.push("against_ema");
    var idx = -1;
    for (var i = 0; i < c.length; i++) if (c[i].t === e.closeT) { idx = i; break; }
    if (idx >= 0) {
      for (var j = idx + 1; j < Math.min(c.length, idx + 21); j++) {
        if (long ? c[j].h >= e.tp1 : c[j].l <= e.tp1) { tags.push("tight_stop"); break; }
      }
      var ent = -1;
      for (var k = 0; k < c.length; k++) if (c[k].t === e.t) { ent = k; break; }
      if (ent >= 0 && idx - ent <= 3) tags.push("quick_reversal");
    }
    return tags;
  }
  function learnFromJournal() {
    var j = loadJournal(), s = journalStats(j), block = [];
    Object.keys(s.byKey).forEach(function (k) { var g = s.byKey[k]; if (g.n >= 6 && g.w / g.n < 0.25) block.push(k); });
    var overall = s.closed >= 5 ? s.wins / s.closed : 1;
    var losses = j.filter(function (e) { return e.status === "loss"; });
    var againstN = losses.filter(function (e) { return e.tags && e.tags.indexOf("against_ema") >= 0; }).length;
    var tightN = losses.filter(function (e) { return e.tags && e.tags.indexOf("tight_stop") >= 0; }).length;
    return {
      extra: overall < 0.4 ? 2 : 0,
      block: block,
      requireEma: losses.length >= 4 && againstN / losses.length >= 0.6,
      widen: tightN >= 3 ? 0.2 : 0,
      lessons: [
        losses.length && againstN / losses.length >= 0.6 ? "أغلب الخسائر كانت ضد اتجاه EMA50، لذلك لن تُفتح صفقة ضد المتوسط الآن." : null,
        tightN >= 3 ? "عدة صفقات وصلت إلى الهدف الأول بعد ضرب الوقف، لذلك وُسّع الوقف 0.2 ATR." : null,
        losses.filter(function (e) { return e.tags && e.tags.indexOf("quick_reversal") >= 0; }).length >= 3 ? "عدة خسائر انعكست خلال 3 شموع، فالدخول المبكر يحتاج تأكيداً أكبر." : null
      ].filter(Boolean)
    };
  }
  // Records a signal once per instrument, direction and entry price.
  function addSignal(j, x, sg, t, price, ema50, events, emit) {
    var d = x.digits;
    var id = x.id + "|" + sg.key + "|" + sg.entry.toFixed(d);
    if (j.some(function (e) { return e.id === id; })) return false;
    var against = (sg.dir === "LONG" && !(price > ema50)) || (sg.dir === "SHORT" && !(price < ema50));
    var e = { id: id, inst: x.id, key: sg.key, dir: sg.dir, entry: sg.entry, sl: sg.sl, tp1: sg.tp1, t: t, status: "open", against: against };
    j.push(e);
    if (emit) events.push({ type: "open", e: e });
    return true;
  }
  // Replays the analysis over past candles once per instrument and timeframe, so the journal and
  // the monthly report already contain the signals the app would have given before this visit.
  function backfill(x, c, profile, j, events) {
    var flag = "baqerBf|" + x.id + "|" + st.tf + "|" + profile;
    if (store(flag)) return false;
    for (var i = 60; i < c.length; i++) {
      var r = A.analyze(c.slice(0, i + 1), profile, null);
      if (r.ready && r.signal) addSignal(j, x, r.signal, c[i].t, r.price, r.ema50, events, false);
    }
    store(flag, true);
    return true;
  }
  // Called on every refresh. Returns events (new signal / closed trade) for the notifier.
  function journalUpdate() {
    var j = loadJournal(), changed = false, events = [], learn = learnFromJournal();
    INST.forEach(function (x) {
      var c = candlesFor(x.id);
      if (c.length < 60) return;
      if (backfill(x, c, st.profile, j, events)) changed = true;
      var r = A.analyze(c, st.profile, learn);
      if (r.ready && r.signal && addSignal(j, x, r.signal, c[c.length - 1].t, r.price, r.ema50, events, true)) changed = true;
    });
    j.forEach(function (e) {
      if (e.status !== "open") return;
      var c = candlesFor(e.inst), long = e.dir === "LONG";
      for (var i = 0; i < c.length; i++) {
        if (!(c[i].t > e.t)) continue;
        var hitStop = long ? c[i].l <= e.sl : c[i].h >= e.sl;
        var hitTP = long ? c[i].h >= e.tp1 : c[i].l <= e.tp1;
        if (hitStop) { e.status = "loss"; e.closeT = c[i].t; changed = true; events.push({ type: "close", e: e }); break; }
        if (hitTP) { e.status = "win"; e.closeT = c[i].t; changed = true; events.push({ type: "close", e: e }); break; }
      }
    });
    j.forEach(function (e) { if (e.status === "loss" && !e.tags) { e.tags = tagLoss(e); changed = true; } });
    if (changed) saveJournal(j);
    return events;
  }

  // ---------- monthly report: points won and lost per instrument ----------
  var REP = {
    en: { title: "Monthly report", none: "No closed trades yet.", trades: "Trades", wins: "Wins", losses: "Losses", won: "Points won", lost: "Points lost", net: "Net", note: "Points are price units (dollars for gold and BTC). Each instrument is shown separately." },
    ar: { title: "التقرير الشهري", none: "لا توجد صفقات مغلقة بعد.", trades: "الصفقات", wins: "رابحة", losses: "خاسرة", won: "نقاط ربح", lost: "نقاط خسارة", net: "الصافي", note: "النقاط وحدات السعر (دولار للذهب والبيتكوين). كل أصل يظهر منفصلاً." }
  };
  function monthKey(t) { var d = new Date(t); return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0"); }
  function monthlyReport(j) {
    var m = {};
    j.forEach(function (e) {
      if (e.status !== "win" && e.status !== "loss") return;
      var k = monthKey(e.closeT || e.t);
      var g = m[k] || (m[k] = { trades: 0, wins: 0, losses: 0, inst: {} });
      var gi = g.inst[e.inst] || (g.inst[e.inst] = { wins: 0, losses: 0, won: 0, lost: 0 });
      var win = Math.abs(e.tp1 - e.entry), loss = Math.abs(e.entry - e.sl);
      g.trades++; gi.wins += e.status === "win" ? 1 : 0; gi.losses += e.status === "loss" ? 1 : 0;
      if (e.status === "win") { g.wins++; gi.won += win; } else { g.losses++; gi.lost += loss; }
    });
    return m;
  }
  function renderReport() {
    var box = $("report-box"); if (!box) return;
    var L = st.lang === "ar" ? REP.ar : REP.en;
    var m = monthlyReport(loadJournal()), keys = Object.keys(m).sort().reverse();
    box.textContent = "";
    box.appendChild(el("h2", "", L.title));
    if (!keys.length) { box.appendChild(el("p", "muted", L.none)); return; }
    keys.slice(0, 12).forEach(function (k) {
      var g = m[k];
      var card = el("div", "rep-m");
      card.appendChild(el("b", "", k));
      card.appendChild(el("p", "muted", L.trades + ": " + g.trades + " · " + L.wins + ": " + g.wins + " · " + L.losses + ": " + g.losses));
      Object.keys(g.inst).forEach(function (id) {
        var gi = g.inst[id], d = BY[id].digits;
        var row = el("div", "rep-i");
        row.appendChild(el("span", "", BY[id].name));
        row.appendChild(el("span", "up", "+" + gi.won.toFixed(d)));
        row.appendChild(el("span", "down", "−" + gi.lost.toFixed(d)));
        row.appendChild(el("b", gi.won - gi.lost >= 0 ? "up" : "down", (gi.won - gi.lost >= 0 ? "+" : "−") + Math.abs(gi.won - gi.lost).toFixed(d)));
        card.appendChild(row);
      });
      box.appendChild(card);
    });
    box.appendChild(el("p", "muted rep-note", L.note));
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
    L.lessons.forEach(function (t) { box.appendChild(el("p", "muted", "• " + t)); });
    var btn = el("button", "btn", T("clearJournal")); btn.type = "button";
    btn.addEventListener("click", function () { saveJournal([]); analyzeAndRender(); });
    box.appendChild(btn);
    renderReport();
  }

  // ---------- alerts: in-page message always, system notification when allowed ----------
  function toast(msg) {
    var t = el("div", "toast", msg);
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add("out"); }, 4800);
    setTimeout(function () { t.remove(); }, 5400);
  }
  function announce(ev) {
    var x = BY[ev.e.inst], d = x.digits, ar = st.lang === "ar", msg;
    if (ev.type === "open") {
      if (!st.prefs.signal) return;
      msg = (ar ? (ev.e.dir === "LONG" ? "إشارة شراء" : "إشارة بيع") : (ev.e.dir === "LONG" ? "Buy signal" : "Sell signal")) + " · " + x.name + " · " + ev.e.entry.toFixed(d);
    } else {
      if (!st.prefs.tp) return;
      var won = ev.e.status === "win", pts = won ? Math.abs(ev.e.tp1 - ev.e.entry) : Math.abs(ev.e.entry - ev.e.sl);
      msg = (ar ? (won ? "ربح" : "خسارة") : (won ? "Win" : "Loss")) + " · " + x.name + " · " + (won ? "+" : "−") + pts.toFixed(d) + (ar ? " نقطة" : " pts");
    }
    toast(msg);
    if ("Notification" in window && Notification.permission === "granted") { try { new Notification("Baqer Sniper", { body: msg }); } catch (e) {} }
  }

  // ---------- alerts ----------
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
    renderSessions();
    renderEdu();
    if (NEWS.ok !== null) renderNews();
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
    if (v === "calendar") loadNews(false);
    if (v === "analysis") render();
  }
  function setInst(id) {
    st.inst = id; renderTV();
    if (id === "BTC") { loadBtc().then(function () { connect(); analyzeAndRender(); }); }
    else if (LIVE_SYM[id]) { loadLive(id).then(function () { connect(); analyzeAndRender(); }); }
    else { stopStreams(); live(false); autoLoad().then(analyzeAndRender); }
    var sel = $("inst-select"); if (sel) sel.value = id;
  }
  // Each trading style sets its timeframe and risk profile together.
  var STYLE = { "15m": "scalp", "1h": "balanced", "4h": "balanced" };
  function setTf(tf) {
    st.tf = tf; tick(); renderTV();
    st.profile = STYLE[tf] || "balanced";
    var pr = $("profile"); if (pr) pr.value = st.profile;
    autoLoad().then(function () { if (st.inst !== "BTC") analyzeAndRender(); });
    if (st.inst === "BTC") loadBtc().then(function () { connect(); analyzeAndRender(); });
    else if (LIVE_SYM[st.inst]) loadLive(st.inst).then(function () { connect(); analyzeAndRender(); });
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

  // ---------- TradingView: the only chart ----------
  var TV_SYM = { BTC: "BINANCE:BTCUSDT", XAU: "OANDA:XAUUSD", XAG: "OANDA:XAGUSD", EURUSD: "FX:EURUSD", GBPUSD: "FX:GBPUSD", NAS100: "NASDAQ:NDX" };
  var TV_INT = { "15m": "15", "1h": "60", "4h": "240" };
  var MA_STUDY = {
    ema9: { id: "MAExp@tv-basicstudies", length: 9 },
    ema21: { id: "MAExp@tv-basicstudies", length: 21 },
    ema: { id: "MAExp@tv-basicstudies", length: 50 },
    sma20: { id: "MASimple@tv-basicstudies", length: 20 },
    sma100: { id: "MASimple@tv-basicstudies", length: 100 },
    sma200: { id: "MASimple@tv-basicstudies", length: 200 }
  };
  function tvStudies() {
    return Object.keys(MA_STUDY).filter(function (k) { return st.show[k]; }).map(function (k) {
      return { id: MA_STUDY[k].id, inputs: { length: MA_STUDY[k].length } };
    });
  }
  var tvLoading = false, tvWaiting = false;

  // ---------- own chart: candles, moving averages, zones from our analysis, drawing tools ----------
  var LWC_URL = "vendor/lightweight-charts.js"; // served from this site (no external CDN needed)
  var OWN = null, owcFailed = false, owcLoading = false;
  var DRAW = {};   // drawings per instrument: { type: "trend" | "hline", ... }
  var drawMode = null, pending = null;
  var MA_OWN = { ema9: ["ema", 9, "#f0cc6e"], ema21: ["ema", 21, "#a78bfa"], ema: ["ema", 50, "#5aa8ff"], sma20: ["sma", 20, "#e2e8f0"], sma100: ["sma", 100, "#fb923c"], sma200: ["sma", 200, "#fb7185"] };
  function loadOwnLib(cb) {
    if (window.LightweightCharts) return cb();
    if (owcLoading) return;
    owcLoading = true;
    var s = document.createElement("script");
    s.src = LWC_URL;
    s.onload = function () { owcLoading = false; cb(); };
    s.onerror = function () { owcLoading = false; owcFailed = true; renderTV(); };
    document.head.appendChild(s);
  }
  function ownData() {
    var c = candlesFor(st.inst), out = [], prev = -Infinity;
    c.forEach(function (k, i) {
      var t = k.t > 1e12 ? Math.floor(k.t / 1000) : (k.t > 0 ? Math.floor(k.t / 1000) : i + 1);
      if (t <= prev) t = prev + 1;
      prev = t;
      out.push({ time: t, open: k.o, high: k.h, low: k.l, close: k.c, volume: k.v || 0 });
    });
    return out;
  }
  function drawsFor() { return DRAW[st.inst] || (DRAW[st.inst] = []); }
  function renderOwn(box) {
    box.textContent = "";
    var wrap = el("div", "own-wrap");
    var host = el("div", "own-chart");
    var ov = el("div", "own-ov");
    wrap.appendChild(host); wrap.appendChild(ov); box.appendChild(wrap);
    var chart = LightweightCharts.createChart(host, {
      width: host.clientWidth || 340, height: 496,
      layout: { background: { type: "solid", color: "#0b1424" }, textColor: "#8c99ad", fontSize: 11, fontFamily: "Inter, system-ui, sans-serif" },
      grid: { vertLines: { color: "rgba(70,120,200,.07)" }, horzLines: { color: "rgba(70,120,200,.07)" } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.14, bottom: 0.12 } },
      timeScale: { borderVisible: false, timeVisible: true, rightOffset: 4, barSpacing: 7 },
      crosshair: { mode: 0, vertLine: { color: "rgba(232,195,90,.55)", width: 1, style: 2, labelBackgroundColor: "#e8c35a" }, horzLine: { color: "rgba(232,195,90,.55)", width: 1, style: 2, labelBackgroundColor: "#e8c35a" } },
      handleScroll: true, handleScale: true
    });
    var cs = chart.addCandlestickSeries({ upColor: "rgba(34,211,238,0.10)", downColor: "#f43f5e", borderVisible: true, borderUpColor: "#22d3ee", borderDownColor: "#f43f5e", wickUpColor: "#22d3ee", wickDownColor: "#f43f5e", priceLineColor: "#e8c35a", priceLineStyle: 2 });
    var series = {};
    Object.keys(MA_OWN).forEach(function (k) { series[k] = chart.addLineSeries({ color: MA_OWN[k][2], lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false }); });
    OWN = { chart: chart, cs: cs, series: series, ov: ov, host: host, lines: [] };
    chart.timeScale().subscribeVisibleTimeRangeChange(paintOverlays);
    window.addEventListener("resize", function () { if (OWN) OWN.chart.applyOptions({ width: host.clientWidth }); paintOverlays(); });
    paintOwn();
  }
  function draw_toggle(mode) { return drawMode === mode ? null : mode; }
  function refreshDrawBtns() {
    document.querySelectorAll("[data-draw]").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-draw") === drawMode);
    });
  }
  function onOwnClick(p) {
    if (!OWN || !drawMode || !p || p.point == null) return;
    var price = OWN.cs.coordinateToPrice(p.point.y);
    if (price == null) return;
    if (drawMode === "hline") { drawsFor().push({ type: "hline", price: price }); paintOwn(); return; }
    if (drawMode === "trend") {
      if (!p.time) return;
      if (!pending) { pending = { time: p.time, price: price }; }
      else { drawsFor().push({ type: "trend", a: pending, b: { time: p.time, price: price } }); pending = null; paintOwn(); }
    }
  }
  function paintOwn() {
    if (!OWN) return;
    var data = ownData();
    OWN.cs.setData(data);
    var closes = data.map(function (d) { return d.close; });
    Object.keys(MA_OWN).forEach(function (k) {
      var spec = MA_OWN[k], vals = spec[0] === "ema" ? A.ema(closes, spec[1]) : A.sma(closes, spec[1]);
      var rows = st.show[k] ? data.map(function (d, i) { return vals[i] != null ? { time: d.time, value: vals[i] } : null; }).filter(Boolean) : [];
      OWN.series[k].setData(rows);
    });
    OWN.data = data;
    OWN.lines.forEach(function (l) { try { OWN.cs.removePriceLine(l); } catch (x) {} });
    OWN.lines = [];
    var r = st.res || {};
    if (r.bsl) OWN.lines.push(OWN.cs.createPriceLine({ price: r.bsl, color: "#4f9bff", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "BSL" }));
    if (r.ssl) OWN.lines.push(OWN.cs.createPriceLine({ price: r.ssl, color: "#ff6b6b", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "SSL" }));
    refreshDrawBtns();
    paintOverlays();
  }
  function paintOverlays() {
    if (!OWN || !OWN.data) return;
    var ov = OWN.ov, r = st.res || {}, d = OWN.data, ts = OWN.chart.timeScale(), cs = OWN.cs;
    var W = OWN.host.clientWidth, H = OWN.host.clientHeight;
    ov.textContent = "";
    function xOf(t) { var x = ts.timeToCoordinate(t); return x == null ? null : x; }
    function box(lo, hi, x0, color, label) {
      var y1 = cs.priceToCoordinate(hi), y2 = cs.priceToCoordinate(lo);
      if (y1 == null || y2 == null) return;
      var x1 = x0 == null ? 0 : (xOf(x0) == null ? 0 : xOf(x0));
      var b = el("div", "own-z");
      b.style.cssText = "left:" + x1 + "px;width:" + Math.max(0, W - x1) + "px;top:" + Math.min(y1, y2) + "px;height:" + Math.max(2, Math.abs(y2 - y1)) + "px;background:" + color;
      if (label) b.appendChild(el("span", "own-zl", label));
      ov.appendChild(b);
    }
    if (r.ob && d[r.ob.i]) box(r.ob.lo, r.ob.hi, d[r.ob.i].time, r.ob.dir === "bull" ? "rgba(47,208,139,.20)" : "rgba(139,92,246,.30)", r.ob.dir === "bull" ? "DEMAND" : "SUPPLY");
    if (r.fvg && d[r.fvg.i]) box(r.fvg.lo, r.fvg.hi, d[r.fvg.i].time, "rgba(232,195,90,.14)", "FVG");
    var svgNS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width", W); svg.setAttribute("height", H); svg.setAttribute("class", "own-svg");
    function line(x1, y1, x2, y2, dash) {
      var l = document.createElementNS(svgNS, "line");
      l.setAttribute("x1", x1); l.setAttribute("y1", y1); l.setAttribute("x2", x2); l.setAttribute("y2", y2);
      l.setAttribute("stroke", "#e8c35a"); l.setAttribute("stroke-width", "1.6");
      if (dash) l.setAttribute("stroke-dasharray", "5 4");
      svg.appendChild(l);
    }
    drawsFor().forEach(function (dr) {
      if (dr.type === "hline") { var y = cs.priceToCoordinate(dr.price); if (y != null) line(0, y, W, y, true); }
      if (dr.type === "trend") {
        var x1 = xOf(dr.a.time), x2 = xOf(dr.b.time), ya = cs.priceToCoordinate(dr.a.price), yb = cs.priceToCoordinate(dr.b.price);
        if (x1 != null && x2 != null && ya != null && yb != null) line(x1, ya, x2, yb, false);
      }
    });
    if (pending) { var px = xOf(pending.time), py = cs.priceToCoordinate(pending.price); if (px != null && py != null) { var dot = document.createElementNS(svgNS, "circle"); dot.setAttribute("cx", px); dot.setAttribute("cy", py); dot.setAttribute("r", 4); dot.setAttribute("fill", "#e8c35a"); svg.appendChild(dot); } }
    ov.appendChild(svg);
  }

  function renderTV() {
    var box = $("tv"); if (!box) return;
    if (!owcFailed) {
      if (!window.LightweightCharts) { box.textContent = T("tvLoad"); loadOwnLib(renderTV); return; }
      OWN = null;
      return renderOwn(box);
    }
    if (typeof TradingView === "undefined") {
      if (!tvWaiting) {
        tvWaiting = true;
        var s = document.createElement("script");
        s.src = "https://s3.tradingview.com/tv.js";
        s.onload = function () { tvWaiting = false; renderTV(); };
        s.onerror = function () { box.textContent = T("tvFail"); };
        document.head.appendChild(s);
      }
      box.textContent = T("tvLoad");
      return;
    }
    box.textContent = "";
    var holder = document.createElement("div"); holder.id = "tv-holder"; holder.style.height = "600px";
    box.appendChild(holder);
    new TradingView.widget({
      autosize: true, symbol: TV_SYM[st.inst] || "BINANCE:BTCUSDT", interval: TV_INT[st.tf] || "60",
      timezone: "Etc/UTC", theme: "dark", style: "1", locale: st.lang === "ar" ? "ar_AE" : "en",
      toolbar_bg: "#07090c", enable_publishing: false, hide_side_toolbar: true, allow_symbol_change: false, hide_legend: false, withdateranges: false, details: false, hotlist: false, calendar: false, show_popup_button: false, save_image: false, backgroundColor: "#07090c", gridColor: "rgba(120,140,170,.08)",
      container_id: "tv-holder", studies: tvStudies().concat(["Volume@tv-basicstudies", "BB@tv-basicstudies", "RSI@tv-basicstudies"])
    });
  }
  // Reading under the chart: what the structure shows right now.
  function renderChart(r) {
    txt("chart-price", r && r.ready ? fmt(r.price) : "—");
    if (!r || !r.ready) { txt("chart-read", r ? r.reason : ""); return; }
    var sty = A.story(r, st.lang);
    if (sty) txt("chart-read", [sty.l1.state, sty.l2.state, sty.l3.state].join(" · ") + " — " + (r.signal ? (r.signal.dir === "LONG" ? T("signalBuy") : T("signalSell")) : T("signalWait")));
  }

  // ---------- news and economic calendar (via the news function) ----------
  var NEWS = { cal: [], news: [], ok: null, at: 0 };
  function loadNews(force) {
    if (!force && NEWS.at && Date.now() - NEWS.at < 300000) return Promise.resolve();
    return fetch("/api/news", { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (j) { NEWS.cal = j.calendar || []; NEWS.news = j.news || []; NEWS.ok = true; })
      .catch(function () { NEWS.ok = false; })
      .then(function () { NEWS.at = Date.now(); renderNews(); });
  }
  // ---------- sessions: computed from the visitor's device time zone ----------
  var SESS = [
    { k: "sessLondon", tz: "Europe/London", s: 8, e: 17 },
    { k: "sessNewYork", tz: "America/New_York", s: 8, e: 17 },
    { k: "sessAsia", tz: "Asia/Tokyo", s: 9, e: 18 }
  ];
  function zoneInfo(d, tz) {
    var p = {};
    new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, weekday: "short" })
      .formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
    var asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, (+p.hour) % 24, +p.minute, +p.second);
    p.offset = asUtc - Math.floor(d.getTime() / 1000) * 1000;
    return p;
  }
  function sessionAt(now, tz, hour) {
    var p = zoneInfo(now, tz);
    return Date.UTC(+p.year, +p.month - 1, +p.day, hour, 0, 0) - p.offset;
  }
  function renderSessions() {
    var ul = $("sessions"); if (!ul) return;
    var now = new Date(), userTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    var loc = st.lang === "ar" ? "ar" : "en-GB";
    var fmt = function (ms) { return new Date(ms).toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" }); };
    ul.textContent = "";
    SESS.forEach(function (x) {
      var p = zoneInfo(now, x.tz);
      var weekend = p.weekday === "Sat" || p.weekday === "Sun";
      var start = sessionAt(now, x.tz, x.s), end = sessionAt(now, x.tz, x.e);
      var open = !weekend && now.getTime() >= start && now.getTime() < end;
      var li = el("li", "");
      var top = el("div", "");
      top.appendChild(el("b", "", T(x.k)));
      top.appendChild(el("span", open ? "sess-state on" : "sess-state", T(open ? "sessOpen" : "sessClosed")));
      li.appendChild(top);
      li.appendChild(el("span", "muted", fmt(start) + " – " + fmt(end)));
      ul.appendChild(li);
    });
    txt("sess-tz", T("sessTz") + userTz);
  }

  // ---------- event names and countries in Arabic (fallback: original English) ----------
  var CTRY_AR = { USD: "أمريكا", EUR: "منطقة اليورو", GBP: "بريطانيا", CAD: "كندا", JPY: "اليابان", CNY: "الصين", AUD: "أستراليا", NZD: "نيوزيلندا", CHF: "سويسرا" };
  var EVT_AR = [
    [/non-?farm|nfp/i, "الوظائف غير الزراعية"],
    [/unemployment claims|jobless claims/i, "طلبات إعانة البطالة"],
    [/unemployment rate/i, "معدل البطالة"],
    [/average hourly earnings/i, "متوسط الأجور بالساعة"],
    [/employment change/i, "التغير في التوظيف"],
    [/\badp\b/i, "تقرير ADP للتوظيف"],
    [/core pce/i, "مؤشر PCE الأساسي"],
    [/\bpce\b/i, "مؤشر PCE"],
    [/cpi/i, "مؤشر أسعار المستهلك CPI"],
    [/ppi/i, "مؤشر أسعار المنتجين PPI"],
    [/gdp/i, "الناتج المحلي الإجمالي"],
    [/retail sales/i, "مبيعات التجزئة"],
    [/ism manufacturing/i, "مؤشر ISM للتصنيع"],
    [/ism services/i, "مؤشر ISM للخدمات"],
    [/philly fed/i, "مؤشر فيلادلفيا الصناعي"],
    [/empire state/i, "مؤشر ولاية نيويورك الصناعي"],
    [/industrial production/i, "الإنتاج الصناعي"],
    [/trade balance/i, "الميزان التجاري"],
    [/current account/i, "الحساب الجاري"],
    [/housing starts/i, "بدء الإسكان"],
    [/building permits/i, "تصاريح البناء"],
    [/consumer confidence|michigan/i, "ثقة المستهلك"],
    [/interest rate decision|rate decision|main refinancing/i, "قرار سعر الفائدة"],
    [/fomc/i, "الاحتياطي الفيدرالي (FOMC)"],
    [/\becb\b/i, "البنك المركزي الأوروبي"],
    [/\bboe\b|bank of england/i, "بنك إنجلترا"],
    [/\bboj\b|bank of japan/i, "بنك اليابان"]
  ];
  function localEvent(e) {
    var title = e.event || "";
    if (st.lang !== "ar") return { c: e.country || "", t: title };
    var c = CTRY_AR[e.country] || e.country || "";
    if (/speaks|speech|testif|press conference/i.test(title)) return { c: c, t: "تصريح: " + title };
    for (var i = 0; i < EVT_AR.length; i++) { if (EVT_AR[i][0].test(title)) return { c: c, t: EVT_AR[i][1] }; }
    return { c: c, t: title };
  }
  // TradingView economic calendar widget (free embed; language follows the app).
  function renderTvCal() {
    var box = $("tv-cal"); if (!box) return;
    box.textContent = "";
    var wrap = el("div", "tradingview-widget-container");
    wrap.appendChild(el("div", "tradingview-widget-container__widget"));
    var sc = document.createElement("script");
    sc.type = "text/javascript";
    sc.src = "https://s3.tradingview.com/external-embedding/embed-widget-events.js";
    sc.async = true;
    sc.textContent = JSON.stringify({ colorTheme: "dark", isTransparent: true, width: "100%", height: "520", locale: st.lang === "ar" ? "ar" : "en", importanceFilter: "0,1", countryFilter: "us,eu,gb,jp,cn,ca,au,nz,ch" });
    wrap.appendChild(sc);
    box.appendChild(wrap);
  }
  // ---------- concept guide shown under the analysis ----------
  var EDU = {
    en: [
      ["Market structure (BOS / CHoCH)", "A break of structure (BOS) continues the trend. A change of character (CHoCH) is the first sign the trend may be reversing. Trade only after the break is confirmed."],
      ["Liquidity and sweeps", "Price often runs above highs (buy-side liquidity, BSL) or below lows (sell-side liquidity, SSL) to trigger stops, then reverses. A sweep that closes back inside the range is a stronger signal."],
      ["Order block", "The last opposite candle before a strong impulse. Price often returns to it before continuing. The stronger the impulse, the more reliable the zone."],
      ["Fair value gap (FVG)", "A three-candle imbalance where price moved too fast and left a gap. Price often returns to fill part of it."],
      ["Premium and discount", "Above the midpoint of the recent range is premium (look for sells). Below it is discount (look for buys). The best entries are in the zone that matches the trend."],
      ["EMA 50 and trend", "Price above the EMA favours buys, below favours sells. The EMA is a filter, not a trigger."],
      ["Risk first", "Define the stop before the entry. Risk a fixed small percentage per trade. The analysis is educational and not financial advice."]
    ],
    ar: [
      ["هيكل السوق (BOS / CHoCH)", "كسر الهيكل (BOS) يؤكد استمرار الاتجاه. تغيّر الطابع (CHoCH) هو أول إشارة على احتمال انعكاس الاتجاه. لا تدخل إلا بعد تأكيد الكسر."],
      ["السيولة والاصطياد (Sweep)", "يتحرك السعر غالباً فوق القمم (سيولة شراء BSL) أو تحت القيعان (سيولة بيع SSL) ليضرب أوامر الإيقاف، ثم ينعكس. الاصطياد الذي يغلق داخل النطاق إشارة أقوى."],
      ["كتلة الأوامر (Order Block)", "آخر شمعة معاكسة قبل اندفاع قوي. يعود السعر إليها غالباً قبل أن يكمل. كلما كان الاندفاع أقوى كانت المنطقة أكثر موثوقية."],
      ["فجوة القيمة العادلة (FVG)", "فجوة من ثلاث شموع يتحرك فيها السعر بسرعة فيترك فراغاً. يعود السعر غالباً ليملأ جزءاً منها."],
      ["Premium و Discount", "فوق منتصف النطاق الأخير هو Premium (ابحث عن البيع). تحته هو Discount (ابحث عن الشراء). أفضل الدخول يكون في المنطقة التي تتوافق مع الاتجاه."],
      ["المتوسط EMA 50", "السعر فوق المتوسط يفضّل الشراء، وتحته يفضّل البيع. المتوسط فلتر وليس زناد دخول."],
      ["المخاطرة أولاً", "حدّد وقف الخسارة قبل الدخول، وخاطر بنسبة ثابتة وصغيرة في كل صفقة. التحليل تعليمي وليس نصيحة مالية."]
    ]
  };
  function renderEdu() {
    var box = $("edu-list"); if (!box) return;
    box.textContent = "";
    (EDU[st.lang === "ar" ? "ar" : "en"]).forEach(function (x) {
      var c = el("div", "edu-item");
      c.appendChild(el("b", "", x[0]));
      c.appendChild(el("p", "muted", x[1]));
      box.appendChild(c);
    });
  }
  function impactOf(e) { return e.impact === "high" ? "high" : e.impact === "medium" ? "medium" : "low"; }
  function renderNews() {
    var econ = $("econ"), list = $("newslist");
    if (!econ || !list) return;
    econ.textContent = ""; list.textContent = "";
    if (NEWS.ok === false) { econ.appendChild(el("p", "muted", T("newsNeed"))); list.appendChild(el("p", "muted", T("newsNeed"))); return; }
    var now = Date.now();
    var events = NEWS.cal.filter(function (e) { return impactOf(e) !== "low"; })
      .sort(function (x, y) { return String(x.time).localeCompare(String(y.time)); });
    var highCount = events.filter(function (e) { return impactOf(e) === "high"; }).length;
    econ.appendChild(el("h2", "", T("econTitle")));
    econ.appendChild(el("p", "muted", T("todaySummary") + highCount));
    if (!events.length) econ.appendChild(el("p", "muted", T("noEvents")));
    events.forEach(function (e) {
      var card = el("div", "ev imp-h-" + impactOf(e));
      var t = e.time ? new Date(e.time) : null;
      var soon = t && t.getTime() > now && t.getTime() - now < 60 * 60e3;
      var top = el("div", "ev-h");
      var lz = localEvent(e);
      top.appendChild(el("b", "", (lz.c ? lz.c + " · " : "") + lz.t));
      top.appendChild(el("span", "imp imp-" + impactOf(e), T(impactOf(e) === "high" ? "high" : "medium")));
      card.appendChild(top);
      var meta = el("div", "ev-m muted", (t ? t.toLocaleString(st.lang === "ar" ? "ar" : "en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "") + (soon ? "  ·  " + T("upcoming") : ""));
      card.appendChild(meta);
      var vals = el("div", "ev-v");
      [[T("previous"), e.previous], [T("forecast"), e.forecast], [T("actual"), e.actual]].forEach(function (x) {
        var c = el("div", "");
        c.appendChild(el("span", "muted", x[0]));
        c.appendChild(el("b", "", x[1] == null ? "—" : String(x[1]) + (e.unit || "")));
        vals.appendChild(c);
      });
      card.appendChild(vals);
      econ.appendChild(card);
    });
    econ.appendChild(el("p", "muted", T("rule")));
    if (!NEWS.news.length) list.appendChild(el("p", "muted", T("noNews")));
    NEWS.news.slice(0, 20).forEach(function (n) {
      var card = el("a", "nw");
      if (n.url) { card.href = n.url; card.target = "_blank"; card.rel = "noopener noreferrer"; }
      card.appendChild(el("b", "", n.headline || ""));
      var when = n.time ? new Date(n.time * 1000).toLocaleString(st.lang === "ar" ? "ar" : "en-GB", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }) : "";
      card.appendChild(el("span", "muted", (n.source || "") + (when ? "  ·  " + when : "")));
      list.appendChild(card);
    });
  }
  var refreshBtn = $("news-refresh");
  if (refreshBtn) refreshBtn.addEventListener("click", function () { loadNews(true); });
  setInterval(function () { loadNews(false); }, 300000);

  // ---------- wiring ----------
  document.querySelectorAll("[data-tf]").forEach(function (b) { b.addEventListener("click", function () { setTf(b.getAttribute("data-tf")); }); });
  document.querySelectorAll("[data-show]").forEach(function (b) {
    var k = b.getAttribute("data-show");
    b.setAttribute("aria-pressed", String(!!st.show[k]));
    b.addEventListener("click", function () {
      st.show[k] = !st.show[k];
      b.setAttribute("aria-pressed", String(!!st.show[k]));
      if (OWN) paintOwn(); else renderTV();
    });
  });
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
  st.lang = store("baqerLang") === "en" ? "en" : "ar";
  st.prefs = store("baqerPrefs") || st.prefs;
  pSig.checked = st.prefs.signal; pTp.checked = st.prefs.tp;
  applyLang();
  renderSessions();
  renderEdu();
  setInterval(renderSessions, 60000);
  loadAllForMarkets();
  setInterval(loadAllForMarkets, 900000);
  setView("analysis");
  showWelcome();
  setInterval(tick, 1000); tick();
  renderTV();
  loadBtc().then(function () { connect(); analyzeAndRender(); });
  change24h().then(function (c) { st.btcChange = c; renderTickers(); }).catch(function () {});
  setInterval(function () { change24h().then(function (c) { st.btcChange = c; renderTickers(); }).catch(function () {}); }, 60000);
})();
