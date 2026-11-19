// Cloudflare Pages Function: /api/news (economic calendar and forex news from Finnhub).
// Key is read from the FINNHUB_KEY secret (never sent to the browser).
const HEADERS = { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "no-store" };
function ymd(d) { return d.toISOString().slice(0, 10); }

export async function onRequest(context) {
  const key = context.env.FINNHUB_KEY;
  if (!key) return new Response(JSON.stringify({ error: "FINNHUB_KEY is not set" }), { status: 503, headers: HEADERS });
  const today = new Date(), ahead = new Date(Date.now() + 2 * 86400e3);
  try {
    const [calRes, newsRes] = await Promise.all([
      fetch("https://finnhub.io/api/v1/calendar/economic?from=" + ymd(today) + "&to=" + ymd(ahead) + "&token=" + encodeURIComponent(key)),
      fetch("https://finnhub.io/api/v1/news?category=forex&token=" + encodeURIComponent(key))
    ]);
    const cal = calRes.ok ? await calRes.json() : {};
    const news = newsRes.ok ? await newsRes.json() : [];
    const calendar = (cal.economicCalendar || []).map(function (e) {
      return { time: e.time, country: e.country, event: e.event, impact: String(e.impact || "").toLowerCase(), actual: e.actual, forecast: e.estimate, previous: e.prev, unit: e.unit || "" };
    });
    const items = (Array.isArray(news) ? news : []).slice(0, 30).map(function (n) {
      return { time: n.datetime, headline: n.headline, source: n.source, url: n.url, summary: n.summary };
    });
    return new Response(JSON.stringify({ calendar: calendar, news: items }), { status: 200, headers: HEADERS });
  } catch (e) {
    return new Response(JSON.stringify({ error: "news provider unreachable" }), { status: 502, headers: HEADERS });
  }
}
