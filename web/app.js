(function () {
  "use strict";
  var A = window.Analysis;
  var SAMPLE = { BTC: { name: "BTC/USDT", base: 91527, vol: 0.0036, seed: 11 },
                 XAU: { name: "XAU/USD", base: 3716, vol: 0.0028, seed: 23 } };
  var TF_LABEL = { "15m": "15 دقيقة", "1h": "ساعة", "4h": "4 ساعات" };
  var state = { asset: "BTC", tf: "1h", csv: null, candles: [], res: null, timer: null };

  function $(id) { return document.getElementById(id); }
  function fmt(v) { return v == null || isNaN(v) ? "—" : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function setText(id, t) { var e = $(id); if (e) e.textContent = t; }
  function notice(t) { setText("notice", t || ""); }

  // ---------- data ----------
  function parseCSV(text) {
    var lines = text.split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (!lines.length) throw new Error("الملف فارغ");
    var first = lines[0].split(/[,;\t]/).map(function (s) { return s.trim().toLowerCase(); });
    var hasHeader = /[a-z]/.test(lines[0]);
    var idx = { o: 2, h: 3, l: 4, c: 5 };
    var start = 0;
    if (hasHeader) {
      start = 1;
      var f = function (names) { for (var k = 0; k < first.length; k++) if (names.indexOf(first[k]) >= 0) return k; return -1; };
      idx = { o: f(["open", "<open>"]), h: f(["high", "<high>"]), l: f(["low", "<low>"]), c: f(["close", "<close>"]) };
      if (idx.o < 0 || idx.h < 0 || idx.l < 0 || idx.c < 0) throw new Error("لم أجد أعمدة open/high/low/close في الملف");
    }
    var out = [];
    for (var i = start; i < lines.length; i++) {
      var p = lines[i].split(/[,;\t]/);
      var o = parseFloat(p[idx.o]), h = parseFloat(p[idx.h]), l = parseFloat(p[idx.l]), c = parseFloat(p[idx.c]);
      if ([o, h, l, c].some(isNaN)) continue;
      out.push({ t: i, o: o, h: h, l: l, c: c, v: 1 });
    }
    if (out.length < 60) throw new Error("الملف يحتوي أقل من 60 شمعة صالحة");
    return out.slice(-500);
  }

  function fetchBinance(tf) {
    var url = "https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=" + tf + "&limit=500";
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (rows) {
      return rows.map(function (k, i) {
        return { t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] };
      });
    });
  }

  function load() {
    var srcChip = $("source-chip");
    if (state.asset === "BTC") {
      srcChip.textContent = "Binance · حي";
      return fetchBinance(state.tf).then(function (c) {
        notice("");
        return { candles: c, source: "Binance · حي" };
      }).catch(function () {
        notice("تعذّر الوصول إلى Binance من هذا المتصفح، أعرض بيانات تجريبية بدلاً منها.");
        var s = SAMPLE.BTC;
        return { candles: A.sampleCandles(s.base, s.vol, 500, s.seed), source: "بيانات تجريبية" };
      });
    }
    if (state.csv) {
      notice("");
      return Promise.resolve({ candles: state.csv, source: "ملف CSV" });
    }
    var g = SAMPLE.XAU;
    notice("الذهب لا يوجد له مصدر مفتوح بدون مفتاح، لذلك أعرض بيانات تجريبية. ارفع ملف CSV من MT5 لتحليل بياناتك.");
    return Promise.resolve({ candles: A.sampleCandles(g.base, g.vol, 500, g.seed), source: "بيانات تجريبية" });
  }

  function refresh() {
    load().then(function (d) {
      state.candles = d.candles;
      state.source = d.source;
      setText("source-chip", d.source);
      state.res = A.analyze(state.candles);
      render();
    }).catch(function (e) { notice(e.message || "حدث خطأ"); });
  }

  // ---------- render ----------
  function render() {
    var r = state.res;
    if (!r || !r.ready) { setText("verdict", "—"); setText("status", r ? r.reason : ""); return; }

    var v = $("verdict");
    var txt = r.signal ? (r.signal.dir === "LONG" ? "شراء (Long)" : "بيع (Short)") : "انتظار";
    v.textContent = txt;
    v.className = "verdict " + (r.signal ? (r.signal.dir === "LONG" ? "buy" : "sell") : "wait");
    setText("status", r.status);
    setText("grade", r.signal ? r.signal.grade : "—");

    var lp = Math.min(100, Math.round(r.longScore / 12 * 100)), sp = Math.min(100, Math.round(r.shortScore / 12 * 100));
    $("bar-long").style.width = lp + "%";
    $("bar-short").style.width = sp + "%";
    setText("val-long", r.longScore);
    setText("val-short", r.shortScore);

    renderPlan(r);
    renderIndicators(r);
    renderSMC(r);
    renderChecks(r);
    setText("reasons", r.reasons.join(" · "));
    drawChart();
  }

  function renderPlan(r) {
    var box = $("plan"); box.textContent = "";
    var s = r.signal;
    if (!s) {
      setText("plan-note", "لا توجد خطة صفقة الآن. تظهر الخطة فقط عند اكتمال الشروط والوقف ضمن المدى المسموح.");
      return;
    }
    var rr = function (x) { return ((Math.abs(x - s.entry)) / s.risk).toFixed(1) + "R"; };
    [["الدخول", fmt(s.entry), "en"], ["وقف الخسارة", fmt(s.sl), "sl"],
     ["الهدف 1 (" + rr(s.tp1) + ")", fmt(s.tp1), "tp"], ["الهدف 2 (" + rr(s.tp2) + ")", fmt(s.tp2), "tp"],
     ["الهدف 3 (" + rr(s.tp3) + ")", fmt(s.tp3), "tp"]].forEach(function (x) {
      var c = el("div", "pc " + x[2]); c.appendChild(el("div", "k", x[0])); c.appendChild(el("div", "v", x[1])); box.appendChild(c);
    });
    setText("plan-note", "المخاطرة لكل صفقة = " + fmt(s.risk) + " (" + (s.risk / r.atr).toFixed(2) + " ATR). حجم المركز يحسبه حسابك أنت.");
  }

  function renderIndicators(r) {
    setText("i-price", fmt(r.price));
    setText("i-ema", fmt(r.ema50) + " · " + (r.price > r.ema50 ? "السعر فوقه" : "السعر تحته") + " · " + (r.emaRising ? "مائل للأعلى" : "مائل للأسفل"));
    setText("i-rsi", r.rsi.toFixed(1) + (r.rsi >= 70 ? " · تشبع شرائي" : r.rsi <= 30 ? " · تشبع بيعي" : ""));
    setText("i-atr", fmt(r.atr));
    setText("i-trend", r.trend === "bull" ? "صاعد (HH / HL)" : r.trend === "bear" ? "هابط (LH / LL)" : "غير واضح");
    setText("i-pd", r.pd ? (r.pd === "discount" ? "Discount (تحت المنتصف)" : "Premium (فوق المنتصف)") : "—");
    $("rsi-marker").style.left = Math.max(0, Math.min(100, r.rsi)) + "%";
  }

  function renderSMC(r) {
    setText("s-ev", r.ev ? r.ev.type + " " + (r.ev.dir === "bull" ? "صاعد" : "هابط") + " عند " + fmt(r.ev.level) : "لا كسر هيكلي حديث");
    setText("s-sweep", r.sweep ? (r.sweep.dir === "bear" ? "سحب سيولة فوق القمم" : "سحب سيولة تحت القيعان") + " عند " + fmt(r.sweep.level) : "لا يوجد");
    setText("s-fvg", r.fvg ? (r.fvg.dir === "bull" ? "صاعدة " : "هابطة ") + fmt(r.fvg.lo) + " – " + fmt(r.fvg.hi) : "لا توجد غير مملوءة");
    setText("s-ob", r.ob ? (r.ob.dir === "bull" ? "صاعد " : "هابط ") + fmt(r.ob.lo) + " – " + fmt(r.ob.hi) : "لا يوجد");
    var liq = [];
    if (r.bsl != null) liq.push("BSL " + fmt(r.bsl));
    if (r.ssl != null) liq.push("SSL " + fmt(r.ssl));
    setText("s-liq", liq.join(" · ") + ((r.eqH || r.eqL) ? " · " + (r.eqH ? "قمم متساوية" : "") + (r.eqH && r.eqL ? " و " : "") + (r.eqL ? "قيعان متساوية" : "") : ""));
    setText("s-cong", r.cong ? (r.cong.breakout ? "كسر " + (r.cong.breakout === "bull" ? "صاعد" : "هابط") + " من نطاق " + fmt(r.cong.lo) + " – " + fmt(r.cong.hi) : "نطاق عرضي " + fmt(r.cong.lo) + " – " + fmt(r.cong.hi) + " بلا كسر") : "لا يوجد نطاق عرضي");
  }

  function renderChecks(r) {
    [["checks-long", r.longChecks], ["checks-short", r.shortChecks]].forEach(function (pair) {
      var ul = $(pair[0]); ul.textContent = "";
      pair[1].forEach(function (c) {
        var li = el("li", c.ok ? "ok" : "");
        li.appendChild(el("span", "mk", c.ok ? "✓" : "○"));
        li.appendChild(el("span", "", c.label));
        li.appendChild(el("span", "w", "+" + c.w));
        ul.appendChild(li);
      });
    });
  }

  // ---------- chart ----------
  function drawChart() {
    var cv = $("chart"), r = state.res, C = state.candles;
    if (!cv || !r || !r.ready) return;
    var dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    var g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    var css = getComputedStyle(document.documentElement);
    function col(k) { return css.getPropertyValue(k).trim(); }
    var UP = col("--up"), DN = col("--down"), MU = col("--muted"), LN = col("--line"), GD = col("--gold"),
        IN = col("--info"), EM = col("--ema");

    var N = 100, off = Math.max(0, C.length - N), vis = C.slice(off);
    var E = r.series.ema.slice(off);
    var lo = Infinity, hi = -Infinity;
    vis.forEach(function (k) { lo = Math.min(lo, k.l); hi = Math.max(hi, k.h); });
    E.forEach(function (v) { if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); } });
    var extra = [];
    if (r.signal) extra.push(r.signal.tp3, r.signal.sl);
    extra.forEach(function (v) { lo = Math.min(lo, v); hi = Math.max(hi, v); });
    var padL = 6, padR = 96, padT = 10, padB = 20, pw = W - padL - padR, ph = H - padT - padB;
    var pad = (hi - lo) * 0.04; lo -= pad; hi += pad;
    function Y(p) { return padT + (hi - p) / (hi - lo) * ph; }
    var cw = pw / vis.length;
    function X(i) { return padL + i * cw + cw / 2; }

    g.clearRect(0, 0, W, H);
    g.font = "12px Tajawal, sans-serif"; g.lineWidth = 1;
    for (var k = 0; k <= 4; k++) {
      var p = lo + (hi - lo) * k / 4, y = Y(p);
      g.strokeStyle = LN; g.beginPath(); g.moveTo(padL, y); g.lineTo(W - padR, y); g.stroke();
      g.fillStyle = MU; g.fillText(fmt(p), W - padR + 6, y + 4);
    }

    function zone(z, color, label, fromIdx) {
      if (!z) return;
      var s = Math.max(0, (fromIdx != null ? fromIdx : z.i) - off);
      var x0 = padL + s * cw, y0 = Y(z.hi), y1 = Y(z.lo);
      g.globalAlpha = 0.16; g.fillStyle = color; g.fillRect(x0, y0, W - padR - x0, Math.max(2, y1 - y0));
      g.globalAlpha = 1; g.fillStyle = color; g.fillText(label, x0 + 4, y0 + 12);
    }
    if (r.cong) {
      var cs = Math.max(0, r.cong.start - off);
      var cx = padL + cs * cw, cy1 = Y(r.cong.hi), cy2 = Y(r.cong.lo);
      g.globalAlpha = 0.10; g.fillStyle = GD; g.fillRect(cx, cy1, padL + (r.cong.end - off + 1) * cw - cx, cy2 - cy1);
      g.globalAlpha = 0.5; g.strokeStyle = GD; g.setLineDash([3, 3]); g.strokeRect(cx, cy1, padL + (r.cong.end - off + 1) * cw - cx, cy2 - cy1); g.setLineDash([]);
      g.globalAlpha = 1;
    }
    zone(r.fvg, IN, "FVG");
    zone(r.ob, GD, "OB");

    g.strokeStyle = EM; g.lineWidth = 1.6; g.beginPath();
    var started = false;
    E.forEach(function (v, i) {
      if (v == null) return;
      if (!started) { g.moveTo(X(i), Y(v)); started = true; } else g.lineTo(X(i), Y(v));
    });
    g.stroke(); g.lineWidth = 1;

    vis.forEach(function (k, i) {
      var up = k.c >= k.o, color = up ? UP : DN, x = X(i);
      g.strokeStyle = color; g.fillStyle = color;
      g.beginPath(); g.moveTo(x, Y(k.h)); g.lineTo(x, Y(k.l)); g.stroke();
      var top = Y(Math.max(k.o, k.c)), bot = Y(Math.min(k.o, k.c));
      g.fillRect(x - cw * 0.32, top, cw * 0.64, Math.max(1, bot - top));
    });

    function hline(price, color, label, dash) {
      var y = Y(price);
      g.setLineDash(dash || []); g.strokeStyle = color; g.beginPath(); g.moveTo(padL, y); g.lineTo(W - padR, y); g.stroke(); g.setLineDash([]);
      g.fillStyle = color; g.fillText(label + " " + fmt(price), W - padR + 6, y + 4);
    }
    if (r.ev && r.ev.i >= off) {
      var ex = X(r.ev.i - off);
      g.fillStyle = GD; g.fillText(r.ev.type, ex - 10, Y(r.ev.level) - 5);
      hline(r.ev.level, GD, r.ev.type, [4, 4]);
    }
    if (r.sweep && r.sweep.i >= off) {
      var sx = X(r.sweep.i - off), sy = Y(r.sweep.wick);
      g.fillStyle = IN; g.beginPath(); g.arc(sx, sy - 6, 3.5, 0, Math.PI * 2); g.fill();
      g.fillText("Sweep", sx - 14, sy - 12);
    }
    if (r.signal) {
      var s = r.signal;
      hline(s.entry, IN, "دخول");
      hline(s.sl, DN, "وقف");
      hline(s.tp1, UP, "T1"); hline(s.tp2, UP, "T2"); hline(s.tp3, UP, "T3");
    }
  }

  // ---------- backtest ----------
  function runBacktest() {
    var btn = $("bt-run"), out = $("bt-out");
    btn.disabled = true; out.textContent = "جارٍ الاختبار على " + state.candles.length + " شمعة…";
    setTimeout(function () {
      try {
        var bt = A.backtest(state.candles);
        out.textContent = "";
        if (!bt.count) { out.textContent = "لم تظهر أي صفقة مكتملة الشروط في هذه البيانات."; btn.disabled = false; return; }
        var grid = el("div", "bt-stats");
        [["الصفقات", bt.count], ["نسبة النجاح", (bt.winRate * 100).toFixed(0) + "%"],
         ["صافي R", bt.netR.toFixed(2)], ["Profit Factor", isFinite(bt.profitFactor) ? bt.profitFactor.toFixed(2) : "∞"]].forEach(function (x) {
          var c = el("div", "pc"); c.appendChild(el("div", "k", x[0])); c.appendChild(el("div", "v", String(x[1]))); grid.appendChild(c);
        });
        out.appendChild(grid);
        out.appendChild(el("p", "note", "النتيجة تعتمد على هذه البيانات فقط، والربح الهدف الأول 1.5R، والوقف قبل الهدف عند التعارض داخل الشمعة نفسها. اختبر على فترة أطول وبيانات مختلفة قبل الاعتماد عليها."));
      } catch (e) { out.textContent = "خطأ في الاختبار: " + e.message; }
      btn.disabled = false;
    }, 20);
  }

  // ---------- controls ----------
  function syncButtons() {
    document.querySelectorAll("[data-asset]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-asset") === state.asset)); });
    document.querySelectorAll("[data-tf]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-tf") === state.tf)); });
    $("csv-wrap").hidden = state.asset !== "XAU";
  }
  function schedule() {
    if (state.timer) clearInterval(state.timer);
    if (state.asset === "BTC") state.timer = setInterval(refresh, 60000);
  }

  document.querySelectorAll("[data-asset]").forEach(function (b) {
    b.addEventListener("click", function () { state.asset = b.getAttribute("data-asset"); syncButtons(); schedule(); refresh(); });
  });
  document.querySelectorAll("[data-tf]").forEach(function (b) {
    b.addEventListener("click", function () { state.tf = b.getAttribute("data-tf"); syncButtons(); refresh(); });
  });
  $("csv").addEventListener("change", function (ev) {
    var f = ev.target.files && ev.target.files[0];
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      try { state.csv = parseCSV(String(rd.result)); notice("تم تحميل " + state.csv.length + " شمعة من الملف."); refresh(); }
      catch (e) { notice(e.message); }
    };
    rd.readAsText(f);
  });
  $("bt-run").addEventListener("click", runBacktest);
  window.addEventListener("resize", drawChart);

  syncButtons(); schedule(); refresh();
})();
