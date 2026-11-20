// Cloudflare Pages Function (project root /functions): /api/candles?symbol=XAUUSD&interval=1h
// Key is read from the TWELVE_DATA_KEY secret (never sent to the browser).
const SYMBOLS = { XAUUSD: "XAU/USD", XAGUSD: "XAG/USD", EURUSD: "EUR/USD", GBPUSD: "GBP/USD", NAS100: "NDX" };
const INTERVALS = { "15m": "15min", "1h": "1h", "4h": "4h" };
const HEADERS = { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "no-store" };

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const symbol = (url.searchParams.get("symbol") || "").toUpperCase();
  const interval = url.searchParams.get("interval") || "1h";
  const apiSymbol = SYMBOLS[symbol], apiInterval = INTERVALS[interval];
  if (!apiSymbol || !apiInterval) return new Response(JSON.stringify({ error: "unknown symbol or interval" }), { status: 400, headers: HEADERS });
  const key = context.env.TWELVE_DATA_KEY;
  if (!key) return new Response(JSON.stringify({ error: "TWELVE_DATA_KEY is not set" }), { status: 503, headers: HEADERS });
  try {
    const sizeQ = Math.min(5000, Math.max(500, parseInt(new URL(context.request.url).searchParams.get("size") || "500", 10) || 500));
    const size = sizeQ;
    const r = await fetch("https://api.twelvedata.com/time_series?symbol=" + encodeURIComponent(apiSymbol) + "&interval=" + apiInterval + "&outputsize=" + size + "&apikey=" + encodeURIComponent(key));
    const data = await r.json();
    if (!data || !Array.isArray(data.values)) return new Response(JSON.stringify({ error: data && data.message ? data.message : "no data" }), { status: 502, headers: HEADERS });
    const candles = data.values.slice().reverse().map(function (v, i) {
      const ts = Date.parse(String(v.datetime).replace(" ", "T") + "Z");
      return { t: isNaN(ts) ? i : ts, o: +v.open, h: +v.high, l: +v.low, c: +v.close };
    });
    return new Response(JSON.stringify(candles), { status: 200, headers: HEADERS });
  } catch (e) {
    return new Response(JSON.stringify({ error: "provider unreachable" }), { status: 502, headers: HEADERS });
  }
}
