const CACHE_NAME = "receiptkl-v5-static";
const OFFLINE_PAGE = new URL("./index.html", self.location.href).href;
const STATIC_ASSETS = [
  "./manifest.webmanifest",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png"
];

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(
        STATIC_ASSETS.map(asset =>
          fetch(asset, { cache: "reload" })
            .then(response => response.ok ? cache.put(asset, response) : null)
            .catch(() => null)
        )
      )
    )
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

async function networkFirstPage(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response && response.ok) {
      cache.put(OFFLINE_PAGE, response.clone()).catch(() => {});
    }
    return response;
  } catch (error) {
    return (await cache.match(OFFLINE_PAGE)) ||
      (await cache.match("./index.html")) ||
      new Response("Ứng dụng cần kết nối Internet lần đầu.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request).then(response => {
    if (response && response.ok && new URL(request.url).origin === self.location.origin) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  }).catch(() => cached);

  return cached || network;
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate" || url.pathname.endsWith("/index.html")) {
    event.respondWith(networkFirstPage(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});
