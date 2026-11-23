// Service worker: shows the app's notifications when the server monitor sends a Web Push (page may be closed).
// The push carries no text; the messages are read from the monitor's feed (/latest = last 40 messages).
// - every message is shown once on this device (remembered in a cache);
// - messages older than 12 hours, or older than this device's subscription, are never shown;
// - a late push still shows the entry message before the target/stop messages (oldest first);
// - every push shows at least one notification (iPhone stops delivering pushes that show nothing).
importScripts("push-config.js");

var SHOWN = "baqer-shown";

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(SHOWN).then(function (c) {
    return c.match("/since").then(function (r) { if (!r) return c.put("/since", new Response(String(Date.now()))); });
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener("push", function (e) {
  e.waitUntil((async function () {
    var cache = await caches.open(SHOWN);
    var sinceR = await cache.match("/since"), since = sinceR ? +(await sinceR.text()) || 0 : 0;
    var items = [];
    try {
      var r = await fetch(self.PUSH_WORKER + "/latest", { cache: "no-store" });
      items = (await r.json()).items || [];
    } catch (err) {}
    var now = Date.now(), shown = 0;
    var fresh = items.filter(function (it) { var at = it.at || now; return it && it.id && at >= since - 60000 && now - at <= 12 * 3600e3; })
      .sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
    for (var i = 0; i < fresh.length && shown < 8; i++) {
      var it = fresh[i], key = "/shown/" + encodeURIComponent(it.id);
      if (await cache.match(key)) continue;
      await cache.put(key, new Response("1"));
      await self.registration.showNotification(it.title, { body: it.body, tag: it.id, icon: "assets/apple-touch-icon.png", badge: "icon.svg", data: { url: "/" } });
      shown++;
    }
    if (!shown) {
      // Nothing new (already shown, or the feed could not be read): one quiet summary, replaced each time.
      await self.registration.showNotification("Baqer Sniper", { body: "تحديث جديد في التطبيق", tag: "baqer-update", renotify: false, icon: "assets/apple-touch-icon.png" });
    }
  })());
});

self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) { if ("focus" in list[i]) return list[i].focus(); }
    return self.clients.openWindow("/");
  }));
});
