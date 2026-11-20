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
    sniper:   { slMaxATR: 1.2, slBufferATR: 0.1, tp: [3, 5, 8] },
    scalp:    { slMaxATR: 0.9, slBufferATR: 0.1, tp: [1.2, 2, 3] }
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

  // ---------- optional indicators ----------
  function sma(vals, len) {
    var out = new Array(vals.length).fill(null), s = 0;
    for (var i = 0; i < vals.length; i++) {
      s += vals[i]; if (i >= len) s -= vals[i - len];
      if (i >= len - 1) out[i] = s / len;
    }
    return out;
  }
  function bollinger(vals, len, k) {
    var mid = sma(vals, len), up = [], lo = [];
    for (var i = 0; i < vals.length; i++) {
      if (mid[i] == null) { up.push(null); lo.push(null); continue; }
      var v = 0;
      for (var j = i - len + 1; j <= i; j++) v += (vals[j] - mid[i]) * (vals[j] - mid[i]);
      var sd = Math.sqrt(v / len);
      up.push(mid[i] + k * sd); lo.push(mid[i] - k * sd);
    }
    return { mid: mid, up: up, lo: lo };
  }
  function macd(vals, f, s, sig) {
    var ef = ema(vals, f), es = ema(vals, s);
    var line = vals.map(function (_, i) { return ef[i] != null && es[i] != null ? ef[i] - es[i] : null; });
    var idx = [], nums = [];
    line.forEach(function (v, i) { if (v != null) { idx.push(i); nums.push(v); } });
    var sg = ema(nums, sig);
    var signal = new Array(vals.length).fill(null), hist = new Array(vals.length).fill(null);
    idx.forEach(function (i, j) { if (sg[j] != null) { signal[i] = sg[j]; hist[i] = line[i] - sg[j]; } });
    return { line: line, signal: signal, hist: hist };
  }

  // ---------- main analysis ----------
  // Scalp, multi-timeframe: 15m order block is the zone; on 1m the trend must agree, and when price
  // reaches the 15m zone a 1m order block in the same direction gives the entry and the stop.
  // Entry: open of the 1m order block candle. Stop: beyond its far edge (above its high for shorts,
  // below its low for longs), plus the profile buffer.
  function scalpSetup(c15, c1, profileName, r15pre) {
    var P = PROFILES[profileName] || PROFILES.scalp;
    var r15 = r15pre || analyze(c15, profileName), r1 = analyze(c1, profileName);
    if (!r15.ready || !r1.ready) return { ready: false, reason: "not enough data" };
    // 15m zone = the single candle that produced the strong move (impulse of at least 1 ATR within 3 bars).
    // Weak or unconfirmed candles do not define a zone.
    var ob15 = r15.ob;
    if (!ob15) return { ready: false, reason: "no 15m order block" };
    if (!r15.oq || !r15.oq.strong) return { ready: false, reason: "15m candle did not produce a strong move" };
    var dir = ob15.dir === "bear" ? "SHORT" : "LONG";
    var up = dir === "LONG";
    var tol = 0.3 * r15.atr, p1 = r1.price;
    var inZone = p1 >= ob15.lo - tol && p1 <= ob15.hi + tol;
    if (!inZone) return { ready: false, reason: "price not at the 15m order block yet" };
    // 1m confirmation: a break of structure (BOS) or change of character (CHoCH) in the trade direction,
    // and the order block candle that produced it. A full HH/HL trend is not required.
    var want = up ? "bull" : "bear";
    if (!r1.ev || r1.ev.dir !== want) return { ready: false, reason: "no 1m break of structure in direction" };
    var ob1 = r1.ob;
    if (!ob1 || ob1.dir !== want) return { ready: false, reason: "no 1m order block in direction" };
    var k = c1[ob1.i];
    if (!k) return { ready: false, reason: "1m order block candle missing" };
    var entry = k.o;
    var atr1 = r1.atr;
    // Stop: exactly at the end of the 1m order block candle (its low for longs, its high for shorts).
    var stop = up ? k.l : k.h;
    var valid = up ? stop < entry : stop > entry;
    var risk = Math.abs(entry - stop);
    if (!valid || !risk || risk > P.slMaxATR * atr1) return { ready: false, reason: "stop outside the allowed range" };
    var s = up ? 1 : -1;
    return {
      ready: true, price: p1, ema50: r15.ema50,
      signal: { dir: dir, key: "scalp-mtf", score: 0, count: 0, grade: "A", entry: entry, sl: stop, risk: risk,
        tp1: entry + s * P.tp[0] * risk, tp2: entry + s * P.tp[1] * risk, tp3: entry + s * P.tp[2] * risk }
    };
  }
  // 15m-only rule: the zone is a strong-move candle; price returns into it, a break in the trade
  // direction confirms; entry at the close of the confirming bar; stop at the zone's far edge.
  function backtest15(c, maxBars, costPct) {
    maxBars = maxBars || 96; costPct = costPct || 0;
    var trades = [], busy = -1;
    for (var i = 120; i < c.length - 1; i++) {
      if (i <= busy) continue;
      var r = analyze(c.slice(0, i + 1), "scalp");
      // Entry happens BEFORE the break: the zone is a strong-move candle and price touches it.
      // BOS/CHoCH is only a confirmation that is recorded, not a condition for entry.
      if (!r.ready || !r.ob || !r.oq || !r.oq.strong) continue;
      var up = r.ob.dir === "bull";
      var tol = 0.3 * r.atr, p = c[i].c;
      if (p < r.ob.lo - tol || p > r.ob.hi + tol) continue;
      var entry = p, stop = up ? r.ob.lo : r.ob.hi, risk = Math.abs(entry - stop);
      if (!risk || (up ? stop >= entry : stop <= entry)) continue;
      var s1 = up ? 1 : -1, tp1 = entry + s1 * PROFILES.scalp.tp[0] * risk;
      var R = 0, exit = null, outcome = "open";
      for (var q = i + 1; q < Math.min(c.length, i + 1 + maxBars); q++) {
        var b = c[q];
        if (up ? b.l <= stop : b.h >= stop) { outcome = "stop"; R = -1; exit = q; break; }
        if (up ? b.h >= tp1 : b.l <= tp1) { outcome = "tp1"; R = Math.abs(tp1 - entry) / risk; exit = q; break; }
      }
      if (exit == null) { exit = Math.min(c.length - 1, i + maxBars); outcome = "timeout"; R = 0; }
      var cost = outcome !== "timeout" ? costPct * entry / risk : 0;
      trades.push({ outcome: outcome, R: R - cost, grossR: R, cost: cost, risk: risk, confirmed: !!(r.ev && r.ev.dir === (up ? "bull" : "bear")) });
      busy = exit;
    }
    var wins = trades.filter(function (x) { return x.R > 0; }).length;
    var gw = trades.filter(function (x) { return x.R > 0; }).reduce(function (a, x) { return a + x.R; }, 0);
    var gl = Math.abs(trades.filter(function (x) { return x.R < 0; }).reduce(function (a, x) { return a + x.R; }, 0));
    var decided = trades.filter(function (x) { return x.outcome !== "timeout"; }).length;
    return {
      trades: trades, count: trades.length, wins: wins, winRate: decided ? wins / decided : 0,
      confirmedShare: trades.length ? trades.filter(function (x) { return x.confirmed; }).length / trades.length : 0,
      netR: trades.reduce(function (a, x) { return a + x.R; }, 0),
      grossR: trades.reduce(function (a, x) { return a + x.grossR; }, 0),
      avgCostR: trades.length ? trades.reduce(function (a, x) { return a + x.cost; }, 0) / trades.length : 0,
      avgRiskUSD: trades.length ? trades.reduce(function (a, x) { return a + x.risk; }, 0) / trades.length : 0,
      profitFactor: gl > 0 ? gw / gl : (gw > 0 ? Infinity : 0)
    };
  }
  // Multi-timeframe scalp backtest: for each 1m bar, the 15m order block zone and the 1m rules
  // decide the entry; the trade is then followed on 1m bars (stop first, then TP1, as in backtest).
  function backtestMTF(c15, c1, profileName, maxBars, costPct) {
    maxBars = maxBars || 240;
    costPct = costPct || 0;
    var trades = [], busy = -1, j = -1, r15 = null, rj = -1;
    for (var i = 300; i < c1.length - 1; i++) {
      if (i <= busy) continue;
      var t = c1[i].t;
      while (j + 1 < c15.length && c15[j + 1].t <= t) j++;
      if (j < 60) continue;
      if (j !== rj) { r15 = analyze(c15.slice(0, j + 1), profileName); rj = j; }
      if (!r15.ob) continue;
      var zt = 0.3 * r15.atr, pc = c1[i].c;
      if (pc < r15.ob.lo - zt || pc > r15.ob.hi + zt) continue;
      var sc = scalpSetup(c15.slice(0, j + 1), c1.slice(Math.max(0, i - 499), i + 1), profileName, r15);
      if (!sc.ready) continue;
      var s = sc.signal, up = s.dir === "LONG", R = 0, exit = null, outcome = "open";
      for (var q = i + 1; q < Math.min(c1.length, i + 1 + maxBars); q++) {
        var b = c1[q];
        var hitStop = up ? b.l <= s.sl : b.h >= s.sl;
        var hitTP1 = up ? b.h >= s.tp1 : b.l <= s.tp1;
        if (hitStop) { outcome = "stop"; R = -1; exit = q; break; }
        if (hitTP1) { outcome = "tp1"; R = Math.abs(s.tp1 - s.entry) / s.risk; exit = q; break; }
      }
      if (exit == null) { exit = Math.min(c1.length - 1, i + maxBars); outcome = "timeout"; R = 0; }
      // trading cost: a fixed share of the entry price, expressed in R
      var cost = outcome !== "timeout" ? costPct * s.entry / s.risk : 0;
      trades.push({ i: i, dir: s.dir, outcome: outcome, R: R - cost, grossR: R, cost: cost, risk: s.risk });
      busy = exit;
    }
    var wins = trades.filter(function (x) { return x.R > 0; }).length;
    var grossW = trades.filter(function (x) { return x.R > 0; }).reduce(function (a, x) { return a + x.R; }, 0);
    var grossL = Math.abs(trades.filter(function (x) { return x.R < 0; }).reduce(function (a, x) { return a + x.R; }, 0));
    var decided = trades.filter(function (x) { return x.outcome !== "timeout"; }).length;
    return {
      trades: trades, count: trades.length, wins: wins,
      winRate: decided ? wins / decided : 0,
      netR: trades.reduce(function (a, x) { return a + x.R; }, 0),
      grossR: trades.reduce(function (a, x) { return a + x.grossR; }, 0),
      avgCostR: trades.length ? trades.reduce(function (a, x) { return a + x.cost; }, 0) / trades.length : 0,
      avgRiskUSD: trades.length ? trades.reduce(function (a, x) { return a + x.risk; }, 0) / trades.length : 0,
      profitFactor: grossL > 0 ? grossW / grossL : (grossW > 0 ? Infinity : 0)
    };
  }
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
    var emaOkL = price > ema50, emaOkS = price < ema50;
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
    var qualLong = lt.score >= thr && lt.count >= CFG.minConfirm && !blockLong && brkLong && (!(learn && learn.requireEma) || emaOkL);
    var qualShort = st.score >= thr && st.count >= CFG.minConfirm && !blockShort && brkShort && (!(learn && learn.requireEma) || emaOkS);

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
      // Entry rule: when the trigger candle runs in the trade direction, enter at its open.
      var lastC = c[n - 1];
      if (lastC && ((up && lastC.c > lastC.o) || (!up && lastC.c < lastC.o))) entry = lastC.o;
      var key = dir + "|" + (sweep && sweep.dir === (up ? "bull" : "bear") ? "sweep" : "nosweep") + "|" +
        (ob && ob.dir === (up ? "bull" : "bear") ? "ob" : "noob") + "|" + (bq || "none");
      if (learn && learn.block && learn.block.indexOf(key) >= 0) {
        reasons.push("This pattern is paused after repeated losses in your journal, so no trade");
        return null;
      }
      var stop;
      var anchor = up ? (sl ? sl.p : null) : (sh ? sh.p : null);
      // Stop rule: the far edge of the order block candle (its low for longs, its high for shorts).
      // Only when no order block is in the trade direction does the older anchor logic apply.
      var cands = [];
      if (ob && ob.dir === (up ? "bull" : "bear")) cands.push(up ? ob.lo : ob.hi);
      else {
        if (anchor != null) cands.push(anchor);
        if (sweep && sweep.dir === (up ? "bull" : "bear")) cands.push(sweep.wick);
      }
      if (!cands.length) return null;
      stop = up ? Math.min.apply(null, cands) - (P.slBufferATR + ((learn && learn.widen) || 0)) * atrV : Math.max.apply(null, cands) + (P.slBufferATR + ((learn && learn.widen) || 0)) * atrV;
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

  // Plain-language story in three levels: trend, liquidity and zones, decision. Supports "en" and "ar".
  var TXT = {
    en: {
      hh: "Higher highs and higher lows (HH, HL)", lh: "Lower highs and lower lows (LH, LL)", unordered: "Swing highs and lows are not ordered",
      above: "above", below: "below", emaSlope: "EMA50, which is sloping ", up: "up", down: "down",
      confirm: "Trend is confirmed only by a close beyond a prior swing high or low",
      sweepHigh: "Liquidity swept above the high at ", sweepLow: "Liquidity swept below the low at ", then: " then price returned",
      noSweep: "No recent liquidity sweep",
      liq: "Buy-side liquidity above ", liqS: ", sell-side liquidity below ", liqEnd: " (possible price targets)",
      ob: "Order block ", bullish: "bullish", bearish: "bearish", strong: ", strong impulse", weak: ", weak impulse",
      tested: " and tested", untested: " and not yet tested", noOb: "No clear order block", fvg: "FVG ",
      brk: "Structure break: ", bqFalse: "false, price closed back through the level", bqHeld: "held for 3 candles",
      bqPending: "waiting for 3-candle confirmation", bqNone: "no recent break",
      conf: "Confirmations: buy ", sell: " · sell ", learn: "Decision bar raised after earlier losses in your journal",
      plan: "Plan: entry ", stop: " · stop ", first: " · first target ",
      waitBear: "Wait: pullback into the order block or gap, then bearish rejection",
      waitBull: "Wait: pullback into a buy zone, then bullish rejection",
      waitRange: "Wait: clear break of the range in either direction",
      t1: "Market structure (BOS / CHoCH)", t2: "Order blocks & FVG", t3: "Decision & plan", sweepS: "sweep", noSweepS: "no sweep",
      buy: "Buy", sellS: "Sell", wait: "Wait", rangeS: "Ranging"
    },
    ar: {
      hh: "قمم وقيعان أعلى (HH و HL)", lh: "قمم وقيعان أدنى (LH و LL)", unordered: "القمم والقيعان غير مرتبة بعد",
      above: "فوق", below: "تحت", emaSlope: "، والمتوسط EMA50 ", up: "مائل للأعلى", down: "مائل للأسفل",
      confirm: "لا يتأكد الاتجاه إلا بإغلاق واضح فوق قمة سابقة أو تحت قاع سابق",
      sweepHigh: "سُحبت سيولة فوق القمة عند ", sweepLow: "سُحبت سيولة تحت القاع عند ", then: " ثم عاد السعر",
      noSweep: "لا يوجد سحب سيولة حديث",
      liq: "سيولة الشراء فوق ", liqS: "، وسيولة البيع تحت ", liqEnd: " (أهداف محتملة للسعر)",
      ob: "كتلة أوامر ", bullish: "صاعدة", bearish: "هابطة", strong: "، باندفاع قوي", weak: "، باندفاع ضعيف",
      tested: " وتم اختبارها", untested: " ولم تُختبر بعد", noOb: "لا توجد كتلة أوامر واضحة", fvg: "فجوة FVG ",
      brk: "كسر الهيكل: ", bqFalse: "كاذب، عاد السعر خلف المستوى", bqHeld: "صامد لثلاث شموع",
      bqPending: "بانتظار تأكيد ثلاث شموع", bqNone: "لا كسر حديث",
      conf: "التأكيدات: شراء ", sell: " · بيع ", learn: "رُفع شرط القرار بعد خسائر سابقة في سجلك",
      plan: "الخطة: دخول ", stop: " · وقف ", first: " · الهدف الأول ",
      waitBear: "انتظار: ارتداد نحو كتلة الأوامر أو الفجوة ثم رفض هابط",
      waitBull: "انتظار: ارتداد نحو منطقة شراء ثم رفض صاعد",
      waitRange: "انتظار: كسر واضح لنطاق العرض في أحد الاتجاهين",
      t1: "هيكل السوق (BOS / CHoCH)", t2: "كتل الأوامر والفجوات", t3: "القرار والخطة", sweepS: "سحب سيولة", noSweepS: "بلا سحب",
      buy: "شراء", sellS: "بيع", wait: "انتظار", rangeS: "عرضي"
    }
  };

  function story(r, lang) {
    if (!r || !r.ready) return null;
    var T = TXT[lang === "ar" ? "ar" : "en"], ar = lang === "ar";
    var L1 = [], L2 = [], L3 = [];
    var trendName = r.trend === "bull" ? (ar ? "صاعد" : "bullish") : r.trend === "bear" ? (ar ? "هابط" : "bearish") : T.rangeS;
    L1.push(r.trend === "bull" ? T.hh : r.trend === "bear" ? T.lh : T.unordered);
    if (ar) L1.push("السعر " + (r.price > r.ema50 ? T.above : T.below) + " متوسط EMA50" + T.emaSlope.replace("، والمتوسط EMA50 ", "، والمتوسط ") + (r.emaRising ? T.up : T.down));
    else L1.push("Price " + (r.price > r.ema50 ? T.above : T.below) + " EMA50, which is sloping " + (r.emaRising ? T.up : T.down));
    L1.push(T.confirm);

    if (r.sweep) L2.push((r.sweep.dir === "bear" ? T.sweepHigh : T.sweepLow) + fmtN(r.sweep.level) + T.then);
    else L2.push(T.noSweep);
    L2.push(T.liq + fmtN(r.bsl) + T.liqS + fmtN(r.ssl) + T.liqEnd);
    if (r.ob) {
      var obDir = r.ob.dir === "bull" ? T.bullish : T.bearish;
      var obTxt = T.ob + obDir + " " + fmtN(r.ob.lo) + " – " + fmtN(r.ob.hi);
      if (r.oq) obTxt += (r.oq.strong ? T.strong : T.weak) + (r.oq.tested ? T.tested : T.untested);
      L2.push(obTxt);
    } else L2.push(T.noOb);
    if (r.fvg) L2.push(T.fvg + (r.fvg.dir === "bull" ? T.bullish : T.bearish) + " " + fmtN(r.fvg.lo) + " – " + fmtN(r.fvg.hi));

    var bqTxt = r.bq === "كاذب" || r.bq === "false" ? T.bqFalse
      : r.bq === "صامد" || r.bq === "held" ? T.bqHeld
      : r.bq === "قيد الاختبار" || r.bq === "pending" ? T.bqPending
      : T.bqNone;
    L3.push(T.brk + bqTxt);
    L3.push(T.conf + r.longScore + "/12" + T.sell + r.shortScore + "/12");
    if (r.learnExtra) L3.push(T.learn);
    if (r.signal) L3.push(T.plan + fmtN(r.signal.entry) + T.stop + fmtN(r.signal.sl) + T.first + fmtN(r.signal.tp1));
    else if (r.trend === "bear") L3.push(T.waitBear);
    else if (r.trend === "bull") L3.push(T.waitBull);
    else L3.push(T.waitRange);

    var decState = r.signal ? (r.signal.dir === "LONG" ? T.buy : T.sellS) : T.wait;
    return {
      trend: trendName,
      l1: { title: T.t1, state: trendName, lines: L1 },
      l2: { title: T.t2, state: r.sweep ? T.sweepS : T.noSweepS, lines: L2 },
      l3: { title: T.t3, state: decState, lines: L3 }
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
    CFG: CFG, PROFILES: PROFILES, scalpSetup: scalpSetup, backtestMTF: backtestMTF, backtest15: backtest15, ema: ema, sma: sma, bollinger: bollinger, macd: macd, rsi: rsi, atr: atr, swings: swings, fvgs: fvgs,
    analyze: analyze, backtest: backtest, sampleCandles: sampleCandles, story: story, TXT: TXT,
    breakQuality: breakQuality, obQuality: obQuality
  };
});
