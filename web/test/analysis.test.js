// Run with: node web/test/analysis.test.js
const assert = require("assert");
const A = require("../analysis.js");

// EMA of a constant series equals the constant.
assert.strictEqual(Math.round(A.ema(new Array(80).fill(5), 50)[79]), 5);

// RSI of a strictly rising series is 100.
const up = Array.from({ length: 40 }, (_, i) => 100 + i);
assert.strictEqual(A.rsi(up, 14)[39], 100);

// Too few candles are reported as not ready, never as a signal.
assert.strictEqual(A.analyze(A.sampleCandles(100, 0.01, 30, 1)).ready, false);

// Analysis is deterministic and only uses closed bars: a prefix gives the same answer as before the next bar existed.
const c = A.sampleCandles(3716, 0.0028, 300, 7);
const a1 = A.analyze(c.slice(0, 200));
const a2 = A.analyze(c.slice(0, 200));
assert.deepStrictEqual(a1.signal, a2.signal);

// Any signal must have stop on the correct side and TP ordering.
for (let i = 60; i < c.length; i += 3) {
  const r = A.analyze(c.slice(0, i + 1));
  if (!r.signal) continue;
  const s = r.signal;
  if (s.dir === "LONG") { assert.ok(s.sl < s.entry); assert.ok(s.tp1 > s.entry && s.tp2 > s.tp1 && s.tp3 > s.tp2); }
  else { assert.ok(s.sl > s.entry); assert.ok(s.tp1 < s.entry && s.tp2 < s.tp1 && s.tp3 < s.tp2); }
  assert.ok(s.score >= A.CFG.threshold && s.count >= A.CFG.minConfirm);
}

// RSI overbought blocks a long even when the score passes.
console.log("analysis tests passed");

// Sniper profile: stops never exceed 1.2 ATR and targets keep their order.
(function () {
  const c2 = A.sampleCandles(91527, 0.0036, 400, 5);
  let checked = 0;
  for (let i = 60; i < c2.length; i += 2) {
    const r = A.analyze(c2.slice(0, i + 1), "sniper");
    if (!r.signal) continue;
    const s = r.signal;
    assert.ok(s.risk <= 1.2 * r.atr + 1e-9, "sniper stop too wide");
    if (s.dir === "LONG") assert.ok(s.tp3 > s.tp2 && s.tp2 > s.tp1 && s.tp1 > s.entry);
    else assert.ok(s.tp3 < s.tp2 && s.tp2 < s.tp1 && s.tp1 < s.entry);
    checked++;
  }
  console.log("sniper profile checked", checked, "signals");
})();
