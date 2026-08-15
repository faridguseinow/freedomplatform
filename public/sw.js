const CACHE_NAME = 'freedom-platform-shell-v4'
const APP_SHELL = [
  '/',
  '/platform',
  '/index.html',
  '/manifest.webmanifest',
  '/pwa/freedom-platform.svg',
  '/pwa/freedom-platform-180.png',
  '/pwa/freedom-platform-192.png',
  '/pwa/freedom-platform-512.png',
  '/pwa/the-league.svg',
]
const STATIC_PATH_PREFIXES = ['/assets/', '/pwa/']

const isStaticSameOriginRequest = (request) => {
  const url = new URL(request.url)

  if (url.origin !== self.location.origin) return false
  if (url.pathname === '/manifest.webmanifest') return true

  return STATIC_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => undefined),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      ),
  )
  self.clients.claim()
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const request = event.request

  if (request.method !== 'GET') return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) return response
          return caches.match('/index.html').then((cached) => cached ?? response)
        })
        .catch(() => caches.match('/index.html').then((response) => response ?? Response.error())),
    )
    return
  }

  if (!isStaticSameOriginRequest(request)) return

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached

      return fetch(request)
        .then((response) => {
          if (!response.ok || response.type === 'opaque') return response

          const responseClone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone))
          return response
        })
        .catch(() => cached ?? Response.error())
    }),
  )
})
