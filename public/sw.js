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

// 16: офлайн-оболонка. Лише навігація: спершу мережа, без мережі — збережена сторінка «Немає зв’язку».
// Дані світу (_serverFn, /api) ніколи не кешуються. Web push-ключів тут немає.
const SHELL = "orbit-shell-v2";
const SHELL_FILES = ["/offline.html", "/favicon.svg", "/favicon-32.png", "/icon-192.png", "/apple-touch-icon.png", "/manifest.webmanifest"];
// Ніколи не кешуємо: функції сервера, API, вхід/пошту/сесії, сторінку власника.
const NEVER = [/^\/_serverFn\//, /^\/api\//, /^\/auth/, /^\/owner/, /^\/__grok\//];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name.startsWith("orbit-shell-") && name !== SHELL).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (NEVER.some((re) => re.test(url.pathname))) return; // мережа напряму, без кешу SW
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
    return;
  }
  if (SHELL_FILES.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((hit) => hit || fetch(request)));
  }
});
