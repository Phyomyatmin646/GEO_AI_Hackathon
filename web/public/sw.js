const CACHE_NAME = 'geoai-static-v1';
const DYNAMIC_CACHE = 'geoai-dynamic-v1';

const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icon.svg',
];

const API_ROUTES = [
  '/api/v1/market',
  '/api/v1/market-prices',
  '/api/v1/cells',
  '/api/v1/climate',
  '/api/v1/daily',
  '/api/v1/chatbot'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Intentionally not failing install if these fail
      return cache.addAll(STATIC_ASSETS).catch(console.error);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME && key !== DYNAMIC_CACHE)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip cross-origin requests for simple caching
  if (url.origin !== location.origin) {
    return;
  }

  // Network First for API Routes
  const isApiRoute = API_ROUTES.some(route => url.pathname.startsWith(route));
  
  if (isApiRoute && event.request.method === 'GET') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          return caches.open(DYNAMIC_CACHE).then((cache) => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        })
        .catch(() => {
          // If network fails, return from cache
          return caches.match(event.request);
        })
    );
    return;
  }

  // Cache First for static assets and navigation
  if (event.request.method === 'GET') {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        
        return fetch(event.request).then((networkResponse) => {
          // Do not cache non-200 or opaque responses
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }
          
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        }).catch(() => {
          // Fallback if network fails
          // If the request is for a webpage (navigation), return the cached home page
          if (event.request.mode === 'navigate') {
            return caches.match('/');
          }
          // Otherwise return a simple offline response
          return new Response('Offline Mode', { status: 503, statusText: 'Service Unavailable' });
        });
      })
    );
  }
});

// Handle Background Sync
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-geoai-alerts') {
    event.waitUntil(fetchAndNotifyAlerts());
  }
});

async function fetchAndNotifyAlerts() {
  try {
    // Assuming /api/v1/daily or equivalent returns the latest alerts
    // We make a network request to check for new alerts
    const response = await fetch('/api/v1/daily');
    if (!response.ok) return;
    
    // In a real scenario, you'd compare this to a locally cached ID to see if it's new.
    // For this demonstration, we'll trigger the notification when sync happens successfully.
    
    // Trigger the Push Notification
    if (self.registration && self.registration.showNotification) {
      await self.registration.showNotification('GeoAI Alert', {
        body: 'Network Restored: New GeoAI Alert / Warning available!',
        icon: '/icon.svg',
        badge: '/icon.svg',
        vibrate: [200, 100, 200]
      });
    }
  } catch (err) {
    console.error('Background sync fetch failed:', err);
  }
}
