// Netlify Function: economic calendar and market news for traders.
// Source: Finnhub (needs FINNHUB_KEY set in Netlify environment variables; never sent to the browser).
const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "cache-control": "no-store"
};
function ymd(d) { return d.toISOString().slice(0, 10); }

exports.handler = async function () {
  const key = process.env.FINNHUB_KEY;
  if (!key) {
    return { statusCode: 503, headers: JSON_HEADERS, body: JSON.stringify({ error: "FINNHUB_KEY is not set" }) };
  }
  const today = new Date();
  const ahead = new Date(Date.now() + 2 * 86400e3);
  try {
    const [calRes, newsRes] = await Promise.all([
      fetch("https://finnhub.io/api/v1/calendar/economic?from=" + ymd(today) + "&to=" + ymd(ahead) + "&token=" + encodeURIComponent(key)),
      fetch("https://finnhub.io/api/v1/news?category=forex&token=" + encodeURIComponent(key))
    ]);
    const cal = calRes.ok ? await calRes.json() : {};
    const news = newsRes.ok ? await newsRes.json() : [];
    const events = (cal.economicCalendar || []).map(function (e) {
      return { time: e.time, country: e.country, event: e.event, impact: String(e.impact || "").toLowerCase(),
               actual: e.actual, forecast: e.estimate, previous: e.prev, unit: e.unit || "" };
    });
    const items = (Array.isArray(news) ? news : []).slice(0, 30).map(function (n) {
      return { time: n.datetime, headline: n.headline, source: n.source, url: n.url, summary: n.summary };
    });
    return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({ calendar: events, news: items }) };
  } catch (e) {
    return { statusCode: 502, headers: JSON_HEADERS, body: JSON.stringify({ error: "news provider unreachable" }) };
  }
};
