// Bump this version on every publish — it signals existing installs to update.
const CACHE_PREFIX = `bbv-${new URL(self.registration.scope).pathname}-`;
const CACHE_NAME = `${CACHE_PREFIX}assets-v9`;
const OFFLINE_URL = new URL("offline.html", self.registration.scope).href;

// Static assets to pre-cache on install
const PRECACHE_URLS = [
  OFFLINE_URL,
  "icon/icon-192.png",
  "icon/icon-512.png",
  "icon/icon-maskable-192.png",
  "icon/icon-maskable-512.png",
  "site.webmanifest",
 ].map(url => new URL(url, self.registration.scope).href);

// ── Install: pre-cache known static assets ───────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)))
      )
    // Do NOT call skipWaiting() here — the app calls it via postMessage
    // so it can reload the page at the same time (prevents half-loaded state).
  );
});

// ── Activate: delete old caches and claim all open pages ─────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names.map((name) => (name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME ? caches.delete(name) : undefined))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ── Message: handle SKIP_WAITING from the app ─────────────────────────────────
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function isStaticAsset(url) {
  // Vite hashed JS/CSS/images — safe to cache indefinitely
  return (
    url.pathname.match(/\.(js|css|png|jpg|jpeg|webp|svg|woff2?|ttf)$/) !== null
  );
}

function isConvexApi(url) {
  return url.hostname.endsWith("convex.cloud");
}

function isAuthRequest(url) {
  return (
    url.pathname.startsWith("/auth") ||
    url.hostname.endsWith("hercules-auth.com") ||
    url.hostname.endsWith("hercules.app")
  );
}

// ── Fetch strategy ────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  let url;
  try {
    url = new URL(event.request.url);
  } catch {
    return;
  }

  // Never touch auth requests — they set cookies that must not be cached
  if (isAuthRequest(url)) return;

  // Convex WebSocket/HTTP API — always network only, never cache
  if (isConvexApi(url)) return;

  // ── Navigation (HTML page loads) ─────────────────────────────────────────
  // Try network first. On failure, serve the offline page.
  // Never cache "/" — Vite embeds changing hashed asset URLs in it.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches
          .match(OFFLINE_URL)
          .then((cached) => cached ?? new Response("Offline", { status: 503 }))
      )
    );
    return;
  }

  // ── Vite static assets (hashed JS/CSS/images) ────────────────────────────
  // Cache-first: once a hashed asset is cached it never changes.
  if (isStaticAsset(url) && url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // ── Everything else (same-origin, non-hashed) ────────────────────────────
  // Network-first, update cache on success, fall back to cache when offline.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// ── Background sync: replay queued mutations when back online ────────────────
self.addEventListener("sync", (event) => {
  if (event.tag === "bbv-sync") {
    // Convex handles its own reconnection and replay via WebSocket.
    // This sync event just notifies open windows to re-establish their
    // Convex connection in case the foreground client missed the online event.
    event.waitUntil(
      self.clients.matchAll({ type: "window" }).then((clients) => {
        clients.forEach((client) =>
          client.postMessage({ type: "BBV_SYNC_NOW" })
        );
      })
    );
  }
});

// ── Push notifications ────────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      if (!list.some((c) => c.focused)) {
        return self.registration.showNotification(data.title, data.options);
      }
    })
  );
});

// ── Notification click: focus or open the app ─────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((list) => {
      for (const client of list) {
        if ("focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow("/");
    })
  );
});
