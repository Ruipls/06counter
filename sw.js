// Update this version for every release. All runtime dependencies are local.
const CACHE_NAME = "counter-checkout-v3-ledger-delete-20260912";
const BASE = new URL("./", self.location.href);
const ASSETS = [
  "",
  "index.html",
  "legacy.html",
  "manifest.json",
  "icon-192.svg",
  "icon-512.svg",
  "icon-counter.svg",
  "icon-grid.svg",
  "icon-stall.svg",
  "src/styles.css",
  "src/app.mjs",
  "src/model.mjs",
  "src/utils.mjs",
  "src/import.mjs",
  "src/import-detect.mjs",
  "src/import-panel.mjs",
  "src/report.mjs",
  "vendor/xlsx.full.min.js",
].map((path) => new URL(path, BASE).href);
self.addEventListener("install", (event) =>
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)),
  ),
);
// Let an existing checkout finish before the waiting worker takes over.
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("counter-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname))
    return;
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      return fetch(event.request);
    }),
  );
});
