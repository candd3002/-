// Cloudflare Pages Function: /api/news (economic calendar and forex news; Finnhub with a free calendar fallback).
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
    let calendar = (cal.economicCalendar || []).map(function (e) {
      return { time: e.time, country: e.country, event: e.event, impact: String(e.impact || "").toLowerCase(), actual: e.actual, forecast: e.estimate, previous: e.prev, unit: e.unit || "" };
    });
    // Free fallback (no key): weekly economic calendar used when Finnhub returns nothing on the free plan.
    let calSource = "finnhub";
    if (!calendar.length) {
      try {
        const cache = caches.default;
        const ckey = new Request("https://baqer-cache.internal/ff-calendar-v1");
        let rows = null;
        const hit = await cache.match(ckey);
        if (hit) { rows = await hit.json(); calSource = "faireconomy (cached)"; }
        else {
          const ffRes = await fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.json");
          calSource = "faireconomy (HTTP " + ffRes.status + ")";
          if (ffRes.ok) {
            rows = await ffRes.json();
            await cache.put(ckey, new Response(JSON.stringify(rows), { headers: { "cache-control": "max-age=3600" } }));
          }
        }
        const today0 = ymd(today);
        calendar = (Array.isArray(rows) ? rows : []).filter(function (e) {
          const d = String(e.date || "").slice(0, 10);
          return d >= today0 && d <= ymd(ahead);
        }).map(function (e) {
          return { time: e.date, country: e.country, event: e.title, impact: String(e.impact || "").toLowerCase(), actual: e.actual ?? null, forecast: e.forecast || null, previous: e.previous || null, unit: "" };
        });
      } catch (err) { calendar = []; calSource = "faireconomy (error)"; }
    }
    const items = (Array.isArray(news) ? news : []).slice(0, 30).map(function (n) {
      return { time: n.datetime, headline: n.headline, source: n.source, url: n.url, summary: n.summary };
    });
    return new Response(JSON.stringify({ calendar: calendar, calendarSource: calSource, news: items }), { status: 200, headers: HEADERS });
  } catch (e) {
    return new Response(JSON.stringify({ error: "news provider unreachable" }), { status: 502, headers: HEADERS });
  }
}
