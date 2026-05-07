// Kill-switch service worker.
//
// arcade.genkithings.com used to be hosted on Netlify by a previous developer
// whose app registered a service worker that aggressively cached the entire
// UI. After moving to Vercel, those old service workers were still installed
// in returning users' browsers, intercepting every request and serving stale
// HTML / JS — which is why the new design appeared not to load.
//
// This SW supersedes the old one. On activation it clears all caches,
// unregisters itself, and reloads any open tabs. Once it has run, the user's
// browser will no longer have a service worker for this origin and will load
// the live Vercel deploy normally.
//
// We can leave this file in place indefinitely; new users won't even register
// it (the new app doesn't call navigator.serviceWorker.register()), so it
// only fires for stragglers from the old build.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (e) {
      // ignore cache delete errors
    }
    try {
      await self.registration.unregister();
    } catch (e) {
      // ignore
    }
    try {
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((client) => {
        // navigate() reloads the controlled page bypassing any stale SW
        if ('navigate' in client) client.navigate(client.url);
      });
    } catch (e) {
      // ignore
    }
  })());
});

// Pass through every fetch (no caching). Ensures users on the old SW that
// somehow doesn't activate yet still see live content.
self.addEventListener('fetch', (event) => {
  // Let the network handle it.
});
