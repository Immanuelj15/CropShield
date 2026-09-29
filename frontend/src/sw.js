/* AgriGuard service worker (vite-plugin-pwa injectManifest strategy).
 *
 * - Precaches the built app shell.
 * - Runtime caching is limited to static assets and PUBLIC, non user-specific GET endpoints.
 *   Authenticated per-user API responses are never cached here (the only exception is the
 *   shared advisory library, cached briefly and cleared on logout by utils/http.js).
 * - Handles Web Push (`push`) and `notificationclick`.
 */
import { clientsClaim } from 'workbox-core'
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'

self.skipWaiting()
clientsClaim()

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST || [])

// SPA navigation fallback (never for API or uploaded files)
try {
  registerRoute(
    new NavigationRoute(createHandlerBoundToURL('index.html'), {
      denylist: [/^\/api\//, /^\/uploads\//],
    })
  )
} catch (e) {
  // index.html not in the precache manifest (e.g. dev) — fall back to network navigation
}

// Static assets: app shell code, styles, fonts
registerRoute(
  ({ request }) =>
    request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'worker' ||
    request.destination === 'font',
  new CacheFirst({
    cacheName: 'agriguard-app-shell',
    plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 })],
  })
)

// Public, non user-specific reference data (no login required on the backend)
const PUBLIC_API_PATHS = [
  '/api/v1/outbreak/heatmap',
  '/api/v1/crop-recommendation/demo-scenarios',
  '/api/v1/chatbot/intents',
]
registerRoute(
  ({ url, request }) =>
    request.method === 'GET' &&
    url.origin === self.location.origin &&
    PUBLIC_API_PATHS.includes(url.pathname),
  new StaleWhileRevalidate({
    cacheName: 'agriguard-public-api',
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 6 * 60 * 60 }),
    ],
  })
)

// Advisory library: short-lived StaleWhileRevalidate so new outbreak advisories show up quickly.
// Same content for every farmer; the cache is deleted on logout (utils/http.js → logout()).
registerRoute(
  ({ url, request }) =>
    request.method === 'GET' &&
    url.origin === self.location.origin &&
    url.pathname === '/api/v1/advisories',
  new StaleWhileRevalidate({
    cacheName: 'agriguard-advisory-library',
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 5, maxAgeSeconds: 60 * 60 }),
    ],
  })
)

// ── Web Push ────────────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch (e) {
    payload = { body: event.data ? event.data.text() : '' }
  }
  const title = payload.title || 'AgriGuard alert'
  const options = {
    body: payload.body || payload.message || '',
    icon: payload.icon || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: payload.tag || undefined,
    data: { url: payload.url || (payload.data && payload.data.url) || '/farmer/today' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url === target && 'focus' in client) return client.focus()
      }
      for (const client of windows) {
        if ('navigate' in client && 'focus' in client) {
          return client.navigate(target).then((c) => (c ? c.focus() : undefined))
        }
      }
      return self.clients.openWindow ? self.clients.openWindow(target) : undefined
    })
  )
})

// Background Sync: ask open tabs to flush the offline queue (the page holds the auth token).
self.addEventListener('sync', (event) => {
  if (event.tag !== 'sync-offline-actions') return
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      windows.forEach((client) => client.postMessage({ type: 'FLUSH_OFFLINE_QUEUE' }))
    })
  )
})
