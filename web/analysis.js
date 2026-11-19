/* Market analysis engine: SMC + ICT + EMA50 + RSI + congestion breakout.
 * Pure functions, no DOM. Works in the browser (window.Analysis) and in Node (module.exports).
 * Candle shape: { t, o, h, l, c, v }. Only closed bars are used, so nothing repaints.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Analysis = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var CFG = {
    emaLen: 50,
    rsiLen: 14,
    atrLen: 14,
    pivot: 3,            // bars on each side to confirm a swing
    congLen: 30,         // congestion window (same as Hamoody 1M)
    congMaxRatio: 0.4,   // net move / range  (same as Hamoody 1M)
    congMaxATR: 5,       // range in ATR      (same as Hamoody 1M)
    bodyLen: 20,         // average body lookback
    bodyMult: 1.5,       // breakout body multiplier (same as Hamoody 1M)
    threshold: 6,        // minimum score to fire
    minConfirm: 3,       // minimum confirmations ticked
    rsiOB: 70, rsiOS: 30,
    slMinATR: 0.5, slMaxATR: 4,
    slBufferATR: 0.2
  };

  // Risk profiles. "sniper" = tight structural stop, far targets (lower hit rate, larger reward per win).
  var PROFILES = {
    balanced: { slMaxATR: 4, slBufferATR: 0.2, tp: [1.5, 2.5, 4] },
    sniper:   { slMaxATR: 1.2, slBufferATR: 0.1, tp: [3, 5, 8] }
  };

  // ---------- indicators ----------
  function ema(vals, len) {
    var out = new Array(vals.length).fill(null);
    if (vals.length < len) return out;
    var s = 0;
    for (var i = 0; i < len; i++) s += vals[i];
    var prev = s / len; out[len - 1] = prev;
    var k = 2 / (len + 1);
    for (var j = len; j < vals.length; j++) { prev = vals[j] * k + prev * (1 - k); out[j] = prev; }
    return out;
  }

  function rsi(closes, len) {
    var out = new Array(closes.length).fill(null);
    if (closes.length <= len) return out;
    var g = 0, l = 0;
    for (var i = 1; i <= len; i++) { var d = closes[i] - closes[i - 1]; if (d >= 0) g += d; else l -= d; }
    var ag = g / len, al = l / len;
    out[len] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
    for (var j = len + 1; j < closes.length; j++) {
      var dd = closes[j] - closes[j - 1];
      ag = (ag * (len - 1) + (dd > 0 ? dd : 0)) / len;
      al = (al * (len - 1) + (dd < 0 ? -dd : 0)) / len;
      out[j] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
    }
    return out;
  }

  function atr(c, len) {
    var out = new Array(c.length).fill(null);
    if (c.length <= len) return out;
    var tr = [];
    for (var i = 0; i < c.length; i++) {
      tr.push(i === 0 ? c[i].h - c[i].l
        : Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c)));
    }
    var s = 0;
    for (var k = 1; k <= len; k++) s += tr[k];
    var prev = s / len; out[len] = prev;
    for (var j = len + 1; j < c.length; j++) { prev = (prev * (len - 1) + tr[j]) / len; out[j] = prev; }
    return out;
  }

  // ---------- structure ----------
  // A pivot at i is confirmed only once k bars after it have closed.
  function swings(c, k) {
    var H = [], L = [];
    for (var i = k; i < c.length - k; i++) {
      var hi = true, lo = true;
      for (var j = i - k; j <= i + k; j++) {
        if (j === i) continue;
        if (c[j].h >= c[i].h) hi = false;
        if (c[j].l <= c[i].l) lo = false;
      }
      if (hi) H.push({ i: i, p: c[i].h });
      if (lo) L.push({ i: i, p: c[i].l });
    }
    return { H: H, L: L };
  }

  function fvgs(c, from) {
    var out = [];
    for (var g = Math.max(2, from); g < c.length; g++) {
      if (c[g].l > c[g - 2].h) out.push({ dir: "bull", lo: c[g - 2].h, hi: c[g].l, i: g - 1 });
      else if (c[g].h < c[g - 2].l) out.push({ dir: "bear", lo: c[g].h, hi: c[g - 2].l, i: g - 1 });
    }
    return out;
  }

  // Congestion box ending at the bar before the last closed bar, and a breakout on the last bar.
  function congestion(c, A) {
    var n = c.length, end = n - 2, start = end - CFG.congLen + 1;
    if (start < 0 || A[end] == null) return null;
    var hi = -Infinity, lo = Infinity;
    for (var i = start; i <= end; i++) { hi = Math.max(hi, c[i].h); lo = Math.min(lo, c[i].l); }
    var range = hi - lo;
    if (range <= 0) return null;
    var ratio = Math.abs(c[end].c - c[start].c) / range;
    var sideways = ratio <= CFG.congMaxRatio && range <= CFG.congMaxATR * A[end];
    if (!sideways) return null;
    var bodySum = 0, cnt = 0;
    for (var j = n - 1 - CFG.bodyLen; j < n - 1; j++) { if (j < 0) continue; bodySum += Math.abs(c[j].c - c[j].o); cnt++; }
    var avgBody = cnt ? bodySum / cnt : 0;
    var last = c[n - 1], body = Math.abs(last.c - last.o);
    var breakout = null;
    if (body >= CFG.bodyMult * avgBody) {
      if (last.c > hi) breakout = "bull";
      else if (last.c < lo) breakout = "bear";
    }
    return { hi: hi, lo: lo, start: start, end: end, breakout: breakout };
  }

  // A break is false if price closes back through the broken level within 3 closed bars.
  function breakQuality(c, ev) {
    if (!ev) return null;
    var n = c.length, after = c.slice(ev.i + 1, Math.min(n, ev.i + 4));
    var fail = after.some(function (k) { return ev.dir === "bull" ? k.c < ev.level : k.c > ev.level; });
    if (fail) return "false";
    if (after.length < 3) return "pending";
    return "held";
  }

  // An order block is strong when a fast impulse of at least 1 ATR leaves it within 3 bars.
  function obQuality(c, ob, atrV) {
    if (!ob || !atrV) return null;
    var n = c.length, end = Math.min(n - 1, ob.i + 3), best = 0;
    for (var j = ob.i + 1; j <= end; j++) {
      var mv = ob.dir === "bull" ? c[j].h - ob.hi : ob.lo - c[j].l;
      if (mv > best) best = mv;
    }
    var tested = false;
    for (var k = ob.i + 4; k < n; k++) { if (c[k].l <= ob.hi && c[k].h >= ob.lo) { tested = true; break; } }
    return { strong: best >= atrV, tested: tested };
  }

  // ---------- main analysis ----------
  function analyze(c, profileName, learn) {
    var P = PROFILES[profileName] || PROFILES.balanced;
    var n = c.length;
    if (n < 60) return { ready: false, reason: "Needs at least 60 candles" };

    var closes = c.map(function (x) { return x.c; });
    var E = ema(closes, CFG.emaLen), R = rsi(closes, CFG.rsiLen), A = atr(c, CFG.atrLen);
    var i = n - 1, price = c[i].c, ema50 = E[i], rsiV = R[i], atrV = A[i];
    if (ema50 == null || rsiV == null || atrV == null || E[i - 5] == null) {
      return { ready: false, reason: "Indicators not ready yet" };
    }

    var sw = swings(c, CFG.pivot), H = sw.H, L = sw.L;
    var sh = H[H.length - 1], sh2 = H[H.length - 2], sl = L[L.length - 1], sl2 = L[L.length - 2];

    // Market structure (ICT / SMC): HH+HL = bull, LH+LL = bear.
    var trend = null;
    if (sh && sh2 && sl && sl2) {
      if (sh.p > sh2.p && sl.p > sl2.p) trend = "bull";
      else if (sh.p < sh2.p && sl.p < sl2.p) trend = "bear";
    }

    // BOS / CHoCH: a close beyond the last confirmed swing in the last 20 bars.
    var ev = null;
    for (var j = Math.max(0, n - 20); j < n; j++) {
      if (sh && j > sh.i && c[j].c > sh.p) ev = { dir: "bull", i: j, level: sh.p, type: trend === "bear" ? "CHoCH" : "BOS" };
      if (sl && j > sl.i && c[j].c < sl.p) ev = { dir: "bear", i: j, level: sl.p, type: trend === "bull" ? "CHoCH" : "BOS" };
    }

    // Liquidity sweep: wick through a recent swing, close back inside (stop hunt).
    var sweep = null;
    for (var s = Math.max(0, n - 4); s < n; s++) {
      H.slice(-3).forEach(function (p) {
        if (s > p.i && c[s].h > p.p && c[s].c < p.p) sweep = { dir: "bear", i: s, level: p.p, wick: c[s].h };
      });
      L.slice(-3).forEach(function (p) {
        if (s > p.i && c[s].l < p.p && c[s].c > p.p) sweep = { dir: "bull", i: s, level: p.p, wick: c[s].l };
      });
    }

    // Fair value gap: most recent unfilled one from the last 40 bars.
    var fvg = null, all = fvgs(c, n - 40);
    for (var f = all.length - 1; f >= 0 && !fvg; f--) {
      var z = all[f], filled = false;
      for (var m = z.i + 2; m < n; m++) { if (c[m].l <= z.hi && c[m].h >= z.lo) { filled = true; break; } }
      if (!filled) fvg = z;
    }

    // Order block: last opposite-colour candle before the structure break.
    var ob = null;
    if (ev) {
      for (var o = ev.i - 1; o >= Math.max(0, ev.i - 12); o--) {
        var k = c[o];
        if (ev.dir === "bull" && k.c < k.o) { ob = { dir: "bull", lo: k.l, hi: k.h, i: o }; break; }
        if (ev.dir === "bear" && k.c > k.o) { ob = { dir: "bear", lo: k.l, hi: k.h, i: o }; break; }
      }
    }

    // Premium / discount inside the last swing range (ICT).
    var rangeHi = H.length ? Math.max(H[H.length - 1].p, H.length > 1 ? H[H.length - 2].p : -Infinity) : null;
    var rangeLo = L.length ? Math.min(L[L.length - 1].p, L.length > 1 ? L[L.length - 2].p : Infinity) : null;
    var pd = null, eq = null;
    if (rangeHi != null && rangeLo != null && rangeHi > rangeLo) {
      eq = (rangeHi + rangeLo) / 2;
      pd = price < eq ? "discount" : "premium";
    }

    // Equal highs / lows (liquidity pools).
    var eqH = H.slice(-6).some(function (a, ai, arr) {
      return arr.some(function (b, bi) { return bi > ai && Math.abs(a.p - b.p) / a.p < 0.0015; });
    });
    var eqL = L.slice(-6).some(function (a, ai, arr) {
      return arr.some(function (b, bi) { return bi > ai && Math.abs(a.p - b.p) / a.p < 0.0015; });
    });
    var bsl = H.length ? Math.max.apply(null, H.slice(-5).map(function (x) { return x.p; })) : null;
    var ssl = L.length ? Math.min.apply(null, L.slice(-5).map(function (x) { return x.p; })) : null;

    var cong = congestion(c, A);
    var bq = breakQuality(c, ev), oq = obQuality(c, ob, atrV);
    var tol = 0.3 * atrV;
    function near(z) { return z && price >= z.lo - tol && price <= z.hi + tol; }

    // Confirmations, built per side. Each item has a weight; the score is the sum of ticked items.
    function checks(side) {
      var up = side === "long", d = up ? "bull" : "bear";
      var out = [];
      out.push({ label: up ? "Price above EMA50" : "Price below EMA50", ok: up ? price > ema50 : price < ema50, w: 1 });
      var rising = ema50 > E[i - 5];
      out.push({ label: up ? "EMA50 sloping up" : "EMA50 sloping down", ok: up ? rising : !rising, w: 1 });
      out.push({ label: up ? "RSI in bullish momentum zone (45-68)" : "RSI in bearish momentum zone (32-55)",
        ok: up ? (rsiV >= 45 && rsiV <= 68) : (rsiV >= 32 && rsiV <= 55), w: 1 });
      var brkOK = !!(ev && ev.dir === d && bq !== "false");
      out.push({ label: brkOK ? ev.type + " " + (up ? "bullish" : "bearish") + " (" + bq + ")"
          : (ev && ev.dir === d ? "False break: price closed back through the level" : "No structure break in direction"),
        ok: brkOK, w: 2 });
      out.push({ label: sweep && sweep.dir === d ? "Liquidity sweep in direction" : "No liquidity sweep in direction",
        ok: !!(sweep && sweep.dir === d), w: 2 });
      out.push({ label: fvg && fvg.dir === d && near(fvg) ? "Price inside FVG in direction" : "Price not inside FVG in direction",
        ok: !!(fvg && fvg.dir === d && near(fvg)), w: 1 });
      var obOK = !!(ob && ob.dir === d && near(ob) && oq && oq.strong);
      out.push({ label: obOK ? "Price inside Order Block with strong impulse" : (ob && ob.dir === d && near(ob) ? "Order Block without enough impulse" : "Price not inside Order Block"),
        ok: obOK, w: 1 });
      out.push({ label: pd ? (up ? "Discount zone" : "Premium zone") + (pd === (up ? "discount" : "premium") ? " (favourable)" : " (unfavourable)") : "Range unclear",
        ok: pd === (up ? "discount" : "premium"), w: 1 });
      out.push({ label: cong && cong.breakout === d ? "Congestion breakout with strong candle" : "No congestion breakout in direction",
        ok: !!(cong && cong.breakout === d), w: 2 });
      return out;
    }

    var longChecks = checks("long"), shortChecks = checks("short");
    function tally(list) {
      return list.reduce(function (acc, x) { if (x.ok) { acc.score += x.w; acc.count++; } return acc; }, { score: 0, count: 0 });
    }
    var lt = tally(longChecks), st = tally(shortChecks);
    var blockLong = rsiV >= CFG.rsiOB, blockShort = rsiV <= CFG.rsiOS;

    var thr = CFG.threshold + ((learn && learn.extra) || 0);
    // ICT rule: no trade without a confirmed structure break in the trade direction (not a false break).
    var brkLong = !!(ev && ev.dir === "bull" && bq !== "false");
    var brkShort = !!(ev && ev.dir === "bear" && bq !== "false");
    var qualLong = lt.score >= thr && lt.count >= CFG.minConfirm && !blockLong && brkLong;
    var qualShort = st.score >= thr && st.count >= CFG.minConfirm && !blockShort && brkShort;

    var status = "Wait: no trade with all conditions met";
    var reasons = [];
    var signal = null;
    if (qualLong && !qualShort) { signal = build("LONG", lt); }
    else if (qualShort && !qualLong) { signal = build("SHORT", st); }
    else if (qualLong && qualShort) { status = "Conflict: buy and sell conditions both met, no trade"; }
    if (!signal && !status.startsWith("Conflict")) {
      if (blockLong && lt.score >= CFG.threshold) reasons.push("RSI overbought (" + rsiV.toFixed(1) + "), buying blocked for now");
      if (blockShort && st.score >= CFG.threshold) reasons.push("RSI oversold (" + rsiV.toFixed(1) + "), selling blocked for now");
    }

    function build(dir, t) {
      var up = dir === "LONG", entry = price;
      var key = dir + "|" + (sweep && sweep.dir === (up ? "bull" : "bear") ? "sweep" : "nosweep") + "|" +
        (ob && ob.dir === (up ? "bull" : "bear") ? "ob" : "noob") + "|" + (bq || "none");
      if (learn && learn.block && learn.block.indexOf(key) >= 0) {
        reasons.push("This pattern is paused after repeated losses in your journal, so no trade");
        return null;
      }
      var stop;
      var anchor = up ? (sl ? sl.p : null) : (sh ? sh.p : null);
      var cands = [];
      if (anchor != null) cands.push(anchor);
      if (sweep && sweep.dir === (up ? "bull" : "bear")) cands.push(sweep.wick);
      if (ob && ob.dir === (up ? "bull" : "bear")) cands.push(up ? ob.lo : ob.hi);
      if (!cands.length) return null;
      stop = up ? Math.min.apply(null, cands) - P.slBufferATR * atrV : Math.max.apply(null, cands) + P.slBufferATR * atrV;
      var risk = Math.abs(entry - stop);
      var valid = up ? stop < entry : stop > entry;
      if (!valid || risk < CFG.slMinATR * atrV || risk > P.slMaxATR * atrV) {
        reasons.push("Logical stop " + (risk / atrV).toFixed(2) + " ATR, outside the allowed range, so no trade");
        return null;
      }
      var s = up ? 1 : -1;
      status = dir === "LONG" ? "Confirmed buy signal" : "Confirmed sell signal";
      return {
        dir: dir, key: key, score: t.score, count: t.count,
        grade: t.score >= 9 ? "A" : t.score >= 7 ? "B" : "C",
        entry: entry, sl: stop,
        tp1: entry + s * P.tp[0] * risk, tp2: entry + s * P.tp[1] * risk, tp3: entry + s * P.tp[2] * risk,
        risk: risk
      };
    }

    return {
      ready: true, n: n, price: price, ema50: ema50, emaRising: ema50 > E[i - 5],
      rsi: rsiV, atr: atrV, trend: trend, ev: ev, sweep: sweep, fvg: fvg, ob: ob,
      pd: pd, eq: eq, bsl: bsl, ssl: ssl, eqH: eqH, eqL: eqL, cong: cong,
      longChecks: longChecks, shortChecks: shortChecks,
      longScore: lt.score, shortScore: st.score,
      blockLong: blockLong, blockShort: blockShort,
      signal: signal, status: status, reasons: reasons, bq: bq, oq: oq,
      learnExtra: (learn && learn.extra) || 0,
      series: { ema: E }
    };
  }

  // Plain-language story in three levels: trend, liquidity and zones, decision.
  function story(r) {
    if (!r || !r.ready) return null;
    var L1 = [], L2 = [], L3 = [];
    var trendName = r.trend === "bull" ? "bullish" : r.trend === "bear" ? "bearish" : "Ranging";
    L1.push(r.trend === "bull" ? "Higher highs and higher lows (HH, HL)" : r.trend === "bear" ? "Lower highs and lower lows (LH, LL)" : "Swing highs and lows are not ordered");
    L1.push("Price " + (r.price > r.ema50 ? "above" : "below") + " EMA50, which is " + (r.emaRising ? "sloping up" : "sloping down"));
    L1.push("Trend is confirmed only by a close beyond a prior swing high or low");

    if (r.sweep) L2.push((r.sweep.dir === "bear" ? "Liquidity swept above the high" : "Liquidity swept below the low") + " at " + fmtN(r.sweep.level) + " then price returned");
    else L2.push("No recent liquidity sweep");
    L2.push("Buy-side liquidity above " + fmtN(r.bsl) + ", sell-side liquidity below " + fmtN(r.ssl) + " (possible price targets)");
    if (r.ob) L2.push("Order block " + (r.ob.dir === "bull" ? "bullish" : "bearish") + " " + fmtN(r.ob.lo) + " – " + fmtN(r.ob.hi) +
      (r.oq ? (r.oq.strong ? ", strong impulse" : ", weak impulse") + (r.oq.tested ? " and tested" : " and not yet tested") : ""));
    else L2.push("No clear order block");
    if (r.fvg) L2.push("FVG " + (r.fvg.dir === "bull" ? "bullish" : "bearish") + " " + fmtN(r.fvg.lo) + " – " + fmtN(r.fvg.hi));

    var bqTxt = r.bq === "false" ? "false, price closed back through the level"
      : r.bq === "held" ? "held for 3 candles"
      : r.bq === "pending" ? "waiting for 3-candle confirmation"
      : "no recent break";
    L3.push("Structure break: " + bqTxt);
    L3.push("Confirmations: buy " + r.longScore + "/12 · بيع " + r.shortScore + "/12");
    if (r.learnExtra) L3.push("Decision bar raised after earlier losses in your journal");
    if (r.signal) {
      L3.push("Plan: entry " + fmtN(r.signal.entry) + " · stop " + fmtN(r.signal.sl) + " · first target " + fmtN(r.signal.tp1));
    } else if (r.trend === "bear") {
      L3.push("Wait: pullback into the order block or gap, then bearish rejection");
    } else if (r.trend === "bull") {
      L3.push("Wait: pullback into a buy zone, then bullish rejection");
    } else {
      L3.push("Wait: clear break of the range in either direction");
    }
    return {
      trend: trendName,
      l1: { title: "Trend", state: trendName, lines: L1 },
      l2: { title: "Liquidity & zones", state: r.sweep ? "sweep" : "no sweep", lines: L2 },
      l3: { title: "Decision", state: r.signal ? (r.signal.dir === "LONG" ? "Buy" : "Sell") : "Wait", lines: L3 }
    };
  }
  function fmtN(v) {
    if (v == null || isNaN(v)) return "—";
    var d = Math.abs(v) < 2 ? 5 : Math.abs(v) < 100 ? 3 : 2;
    return v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  // ---------- backtest (no lookahead: each decision sees only closed bars) ----------
  // Simple rule: after a signal, first of {stop, TP1} wins. Same-bar ties count as stop (conservative).
  function backtest(c, maxBars, profileName) {
    maxBars = maxBars || 120;
    var trades = [], busyUntil = -1;
    for (var i = 60; i < c.length - 1; i++) {
      if (i <= busyUntil) continue;
      var r = analyze(c.slice(0, i + 1), profileName);
      if (!r.ready || !r.signal) continue;
      var s = r.signal, up = s.dir === "LONG", R = 0, exit = null, outcome = "open";
      for (var j = i + 1; j < Math.min(c.length, i + 1 + maxBars); j++) {
        var b = c[j];
        var hitStop = up ? b.l <= s.sl : b.h >= s.sl;
        var hitTP1 = up ? b.h >= s.tp1 : b.l <= s.tp1;
        if (hitStop) { outcome = "stop"; R = -1; exit = j; break; }
        if (hitTP1) { outcome = "tp1"; R = Math.abs(s.tp1 - s.entry) / s.risk; exit = j; break; }
      }
      if (exit == null) { exit = Math.min(c.length - 1, i + maxBars); outcome = "timeout"; R = 0; }
      trades.push({ i: i, dir: s.dir, grade: s.grade, outcome: outcome, R: R });
      busyUntil = exit;
    }
    var wins = trades.filter(function (t) { return t.R > 0; }).length;
    var grossW = trades.filter(function (t) { return t.R > 0; }).reduce(function (a, t) { return a + t.R; }, 0);
    var grossL = Math.abs(trades.filter(function (t) { return t.R < 0; }).reduce(function (a, t) { return a + t.R; }, 0));
    var decided = trades.filter(function (t) { return t.outcome !== "timeout"; }).length;
    return {
      trades: trades,
      count: trades.length,
      wins: wins,
      winRate: decided ? wins / decided : 0,
      netR: trades.reduce(function (a, t) { return a + t.R; }, 0),
      profitFactor: grossL > 0 ? grossW / grossL : (grossW > 0 ? Infinity : 0)
    };
  }

  // ---------- sample data (clearly labelled as examples) ----------
  function sampleCandles(base, vol, count, seed) {
    var s = seed >>> 0;
    function r() { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }
    var p = base * 0.97, out = [];
    for (var i = 0; i < count; i++) {
      var o = p;
      var drift = Math.sin(i / 40) * vol * 0.8 + Math.sin(i / 9) * vol * 0.3;
      var c = o * (1 + (r() - 0.5) * 2 * vol + drift * 0.15);
      var h = Math.max(o, c) * (1 + r() * vol * 0.6);
      var l = Math.min(o, c) * (1 - r() * vol * 0.6);
      out.push({ t: i, o: o, h: h, l: l, c: c, v: 1 });
      p = c;
    }
    var f = base / out[out.length - 1].c;
    return out.map(function (k) { return { t: k.t, o: k.o * f, h: k.h * f, l: k.l * f, c: k.c * f, v: k.v }; });
  }

  return {
    CFG: CFG, PROFILES: PROFILES, ema: ema, rsi: rsi, atr: atr, swings: swings, fvgs: fvgs,
    analyze: analyze, backtest: backtest, sampleCandles: sampleCandles, story: story,
    breakQuality: breakQuality, obQuality: obQuality
  };
});
