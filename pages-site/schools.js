/* Five analysis schools + timeframe confluence.
 * ICT/SMC, Support & Resistance, Price Action, Wyckoff, Elliott + Fibonacci.
 * Pure functions, no DOM. Browser: window.Schools (needs window.Analysis). Node: module.exports.
 * Every school reads closed candles only and returns the same shape:
 *   { id, ready, bias: "bull"|"bear"|"neutral", strength: 0..100, title:{ar,en}, label:{ar,en},
 *     lines:{ar:[...], en:[...]}, levels:[{name, price}] }
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./analysis.js"));
  else root.Schools = factory(root.Analysis);
})(typeof self !== "undefined" ? self : this, function (A) {
  "use strict";

  var NAMES = {
    ict: { ar: "ICT + SMC", en: "ICT + SMC" },
    snr: { ar: "الدعم والمقاومة", en: "Support & Resistance" },
    pa: { ar: "حركة السعر", en: "Price Action" },
    wyckoff: { ar: "وايكوف", en: "Wyckoff" },
    elliott: { ar: "إليوت + فيبوناتشي", en: "Elliott + Fibonacci" }
  };
  var ORDER = ["ict", "snr", "pa", "wyckoff", "elliott"];
  var BIAS = {
    bull: { ar: "صاعد", en: "Bullish" },
    bear: { ar: "هابط", en: "Bearish" },
    neutral: { ar: "محايد", en: "Neutral" }
  };

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lastATR(c) { var a = A.atr(c, 14); return a[a.length - 1]; }
  function fmtP(v) {
    if (v == null || !isFinite(v)) return "—";
    var d = Math.abs(v) >= 1000 ? 2 : Math.abs(v) >= 10 ? 3 : 5;
    return v.toFixed(d);
  }
  function result(id, bias, strength, label, ar, en, levels) {
    return { id: id, ready: true, bias: bias, strength: Math.round(clamp(strength, 0, 100)), title: NAMES[id],
      label: label, lines: { ar: ar, en: en }, levels: levels || [] };
  }
  function notReady(id, why) {
    return { id: id, ready: false, bias: "neutral", strength: 0, title: NAMES[id],
      label: { ar: "بيانات غير كافية", en: "Not enough data" }, lines: { ar: [why.ar], en: [why.en] }, levels: [] };
  }
  var FEW = { ar: "يحتاج 60 شمعة مغلقة على الأقل", en: "Needs at least 60 closed candles" };

  // Alternating zigzag of confirmed swing points (highs and lows strictly alternate).
  function zigzag(c, k) {
    var sw = A.swings(c, k), pts = [];
    sw.H.forEach(function (p) { pts.push({ i: p.i, p: p.p, type: "H" }); });
    sw.L.forEach(function (p) { pts.push({ i: p.i, p: p.p, type: "L" }); });
    pts.sort(function (a, b) { return a.i - b.i || (a.type === "H" ? -1 : 1); });
    var out = [];
    pts.forEach(function (q) {
      var last = out[out.length - 1];
      if (!last || last.type !== q.type) { out.push(q); return; }
      // Same type twice in a row: keep the more extreme one.
      if ((q.type === "H" && q.p >= last.p) || (q.type === "L" && q.p <= last.p)) out[out.length - 1] = q;
    });
    return out;
  }

  // ---------- 1) ICT + SMC (uses the main engine) ----------
  function ict(c, profile) {
    if (c.length < 60) return notReady("ict", FEW);
    var r = A.analyze(c, profile || "balanced", null);
    if (!r.ready) return notReady("ict", { ar: "المؤشرات غير جاهزة بعد", en: "Indicators not ready yet" });
    var s = r.signal;
    var bias = s ? (s.dir === "LONG" ? "bull" : "bear") : (r.longScore - r.shortScore >= 2 ? "bull" : r.shortScore - r.longScore >= 2 ? "bear" : (r.trend || "neutral"));
    var strength = s ? 60 + s.score * 3 : Math.abs(r.longScore - r.shortScore) * 8 + (r.trend ? 15 : 0);
    var ar = [], en = [];
    ar.push(r.trend === "bull" ? "الهيكل: قمم وقيعان صاعدة" : r.trend === "bear" ? "الهيكل: قمم وقيعان هابطة" : "الهيكل: غير مرتب");
    en.push(r.trend === "bull" ? "Structure: higher highs and lows" : r.trend === "bear" ? "Structure: lower highs and lows" : "Structure: not ordered");
    if (r.ev) { ar.push("آخر حدث: " + r.ev.type + (r.ev.dir === "bull" ? " صاعد" : " هابط")); en.push("Last event: " + r.ev.type + " " + r.ev.dir); }
    if (r.sweep) { ar.push("سحب سيولة " + (r.sweep.dir === "bull" ? "أسفل القاع" : "فوق القمة")); en.push("Liquidity sweep " + (r.sweep.dir === "bull" ? "below the low" : "above the high")); }
    ar.push("المنطقة: " + (r.pd === "discount" ? "خصم (أسفل التوازن)" : r.pd === "premium" ? "علاوة (فوق التوازن)" : "توازن"));
    en.push("Zone: " + (r.pd || "equilibrium"));
    ar.push(s ? "إشارة " + (s.dir === "LONG" ? "شراء" : "بيع") + " بدرجة " + s.grade : "النقاط: شراء " + r.longScore + " / بيع " + r.shortScore);
    en.push(s ? (s.dir === "LONG" ? "Buy" : "Sell") + " signal, grade " + s.grade : "Score: buy " + r.longScore + " / sell " + r.shortScore);
    var lv = [];
    if (r.ob) lv.push({ name: "OB", price: (r.ob.lo + r.ob.hi) / 2 });
    if (r.fvg) lv.push({ name: "FVG", price: (r.fvg.lo + r.fvg.hi) / 2 });
    if (r.bsl != null) lv.push({ name: "BSL", price: r.bsl });
    if (r.ssl != null) lv.push({ name: "SSL", price: r.ssl });
    var out = result("ict", bias, strength,
      { ar: s ? (s.dir === "LONG" ? "إشارة شراء" : "إشارة بيع") + " · " + s.grade : "لا إشارة مؤكدة · شراء " + r.longScore + " / بيع " + r.shortScore,
        en: s ? (s.dir === "LONG" ? "Buy signal" : "Sell signal") + " · " + s.grade : "No confirmed signal · buy " + r.longScore + " / sell " + r.shortScore },
      ar, en, lv);
    out.signal = s || null;
    return out;
  }

  // ---------- 2) Support and resistance ----------
  // Swing points closer than 0.6 ATR are merged into one level; strength = number of touches.
  function levelsSNR(c, atrV) {
    var sw = A.swings(c, 3), pts = sw.H.concat(sw.L).map(function (p) { return p.p; }).sort(function (a, b) { return a - b; });
    var tol = 0.6 * atrV, lv = [];
    pts.forEach(function (p) {
      var g = lv[lv.length - 1];
      if (g && p - g.hi <= tol) { g.sum += p; g.n++; g.hi = p; g.p = g.sum / g.n; }
      else lv.push({ sum: p, n: 1, lo: p, hi: p, p: p });
    });
    return lv.map(function (g) { return { p: g.p, touches: g.n }; });
  }
  function snr(c) {
    if (c.length < 60) return notReady("snr", FEW);
    var atrV = lastATR(c), n = c.length, last = c[n - 1], prev = c[n - 2], price = last.c;
    if (!atrV) return notReady("snr", FEW);
    var lv = levelsSNR(c.slice(-200), atrV);
    var sup = lv.filter(function (l) { return l.p < price; }).sort(function (a, b) { return b.p - a.p; })[0] || null;
    var res = lv.filter(function (l) { return l.p > price; }).sort(function (a, b) { return a.p - b.p; })[0] || null;
    var bias = "neutral", strength = 20, tagAr = "بين المستويات", tagEn = "Between levels", ar = [], en = [];
    var nearSup = sup && price - sup.p <= 0.8 * atrV, nearRes = res && res.p - price <= 0.8 * atrV;
    // Breakout: previous close on one side of a level, last close beyond it by 0.2 ATR.
    var broke = lv.filter(function (l) { return prev.c <= l.p && last.c > l.p + 0.2 * atrV; })[0];
    var brokeDn = lv.filter(function (l) { return prev.c >= l.p && last.c < l.p - 0.2 * atrV; })[0];
    if (broke) { bias = "bull"; strength = 55 + broke.touches * 8; tagAr = "اختراق مقاومة"; tagEn = "Resistance breakout"; }
    else if (brokeDn) { bias = "bear"; strength = 55 + brokeDn.touches * 8; tagAr = "كسر دعم"; tagEn = "Support breakdown"; }
    else if (nearSup && last.l <= sup.p + 0.3 * atrV && last.c > last.o) { bias = "bull"; strength = 45 + sup.touches * 9; tagAr = "ارتداد من دعم"; tagEn = "Bounce off support"; }
    else if (nearRes && last.h >= res.p - 0.3 * atrV && last.c < last.o) { bias = "bear"; strength = 45 + res.touches * 9; tagAr = "رفض من مقاومة"; tagEn = "Rejected at resistance"; }
    else if (nearSup) { tagAr = "قرب دعم"; tagEn = "Near support"; strength = 30; }
    else if (nearRes) { tagAr = "قرب مقاومة"; tagEn = "Near resistance"; strength = 30; }
    ar.push("أقرب دعم: " + (sup ? fmtP(sup.p) + " (" + sup.touches + " لمسات)" : "—"));
    en.push("Nearest support: " + (sup ? fmtP(sup.p) + " (" + sup.touches + " touches)" : "—"));
    ar.push("أقرب مقاومة: " + (res ? fmtP(res.p) + " (" + res.touches + " لمسات)" : "—"));
    en.push("Nearest resistance: " + (res ? fmtP(res.p) + " (" + res.touches + " touches)" : "—"));
    ar.push("الحالة: " + tagAr); en.push("State: " + tagEn);
    var levels = [];
    if (sup) levels.push({ name: "S", price: sup.p });
    if (res) levels.push({ name: "R", price: res.p });
    var out = result("snr", bias, strength, { ar: tagAr, en: tagEn }, ar, en, levels);
    out.support = sup; out.resistance = res;
    return out;
  }

  // ---------- 3) Price action ----------
  function candlePattern(c) {
    var n = c.length, a = c[n - 1], b = c[n - 2], z = c[n - 3];
    var body = Math.abs(a.c - a.o), rng = a.h - a.l || 1e-12;
    var upW = a.h - Math.max(a.o, a.c), dnW = Math.min(a.o, a.c) - a.l;
    var bBody = Math.abs(b.c - b.o);
    if (a.c > a.o && b.c < b.o && a.c >= b.o && a.o <= b.c && body > bBody) return { id: "bullEngulf", dir: "bull", ar: "ابتلاع شرائي", en: "Bullish engulfing", w: 3 };
    if (a.c < a.o && b.c > b.o && a.c <= b.o && a.o >= b.c && body > bBody) return { id: "bearEngulf", dir: "bear", ar: "ابتلاع بيعي", en: "Bearish engulfing", w: 3 };
    if (dnW >= 2 * body && upW <= 0.35 * rng && dnW >= 0.55 * rng) return { id: "hammer", dir: "bull", ar: "بن بار شرائي (مطرقة)", en: "Bullish pin bar (hammer)", w: 2 };
    if (upW >= 2 * body && dnW <= 0.35 * rng && upW >= 0.55 * rng) return { id: "star", dir: "bear", ar: "بن بار بيعي (شهاب)", en: "Bearish pin bar (shooting star)", w: 2 };
    var zBody = Math.abs(z.c - z.o), mid = (z.o + z.c) / 2;
    if (z.c < z.o && bBody <= 0.4 * zBody && a.c > a.o && a.c > mid) return { id: "morning", dir: "bull", ar: "نجمة الصباح", en: "Morning star", w: 3 };
    if (z.c > z.o && bBody <= 0.4 * zBody && a.c < a.o && a.c < mid) return { id: "evening", dir: "bear", ar: "نجمة المساء", en: "Evening star", w: 3 };
    if (a.h < b.h && a.l > b.l) return { id: "inside", dir: "neutral", ar: "شمعة داخلية (انضغاط)", en: "Inside bar (compression)", w: 0 };
    return null;
  }
  function pa(c) {
    if (c.length < 60) return notReady("pa", FEW);
    var z = zigzag(c, 3), Hs = z.filter(function (p) { return p.type === "H"; }), Ls = z.filter(function (p) { return p.type === "L"; });
    var struct = "range";
    if (Hs.length >= 2 && Ls.length >= 2) {
      var h1 = Hs[Hs.length - 1].p, h0 = Hs[Hs.length - 2].p, l1 = Ls[Ls.length - 1].p, l0 = Ls[Ls.length - 2].p;
      if (h1 > h0 && l1 > l0) struct = "up"; else if (h1 < h0 && l1 < l0) struct = "down";
    }
    var pat = candlePattern(c), atrV = lastATR(c), last = c[c.length - 1];
    var score = (struct === "up" ? 2 : struct === "down" ? -2 : 0);
    if (pat && pat.dir === "bull") score += pat.w;
    if (pat && pat.dir === "bear") score -= pat.w;
    // Location: a reversal pattern at the last swing extreme counts more.
    var lastL = Ls[Ls.length - 1], lastH = Hs[Hs.length - 1];
    var atLow = lastL && atrV && Math.abs(last.l - lastL.p) <= atrV, atHigh = lastH && atrV && Math.abs(last.h - lastH.p) <= atrV;
    if (pat && pat.dir === "bull" && atLow) score += 1;
    if (pat && pat.dir === "bear" && atHigh) score -= 1;
    var bias = score >= 2 ? "bull" : score <= -2 ? "bear" : "neutral";
    var ar = [], en = [];
    ar.push("الهيكل: " + (struct === "up" ? "قمم أعلى وقيعان أعلى" : struct === "down" ? "قمم أدنى وقيعان أدنى" : "عرضي"));
    en.push("Structure: " + (struct === "up" ? "higher highs, higher lows" : struct === "down" ? "lower highs, lower lows" : "sideways"));
    ar.push("آخر شمعة: " + (pat ? pat.ar : "بدون نموذج واضح")); en.push("Last candle: " + (pat ? pat.en : "no clear pattern"));
    if (pat && (atLow || atHigh)) { ar.push("النموذج عند قمة/قاع مهم، وزنه أعلى"); en.push("Pattern sits at a key swing, weighted higher"); }
    var levels = [];
    if (lastH) levels.push({ name: "SH", price: lastH.p });
    if (lastL) levels.push({ name: "SL", price: lastL.p });
    var out = result("pa", bias, 20 + Math.abs(score) * 12,
      { ar: pat ? pat.ar : BIAS[bias].ar, en: pat ? pat.en : BIAS[bias].en }, ar, en, levels);
    out.pattern = pat; out.structure = struct;
    return out;
  }

  // ---------- 4) Wyckoff ----------
  // Range = the 40 bars before the last 6. Accumulation if the range sits after a decline,
  // distribution if after an advance. Spring / upthrust = wick beyond the range and close back inside.
  function wyckoff(c) {
    if (c.length < 80) return notReady("wyckoff", { ar: "يحتاج 80 شمعة مغلقة على الأقل", en: "Needs at least 80 closed candles" });
    var n = c.length, atrV = lastATR(c), recent = c.slice(n - 6), box = c.slice(n - 46, n - 6), before = c.slice(Math.max(0, n - 86), n - 46);
    var hi = Math.max.apply(null, box.map(function (k) { return k.h; })), lo = Math.min.apply(null, box.map(function (k) { return k.l; }));
    var width = hi - lo, net = Math.abs(box[box.length - 1].c - box[0].o);
    var isRange = width <= 8 * atrV && net / (width || 1) <= 0.5;
    var priorUp = before.length ? box[0].o - before[0].o : 0;
    var kind = priorUp < -2 * atrV ? "acc" : priorUp > 2 * atrV ? "dist" : "unknown";
    var vols = c.slice(n - 46).map(function (k) { return k.v || 1; }), avgV = vols.reduce(function (a, b) { return a + b; }, 0) / vols.length;
    var last = c[n - 1], phase, bias = "neutral", strength = 25, ar = [], en = [];
    var spring = null, upthrust = null;
    recent.forEach(function (k) {
      if (k.l < lo - 0.1 * atrV && k.c > lo) spring = k;
      if (k.h > hi + 0.1 * atrV && k.c < hi) upthrust = k;
    });
    var sos = last.c > hi + 0.2 * atrV, sow = last.c < lo - 0.2 * atrV;
    var volUp = (last.v || 1) > 1.3 * avgV;
    if (!isRange) {
      var move = last.c - box[0].o;
      if (move > 0) { phase = { ar: "صعود (Markup)", en: "Markup" }; bias = "bull"; strength = 55; }
      else { phase = { ar: "هبوط (Markdown)", en: "Markdown" }; bias = "bear"; strength = 55; }
    } else if (sos) { phase = { ar: "إشارة قوة (SOS) - المرحلة D", en: "Sign of strength (SOS), phase D" }; bias = "bull"; strength = 65 + (volUp ? 15 : 0); }
    else if (sow) { phase = { ar: "إشارة ضعف (SOW) - المرحلة D", en: "Sign of weakness (SOW), phase D" }; bias = "bear"; strength = 65 + (volUp ? 15 : 0); }
    else if (spring && !upthrust) { phase = { ar: "زنبرك (Spring) - المرحلة C", en: "Spring, phase C" }; bias = "bull"; strength = 60 + (kind === "acc" ? 15 : 0); }
    else if (upthrust && !spring) { phase = { ar: "اختراق كاذب (UTAD) - المرحلة C", en: "Upthrust (UTAD), phase C" }; bias = "bear"; strength = 60 + (kind === "dist" ? 15 : 0); }
    else { phase = { ar: "بناء النطاق - المرحلة B", en: "Building the range, phase B" }; strength = 25; }
    var kindAr = kind === "acc" ? "تجميع محتمل (بعد هبوط)" : kind === "dist" ? "تصريف محتمل (بعد صعود)" : "نطاق بدون اتجاه سابق واضح";
    var kindEn = kind === "acc" ? "Possible accumulation (after a decline)" : kind === "dist" ? "Possible distribution (after an advance)" : "Range with no clear prior trend";
    ar.push("النطاق: " + fmtP(lo) + " – " + fmtP(hi)); en.push("Range: " + fmtP(lo) + " – " + fmtP(hi));
    if (isRange) { ar.push(kindAr); en.push(kindEn); }
    ar.push("المرحلة: " + phase.ar); en.push("Phase: " + phase.en);
    if (volUp) { ar.push("حجم آخر شمعة أعلى من المتوسط"); en.push("Last candle volume above average"); }
    var out = result("wyckoff", bias, strength, phase, ar, en, [{ name: "TR-H", price: hi }, { name: "TR-L", price: lo }]);
    out.range = { hi: hi, lo: lo, isRange: isRange, kind: kind };
    return out;
  }

  // ---------- 5) Elliott waves + Fibonacci ----------
  function fibLevels(a, b) {
    // a = leg start, b = leg end. Retracements go back from b toward a.
    var d = b - a, r = {};
    [0.236, 0.382, 0.5, 0.618, 0.786].forEach(function (f) { r[f] = b - d * f; });
    var ext = {};
    [1.272, 1.618].forEach(function (f) { ext[f] = a + d * f; });
    return { ret: r, ext: ext };
  }
  function impulseOK(p, up) {
    // p = 5 or 6 alternating points: 0,1,2,3,4[,5]. Classic rules:
    // wave 2 never retraces past the start of wave 1, wave 3 is never the shortest, wave 4 does not overlap wave 1.
    var s = up ? 1 : -1;
    var w1 = s * (p[1].p - p[0].p), w2ok = s * (p[2].p - p[0].p) > 0, w3 = s * (p[3].p - p[2].p), w4ok = s * (p[4].p - p[1].p) > 0;
    if (!(w1 > 0 && w3 > 0 && w2ok && w4ok)) return false;
    if (p.length >= 6) { var w5 = s * (p[5].p - p[4].p); if (!(w5 > 0) || (w3 < w1 && w3 < w5)) return false; }
    else if (w3 < w1 * 0.618) return false;
    return true;
  }
  function elliott(c) {
    if (c.length < 80) return notReady("elliott", { ar: "يحتاج 80 شمعة مغلقة على الأقل", en: "Needs at least 80 closed candles" });
    var z = zigzag(c, 5), price = c[c.length - 1].c;
    if (z.length < 3) return notReady("elliott", { ar: "لا توجد موجات كافية بعد", en: "Not enough swings yet" });
    var a = z[z.length - 2], b = z[z.length - 1], up = b.type === "H";
    var fib = fibLevels(a.p, b.p), ar = [], en = [];
    var lo = Math.min(fib.ret[0.5], fib.ret[0.618]), hi = Math.max(fib.ret[0.5], fib.ret[0.618]);
    var retr = (b.p - price) / ((b.p - a.p) || 1);
    var wave = null;
    var p6 = z.slice(-6), p5 = z.slice(-5);
    if (p6.length === 6 && p6[0].type === (up ? "L" : "H") && impulseOK(p6, up)) wave = { ar: "اكتملت 5 موجات، متوقع تصحيح ABC", en: "Five waves complete, ABC correction expected", end: true };
    else if (p5.length === 5 && p5[0].type === (up ? "H" : "L") && impulseOK(p5, !up)) wave = { ar: "داخل الموجة 5 (" + (up ? "هابطة" : "صاعدة") + ")", en: "In wave 5 (" + (up ? "down" : "up") + ")", w5: true };
    else if (z.length >= 4) {
      var q = z.slice(-4);
      if (q[0].type === (up ? "L" : "H") && impulseOK(q.concat([{ p: price }]), up)) wave = { ar: "تصحيح الموجة 4", en: "Wave 4 pullback" };
    }
    var bias = "neutral", strength = 25, tagAr, tagEn;
    var inGolden = price >= lo && price <= hi;
    if (wave && wave.end) { bias = up ? "bear" : "bull"; strength = 55; }
    else if (wave && wave.w5) { bias = up ? "bear" : "bull"; strength = 50; }
    else if (inGolden) { bias = up ? "bull" : "bear"; strength = 60; }
    else if (retr > 0.786 && retr < 1) { strength = 30; }
    else if (retr >= 1) { bias = up ? "bear" : "bull"; strength = 50; }
    else if (retr < 0.382 && retr >= 0) { bias = up ? "bull" : "bear"; strength = 40; }
    if (inGolden) { tagAr = "داخل المنطقة الذهبية 0.5–0.618"; tagEn = "Inside the 0.5–0.618 golden zone"; }
    else if (retr >= 1) { tagAr = "كسر بداية الموجة (الموجة ألغيت)"; tagEn = "Leg start broken (count invalidated)"; }
    else { tagAr = "تصحيح " + Math.round(clamp(retr, 0, 1) * 100) + "% من آخر موجة"; tagEn = Math.round(clamp(retr, 0, 1) * 100) + "% retracement of the last leg"; }
    ar.push("آخر موجة: " + (up ? "صاعدة " : "هابطة ") + fmtP(a.p) + " → " + fmtP(b.p)); en.push("Last leg: " + (up ? "up " : "down ") + fmtP(a.p) + " → " + fmtP(b.p));
    ar.push("الموجة: " + (wave ? wave.ar : "العدّ غير واضح، القراءة من فيبوناتشي فقط")); en.push("Wave: " + (wave ? wave.en : "count unclear, reading from Fibonacci only"));
    ar.push(tagAr); en.push(tagEn);
    ar.push("0.618: " + fmtP(fib.ret[0.618]) + " · امتداد 1.618: " + fmtP(fib.ext[1.618])); en.push("0.618: " + fmtP(fib.ret[0.618]) + " · 1.618 ext: " + fmtP(fib.ext[1.618]));
    var out = result("elliott", bias, strength, { ar: wave ? wave.ar : tagAr, en: wave ? wave.en : tagEn }, ar, en,
      [{ name: "0.5", price: fib.ret[0.5] }, { name: "0.618", price: fib.ret[0.618] }, { name: "1.618", price: fib.ext[1.618] }]);
    out.fib = fib; out.leg = { from: a.p, to: b.p, up: up }; out.retr = retr;
    return out;
  }

  // ---------- all schools for one timeframe ----------
  function all(c, profile) {
    var rows = [ict(c, profile), snr(c), pa(c), wyckoff(c), elliott(c)];
    var bull = 0, bear = 0, ready = 0, w = 0;
    rows.forEach(function (r) {
      if (!r.ready) return;
      ready++;
      if (r.bias === "bull") { bull++; w += r.strength; }
      if (r.bias === "bear") { bear++; w -= r.strength; }
    });
    var bias = bull >= 3 && bull > bear ? "bull" : bear >= 3 && bear > bull ? "bear" : (w > 60 && bull > bear ? "bull" : w < -60 && bear > bull ? "bear" : "neutral");
    return { rows: rows, bull: bull, bear: bear, ready: ready, bias: bias, agree: Math.max(bull, bear),
      score: ready ? Math.round(clamp(Math.abs(w) / ready, 0, 100)) : 0 };
  }

  // ---------- confluence across timeframes ----------
  // frames: { "15m": allResult, "1h": allResult, "4h": allResult } (missing frames are skipped).
  function confluence(frames) {
    var tfs = Object.keys(frames).filter(function (k) { return frames[k] && frames[k].ready; });
    var bull = tfs.filter(function (k) { return frames[k].bias === "bull"; }).length;
    var bear = tfs.filter(function (k) { return frames[k].bias === "bear"; }).length;
    var bias = "neutral", level = "none";
    if (tfs.length && bull === tfs.length) { bias = "bull"; level = "full"; }
    else if (tfs.length && bear === tfs.length) { bias = "bear"; level = "full"; }
    else if (bull >= 2 && bear === 0) { bias = "bull"; level = "partial"; }
    else if (bear >= 2 && bull === 0) { bias = "bear"; level = "partial"; }
    else if (bull && bear) level = "conflict";
    var perSchool = {};
    ORDER.forEach(function (id) {
      var b = 0, s = 0, k = 0;
      tfs.forEach(function (tf) {
        var r = frames[tf].rows.filter(function (x) { return x.id === id; })[0];
        if (!r || !r.ready) return;
        k++; if (r.bias === "bull") b++; if (r.bias === "bear") s++;
      });
      perSchool[id] = { bull: b, bear: s, n: k, aligned: k > 1 && (b === k || s === k) };
    });
    return { tfs: tfs, bull: bull, bear: bear, bias: bias, level: level, perSchool: perSchool };
  }

  return { NAMES: NAMES, ORDER: ORDER, BIAS: BIAS, zigzag: zigzag, candlePattern: candlePattern, fibLevels: fibLevels, impulseOK: impulseOK,
    ict: ict, snr: snr, pa: pa, wyckoff: wyckoff, elliott: elliott, all: all, confluence: confluence };
});
