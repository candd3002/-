// Netlify Function: returns candles for a symbol. The API key stays on the server
// (Netlify environment variable TWELVE_DATA_KEY); it is never sent to the browser.
const SYMBOLS = {
  XAUUSD: "XAU/USD", XAGUSD: "XAG/USD", EURUSD: "EUR/USD", GBPUSD: "GBP/USD", NAS100: "NDX"
};
const INTERVALS = { "15m": "15min", "1h": "1h", "4h": "4h" };
const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "cache-control": "no-store"
};

exports.handler = async function (event) {
  const q = event.queryStringParameters || {};
  const symbol = String(q.symbol || "").toUpperCase();
  const interval = String(q.interval || "1h");
  const apiSymbol = SYMBOLS[symbol];
  const apiInterval = INTERVALS[interval];
  if (!apiSymbol || !apiInterval) {
    return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: "unknown symbol or interval" }) };
  }
  const key = process.env.TWELVE_DATA_KEY;
  if (!key) {
    return { statusCode: 503, headers: JSON_HEADERS, body: JSON.stringify({ error: "TWELVE_DATA_KEY is not set" }) };
  }
  const url = "https://api.twelvedata.com/time_series?symbol=" + encodeURIComponent(apiSymbol) +
    "&interval=" + apiInterval + "&outputsize=500&apikey=" + encodeURIComponent(key);
  try {
    const r = await fetch(url);
    const data = await r.json();
    if (!data || !Array.isArray(data.values)) {
      return { statusCode: 502, headers: JSON_HEADERS, body: JSON.stringify({ error: data && data.message ? data.message : "no data" }) };
    }
    // Provider returns newest first; the app expects oldest first.
    const candles = data.values.slice().reverse().map(function (v, i) {
      const ts = Date.parse(String(v.datetime).replace(" ", "T") + "Z");
      return { t: isNaN(ts) ? i : ts, o: +v.open, h: +v.high, l: +v.low, c: +v.close };
    });
    return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify(candles) };
  } catch (e) {
    return { statusCode: 502, headers: JSON_HEADERS, body: JSON.stringify({ error: "provider unreachable" }) };
  }
};
