// Cloudflare Pages Function: /api/news (economic calendar and forex news).
// Keys are read from secrets (FINNHUB_KEY, FMP_KEY) and never sent to the browser.
const HEADERS = { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "no-store" };
const CACHE_KEY = "https://baqer-cache.internal/calendar-v2";
function ymd(d) { return d.toISOString().slice(0, 10); }
// FMP returns "YYYY-MM-DD HH:MM:SS" in UTC; make it a proper ISO time so every browser parses it.
function isoUtc(s) {
  const v = String(s || "");
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v) ? v.replace(" ", "T") + "Z" : v;
}
function inWindow(day, from, to) { return day >= from && day <= to; }

async function cachedGet(fn) {
  let cache = null;
  try { cache = caches.default; } catch (e) { cache = null; }
  try {
    if (cache) { const hit = await cache.match(CACHE_KEY); if (hit) return { rows: await hit.json(), src: "cached" }; }
  } catch (e) {}
  const got = await fn();
  if (got.rows && cache) {
    try { await cache.put(CACHE_KEY, new Response(JSON.stringify(got.rows), { headers: { "cache-control": "max-age=3600" } })); } catch (e) {}
  }
  return got;
}

export async function onRequest(context) {
  const env = context.env;
  const key = env.FINNHUB_KEY;
  if (!key) return new Response(JSON.stringify({ error: "FINNHUB_KEY is not set" }), { status: 503, headers: HEADERS });
  const today = new Date(), ahead = new Date(Date.now() + 2 * 86400e3);
  const from = ymd(today), to = ymd(ahead);
  try {
    const [calRes, newsRes] = await Promise.all([
      fetch("https://finnhub.io/api/v1/calendar/economic?from=" + from + "&to=" + to + "&token=" + encodeURIComponent(key)),
      fetch("https://finnhub.io/api/v1/news?category=forex&token=" + encodeURIComponent(key))
    ]);
    const cal = calRes.ok ? await calRes.json() : {};
    const news = newsRes.ok ? await newsRes.json() : [];
    let calendar = (cal.economicCalendar || []).map(function (e) {
      return { time: e.time, country: e.country, event: e.event, impact: String(e.impact || "").toLowerCase(), actual: e.actual, forecast: e.estimate, previous: e.prev, unit: e.unit || "" };
    });
    let calSource = "finnhub";

    // Fallback 1: Financial Modeling Prep (free key).
    if (!calendar.length && env.FMP_KEY) {
      try {
        const got = await cachedGet(async function () {
          const r = await fetch("https://financialmodelingprep.com/stable/economic-calendar?from=" + from + "&to=" + to + "&apikey=" + encodeURIComponent(env.FMP_KEY));
          calSource = "fmp (HTTP " + r.status + ")";
          const j = r.ok ? await r.json() : null;
          return { rows: Array.isArray(j) ? j : null };
        });
        if (got.rows) {
          calendar = got.rows.filter(function (e) { return inWindow(String(e.date || "").slice(0, 10), from, to); })
            .map(function (e) { return { time: isoUtc(e.date), country: e.country, event: e.event, impact: String(e.impact || "").toLowerCase(), actual: e.actual ?? null, forecast: e.estimate ?? null, previous: e.previous ?? null, unit: e.unit || "" }; });
          calSource = got.src === "cached" ? "fmp (cached)" : "fmp";
        }
      } catch (e) { calSource = "fmp (error)"; }
    }

    // Fallback 2: Faireconomy weekly feed (free, no key, rate limited).
    if (!calendar.length) {
      try {
        const got = await cachedGet(async function () {
          const r = await fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.json");
          calSource = "faireconomy (HTTP " + r.status + ")";
          return { rows: r.ok ? await r.json() : null };
        });
        if (got.rows) {
          calendar = got.rows.filter(function (e) { return inWindow(String(e.date || "").slice(0, 10), from, to); })
            .map(function (e) { return { time: e.date, country: e.country, event: e.title, impact: String(e.impact || "").toLowerCase(), actual: e.actual ?? null, forecast: e.forecast || null, previous: e.previous || null, unit: "" }; });
        }
      } catch (e) { calSource = "faireconomy (error)"; }
    }

    const items = (Array.isArray(news) ? news : []).slice(0, 30).map(function (n) {
      return { time: n.datetime, headline: n.headline, source: n.source, url: n.url, summary: n.summary };
    });
    return new Response(JSON.stringify({ calendar: calendar, calendarSource: calSource, news: items }), { status: 200, headers: HEADERS });
  } catch (e) {
    return new Response(JSON.stringify({ error: "news provider unreachable" }), { status: 502, headers: HEADERS });
  }
}
