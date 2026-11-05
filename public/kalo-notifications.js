// Push arrives without content. The text comes from the server, so it always reflects the current learning state.
self.addEventListener("push", event => {
  event.waitUntil((async () => {
    let text = { title: "Kalo", body: "Zeit für eine kurze Lerneinheit." };
    try {
      const response = await fetch("/api/workspace?notice=1", { credentials: "include", cache: "no-store" });
      if (response.ok) text = await response.json();
    } catch { /* Keep the general text. */ }
    await self.registration.showNotification(text.title, { body: text.body, icon: "/kalo-192.png", badge: "/kalo-192.png", tag: "kalo-review" });
  })());
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const home = new URL("/", self.location.origin).href;
    const existing = windows.find(client => client.url.startsWith(home));
    if (existing) await existing.focus();
    else await self.clients.openWindow(home);
  })());
});
