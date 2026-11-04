self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const home = new URL("/", self.location.origin).href;
    const existing = windows.find(client => client.url === home);
    if (existing) await existing.focus();
    else await self.clients.openWindow(home);
  })());
});
