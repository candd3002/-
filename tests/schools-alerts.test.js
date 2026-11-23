// Run with: node tests/schools-alerts.test.js
const assert = require("assert");
const A = require("../pages-site/analysis.js");
const S = require("../pages-site/schools.js");

const H = 3600e3;
function withTime(c, t0, ms) { return c.map((k, i) => Object.assign({}, k, { t: t0 + i * ms })); }
function bar(t, o, h, l, c, v) { return { t, o, h, l, c, v: v || 1 }; }

// ---------- alert hygiene ----------
(function closedBars() {
  const now = Date.UTC(2026, 10, 23, 10, 30);
  const c = [bar(now - 2 * H - 30 * 60e3, 1, 2, 0, 1), bar(now - H - 30 * 60e3, 1, 2, 0, 1), bar(now - 30 * 60e3, 1, 2, 0, 1)];
  assert.strictEqual(A.closedBars(c, H, now).length, 2, "forming bar dropped");
  assert.strictEqual(A.closedBars(c.slice(0, 2), H, now).length, 2, "closed bars kept");
  const idx = [{ t: 0 }, { t: 1 }];
  assert.strictEqual(A.closedBars(idx, H, now).length, 2, "index-time candles untouched");
})();

(function noRepeats() {
  const t = Date.UTC(2026, 10, 23, 8);
  const list = [{ id: A.setupId("XAU", "1h", "LONG", t), inst: "XAU", tf: "1h", dir: "LONG", t, status: "open" }];
  assert.ok(A.isRepeat(list, "XAU", "1h", "LONG", t, H), "same bar repeats");
  assert.ok(A.isRepeat(list, "XAU", "1h", "LONG", t + 30 * H, H), "open trade blocks same direction");
  assert.ok(!A.isRepeat(list, "XAU", "1h", "SHORT", t + H, H), "other direction allowed");
  assert.ok(!A.isRepeat(list, "XAU", "4h", "LONG", t + H, 4 * H), "other timeframe allowed");
  assert.ok(!A.isRepeat(list, "BTC", "1h", "LONG", t + H, H), "other instrument allowed");
  list[0].status = "win"; list[0].closeT = t + 2 * H;
  assert.ok(A.isRepeat(list, "XAU", "1h", "LONG", t + 3 * H, H), "cooldown after close");
  assert.ok(!A.isRepeat(list, "XAU", "1h", "LONG", t + 20 * H, H), "free again after cooldown");
  assert.ok(!A.isRepeat([{ inst: "XAU", tf: "1h", dir: "LONG", t, status: "open", practice: true }], "XAU", "1h", "LONG", t + H, H), "practice trades ignored");
})();

(function exits() {
  const e = { dir: "LONG", entry: 100, sl: 95, tp1: 110, t: 1 };
  assert.deepStrictEqual(A.resolveExit(e, [bar(1, 100, 120, 90, 100), bar(2, 100, 111, 99, 105)]), { status: "win", closeT: 2 }, "entry bar ignored");
  assert.deepStrictEqual(A.resolveExit(e, [bar(2, 100, 112, 94, 100)]), { status: "loss", closeT: 2 }, "both on one bar = loss");
  assert.strictEqual(A.resolveExit(e, [bar(2, 100, 104, 97, 101)]), null, "still open");
})();

// A replay over a long series never produces two alerts for one setup.
(function replayDedupe() {
  const c = withTime(A.sampleCandles(2400, 0.004, 700, 11), Date.UTC(2026, 0, 1), H);
  const j = []; let opened = 0;
  for (let i = 60; i < c.length; i++) {
    const cc = c.slice(0, i + 1);
    j.forEach(e => { if (e.status === "open") { const ex = A.resolveExit(e, cc); if (ex) Object.assign(e, ex); } });
    const r = A.analyze(cc, "balanced", null);
    if (!(r.ready && r.signal)) continue;
    // Called twice per bar (like the two refresh paths in the app): the second call must be a repeat.
    for (let k = 0; k < 2; k++) {
      if (A.isRepeat(j, "XAU", "1h", r.signal.dir, cc[i].t, H)) continue;
      j.push({ id: A.setupId("XAU", "1h", r.signal.dir, cc[i].t), inst: "XAU", tf: "1h", dir: r.signal.dir, t: cc[i].t, entry: r.signal.entry, sl: r.signal.sl, tp1: r.signal.tp1, status: "open" });
      opened++;
    }
  }
  const ids = new Set(j.map(e => e.id));
  assert.strictEqual(ids.size, j.length, "unique ids");
  for (const dir of ["LONG", "SHORT"]) {
    const xs = j.filter(e => e.dir === dir).sort((a, b) => a.t - b.t);
    for (let i = 1; i < xs.length; i++) assert.ok(xs[i].t - xs[i - 1].t >= A.ALERT.cooldownBars * H, "cooldown respected");
  }
  console.log("replay: " + opened + " setups over " + c.length + " bars, no repeats");
})();

