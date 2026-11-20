// Reads baqer_virtual_trades.csv (semicolon-separated, one row per closed trade) from the MT5 tester.
// Usage: node tools/analyze_trades.mjs path/to/baqer_virtual_trades.csv [spreadPts]
// spreadPts: cost per trade in price units (default 0.00020 = 2 pips on EURUSD). Subtracted from every trade.
import fs from "fs";

const file = process.argv[2];
const spread = Number(process.argv[3] ?? 0.0002);
if (!file) { console.log("usage: node tools/analyze_trades.mjs <csv> [spread]"); process.exit(1); }

const rows = fs.readFileSync(file, "utf8").split(/\r?\n/).slice(1).filter(Boolean)
  .map(l => l.split(";")).filter(c => c.length >= 11)
  .map(c => ({ open: c[0], close: c[1], side: c[2], entry: +c[3], stop: +c[4],
    result: c[8], tpHits: +c[9], points: +c[10] }))
  .filter(t => isFinite(t.points));

const net = rows.map(t => t.points - spread);     // after costs, in price units
const wins = net.filter(x => x > 0), losses = net.filter(x => x <= 0);
const gw = wins.reduce((a, b) => a + b, 0), gl = Math.abs(losses.reduce((a, b) => a + b, 0));
const total = net.reduce((a, b) => a + b, 0);

// max drawdown on the cumulative curve
let peak = 0, cum = 0, maxDD = 0;
for (const x of net) { cum += x; peak = Math.max(peak, cum); maxDD = Math.max(maxDD, peak - cum); }

// per-month breakdown
const byMonth = {};
rows.forEach((t, i) => { const m = t.close.slice(0, 7); byMonth[m] = (byMonth[m] || 0) + net[i]; });
const months = Object.keys(byMonth).sort();
const positiveMonths = months.filter(m => byMonth[m] > 0).length;

console.log("trades:", rows.length, "| costs per trade:", spread);
console.log("win rate:", (100 * wins.length / Math.max(1, rows.length)).toFixed(1) + "%");
console.log("net after costs:", total.toFixed(5), "(price units)");
console.log("profit factor:", gl > 0 ? (gw / gl).toFixed(2) : "inf");
console.log("max drawdown:", maxDD.toFixed(5));
console.log("positive months:", positiveMonths, "of", months.length);
months.forEach(m => console.log("  " + m + "  " + byMonth[m].toFixed(5)));

// Verdict against the criteria agreed in advance
const pass = rows.length >= 100 && total > 0 && gl > 0 && gw / gl >= 1.2 && positiveMonths / Math.max(1, months.length) >= 0.6;
console.log("\nCRITERIA (set before seeing results): >=100 trades, net > 0, profit factor >= 1.2, >=60% of months positive");
console.log("VERDICT:", pass ? "PASS" : "FAIL");
