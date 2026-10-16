// Cache-first storage for everything heavy and immutable: survey data, Cesium's engine assets,
// and basemap / terrain tiles. Revisits and re-zooming come from the device instead of the
// network. The build stamps a version into the registration URL (?v=...); a new version
// starts a fresh cache and drops the old ones.
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev'
const CACHE = `farm-3d-${VERSION}`
const MAX_ENTRIES = 6000

const TILE_HOSTS = [
  'virtualearth.net', // Bing imagery (Cesium ion)
  'assets.ion.cesium.com', // Cesium World Terrain and ion imagery
  'services.arcgisonline.com', // Esri World Imagery
  'basemap.nationalmap.gov', // USGS imagery
]

function cacheable(url) {
  if (url.origin === self.location.origin) {
    return /\/(data|cesium|assets)\//.test(url.pathname)
  }
  return TILE_HOSTS.some(host => url.hostname.endsWith(host))
}

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('farm-3d-') && name !== CACHE) await caches.delete(name)
    }
    await self.clients.claim()
  })())
})

async function trim(cache) {
  const keys = await cache.keys()
  for (let i = 0; i < keys.length - MAX_ENTRIES; i++) await cache.delete(keys[i])
}

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (!cacheable(url)) return
  event.respondWith((async () => {
    const cache = await caches.open(CACHE)
    const hit = await cache.match(request)
    if (hit) return hit
    const response = await fetch(request)
    // Only keep complete, readable responses (no errors, partial ranges, or opaque replies).
    if (response.ok && response.status === 200 && response.type !== 'opaque') {
      event.waitUntil(cache.put(request, response.clone()).then(() => {
        if (Math.random() < 0.02) return trim(cache)
      }))
    }
    return response
  })())
})
