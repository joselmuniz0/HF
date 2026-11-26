import fs from "node:fs";
import path from "node:path";

const swPath = "app-source/src/public/sw.js";
const build = String(process.env.GITHUB_SHA || "local").slice(0, 12);

const serviceWorker = `/* HF_SW_NETWORK_FIRST_HTML */
const BUILD = ${JSON.stringify(build)};
const CACHE = "hfcoach-" + BUILD;
const INDEX_URL = new URL("./index.html", self.registration.scope).href;
const STATIC_EXT = /\\.(?:js|css|png|jpe?g|webp|svg|woff2?|ttf|ico|wasm)$/i;

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(new Request(INDEX_URL, { cache: "reload" }));
      if (response.ok) await cache.put(INDEX_URL, response.clone());
    } catch (_) {
      // Install remains possible when the network is unavailable.
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith("hfcoach-") && name !== CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isHtmlNavigation = request.mode === "navigate" || /\\/index\\.html$/i.test(url.pathname);
  if (isHtmlNavigation) {
    event.respondWith((async () => {
      try {
        const networkRequest = new Request(request, { cache: "no-store" });
        const response = await fetch(networkRequest);
        if (response && response.ok) {
          const cache = await caches.open(CACHE);
          await cache.put(INDEX_URL, response.clone());
          if (request.url !== INDEX_URL) await cache.put(request, response.clone());
        }
        return response;
      } catch (_) {
        const cache = await caches.open(CACHE);
        return (await cache.match(request)) || (await cache.match(INDEX_URL)) || new Response("HF Coach está sin conexión y no hay una versión guardada.", {
          status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
      }
    })());
    return;
  }

  if (STATIC_EXT.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response && response.ok) await cache.put(request, response.clone());
      return response;
    })());
  }
});
`;

if (process.argv[2] === "--validate") {
  const target = process.argv[3];
  if (!target) throw new Error("Uso: node scripts/patch-android-service-worker.mjs --validate <sw.js>");
  const sw = fs.readFileSync(target, "utf8");
  const checks = [
    ["HF_SW_NETWORK_FIRST_HTML", "network-first marker"],
    ["request.mode === \"navigate\"", "navigation interception"],
    ['new Request(request, { cache: "no-store" })', "HTTP cache bypass"],
    ["fetch(networkRequest)", "network-first request"],
    ["cache.match(INDEX_URL)", "offline index fallback"],
    ["startsWith(\"hfcoach-\")", "versioned cache cleanup"],
    ["STATIC_EXT.test(url.pathname)", "static cache-first"],
  ];
  for (const [needle, label] of checks) if (!sw.includes(needle)) throw new Error("Service worker validation failed: missing " + label + " in " + target);
  console.log("PASS: HTML Network First, offline fallback, versioned cache cleanup and static Cache First: " + target);
} else {
  fs.mkdirSync(path.dirname(swPath), { recursive: true });
  fs.writeFileSync(swPath, serviceWorker, "utf8");
  console.log("Service worker replaced with Network First for HTML and Cache First for static assets; cache build=" + build);
}
