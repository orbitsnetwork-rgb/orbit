self.addEventListener("push", (event) => {
  let payload = { title: "8", body: "", url: "/activity" };
  try {
    const data = event.data ? event.data.json() : null;
    if (data && typeof data === "object") {
      if (typeof data.title === "string" && data.title) payload.title = data.title.slice(0, 40);
      if (typeof data.body === "string") payload.body = data.body.slice(0, 180);
      if (typeof data.url === "string" && data.url.startsWith("/")) payload.url = data.url;
    }
  } catch {
    payload.body = "";
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      data: { url: payload.url },
      tag: payload.url,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data?.url || "/activity";
  const url = new URL(path, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (!client.url.startsWith(self.location.origin)) continue;
        if ("navigate" in client) client.navigate(url);
        return client.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
