// Service worker: shows app notifications when the server sends a Web Push (page may be closed).
importScripts("push-config.js");

self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener("push", function (e) {
  e.waitUntil((async function () {
    // If the app is open and visible, it already shows the alert itself.
    var wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (wins.some(function (c) { return c.visibilityState === "visible"; })) return;
    var items = [];
    try {
      var r = await fetch(self.PUSH_WORKER + "/latest", { cache: "no-store" });
      items = (await r.json()).items || [];
    } catch (err) {}
    if (!items.length) items = [{ id: "generic-" + Date.now(), title: "Baqer Sniper", body: "\u062a\u062d\u062f\u064a\u062b \u062c\u062f\u064a\u062f \u0641\u064a \u0627\u0644\u062a\u0637\u0628\u064a\u0642" }];
    for (const it of items.slice(-10)) {
      await self.registration.showNotification(it.title, { body: it.body, tag: it.id, icon: "icon.svg", badge: "icon.svg" });
    }
  })());
});

self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window" }).then(function (list) {
    for (const c of list) { if ("focus" in c) return c.focus(); }
    return self.clients.openWindow("/");
  }));
});