// ---------- schools ----------
const SHAPE = ["id", "ready", "bias", "strength", "title", "label", "lines", "levels"];
function checkShape(r) {
  SHAPE.forEach(k => assert.ok(k in r, r.id + " has " + k));
  assert.ok(["bull", "bear", "neutral"].includes(r.bias), r.id + " bias");
  assert.ok(r.strength >= 0 && r.strength <= 100, r.id + " strength");
  assert.ok(Array.isArray(r.lines.ar) && Array.isArray(r.lines.en) && r.lines.ar.length === r.lines.en.length, r.id + " lines");
  r.levels.forEach(l => assert.ok(isFinite(l.price), r.id + " level " + l.name));
}
(function shapesAndDeterminism() {
  for (const seed of [1, 2, 3, 5, 8]) {
    const c = withTime(A.sampleCandles(2400 + seed * 10, 0.003 + seed * 0.0004, 400, seed), Date.UTC(2026, 0, 1), H);
    for (let n = 60; n <= c.length; n += 37) {
      const all = S.all(c.slice(0, n), "balanced");
      assert.strictEqual(all.rows.length, 5);
      all.rows.forEach(checkShape);
      assert.ok(all.agree <= all.ready && all.bull + all.bear <= all.ready);
    }
    assert.deepStrictEqual(JSON.stringify(S.all(c, "balanced")), JSON.stringify(S.all(c.slice(), "balanced")), "deterministic");
  }
  // Too little data is reported as not ready, never as a bias.
  const few = A.sampleCandles(100, 0.01, 40, 1);
  S.all(few).rows.forEach(r => { assert.strictEqual(r.ready, false); assert.strictEqual(r.bias, "neutral"); });
})();

(function candlePatterns() {
  const base = Array.from({ length: 5 }, (_, i) => bar(i, 100, 101, 99, 100));
  const eng = base.concat([bar(5, 101, 101.2, 99.5, 99.8), bar(6, 99.6, 102, 99.4, 101.6)]);
  assert.strictEqual(S.candlePattern(eng).id, "bullEngulf");
  const beng = base.concat([bar(5, 99.8, 101.4, 99.7, 101.2), bar(6, 101.4, 101.6, 99, 99.5)]);
  assert.strictEqual(S.candlePattern(beng).id, "bearEngulf");
  const ham = base.concat([bar(5, 100, 100.5, 99.5, 100.2), bar(6, 100, 100.2, 97, 100.15)]);
  assert.strictEqual(S.candlePattern(ham).id, "hammer");
  const star = base.concat([bar(5, 100, 100.5, 99.5, 100.2), bar(6, 100, 103, 99.9, 99.95)]);
  assert.strictEqual(S.candlePattern(star).id, "star");
  const ins = base.concat([bar(5, 100, 102, 98, 101), bar(6, 99.5, 101, 99.3, 100.8)]);
  assert.strictEqual(S.candlePattern(ins).id, "inside");
})();

(function fibonacci() {
  const f = S.fibLevels(100, 200);
  assert.strictEqual(f.ret[0.5], 150); assert.ok(Math.abs(f.ret[0.618] - 138.2) < 1e-9); assert.ok(Math.abs(f.ext[1.618] - 261.8) < 1e-9);
  const g = S.fibLevels(200, 100); // down leg: retracements go up
  assert.ok(Math.abs(g.ret[0.618] - 161.8) < 1e-9);
})();

(function elliottRules() {
  const P = a => a.map(p => ({ p }));
  assert.ok(S.impulseOK(P([100, 110, 104, 125, 115, 130]), true), "valid impulse");
  assert.ok(!S.impulseOK(P([100, 110, 99, 125, 115, 130]), true), "wave 2 below start");
  assert.ok(!S.impulseOK(P([100, 110, 104, 125, 108, 130]), true), "wave 4 overlaps wave 1");
  assert.ok(!S.impulseOK(P([100, 120, 110, 115, 112, 140]), true), "wave 3 shortest");
  assert.ok(S.impulseOK(P([130, 120, 126, 105, 115, 100]), false), "valid down impulse");
})();

(function snrBreakout() {
  // Flat range with resistance near 110, then a strong close above it.
  const c = [];
  for (let i = 0; i < 120; i++) { const up = i % 8 < 4; const m = up ? 108 : 102; c.push(bar(i, m - 1, i % 8 === 3 ? 110 : m + 1, i % 8 === 7 ? 100 : m - 2, m)); }
  const lastC = c[c.length - 1].c;
  c.push(bar(120, lastC, 114, lastC - 0.5, 113.5));
  const r = S.snr(c);
  assert.strictEqual(r.bias, "bull", "breakout read as bullish");
})();

(function wyckoffSpring() {
  const c = [];
  for (let i = 0; i < 40; i++) c.push(bar(i, 140 - i, 141 - i, 138 - i, 139 - i));        // decline
  for (let i = 40; i < 96; i++) { const m = 101 + Math.sin(i) * 2; c.push(bar(i, m, m + 1.5, m - 1.5, m + 0.2)); } // range ~97..105
  c.push(bar(96, 100, 101, 95, 100.5)); // wick below the range, close back inside
  for (let i = 97; i < 102; i++) c.push(bar(i, 100.5, 101.5, 99.5, 101));
  const r = S.wyckoff(c);
  assert.strictEqual(r.range.kind, "acc", "range after decline = accumulation");
  assert.strictEqual(r.bias, "bull", "spring read as bullish");
})();

(function confluence() {
  const mk = b => ({ ready: 5, bias: b, rows: S.ORDER.map(id => ({ id, ready: true, bias: b })) });
  assert.strictEqual(S.confluence({ "15m": mk("bull"), "1h": mk("bull"), "4h": mk("bull") }).level, "full");
  assert.strictEqual(S.confluence({ "15m": mk("bull"), "1h": mk("bull"), "4h": mk("neutral") }).level, "partial");
  assert.strictEqual(S.confluence({ "15m": mk("bull"), "1h": mk("bear"), "4h": mk("neutral") }).level, "conflict");
  assert.strictEqual(S.confluence({ "15m": null, "1h": mk("bear") }).tfs.length, 1);
  assert.ok(S.confluence({ "15m": mk("bear"), "1h": mk("bear") }).perSchool.ict.aligned);
})();

console.log("schools + alerts tests passed");
