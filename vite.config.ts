import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import mkcert from 'vite-plugin-mkcert';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { VitePWA } from 'vite-plugin-pwa';

// Two modes:
//   `npm run dev`            → HTTPS dev server (mkcert)
//   `npm run build:single`   → emits a single self-contained index.html
//                              you can double-click to open.
//
// __BUILD_TIME__ is replaced at build time with the ISO timestamp of when
// `vite build` ran. Surfaces in the idle screen so we can verify which
// deployment is being tested.
//
// PWA: VitePWA generates a service worker at /sw.js (NOT the existing
// /service-worker.js kill-switch, which is a different file targeting old
// Netlify-era SWs). Browsers that previously had the kill-switch will have
// run it and unregistered by now — they're functionally indistinguishable
// from new visitors for purposes of PWA install. The PWA SW is disabled in
// `single` mode because a file:// origin can't host a service worker
// anyway.
export default defineConfig(({ mode }) => ({
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    ...(mode === 'single' ? [viteSingleFile()] : []),
    ...(mode !== 'single' ? [mkcert()] : []),
    ...(mode !== 'single'
      ? [
          VitePWA({
            // autoUpdate: ship new SW silently; the next navigation picks it
            // up. Acceptable for this app — capture sessions are short and
            // users aren't editing state we'd lose on reload.
            registerType: 'autoUpdate',
            // Don't collide with /service-worker.js (the Netlify-era
            // kill-switch). VitePWA's default is /sw.js so we leave that
            // alone but document the choice here.
            filename: 'sw.js',
            includeAssets: [
              'favicon.png',
              'icons/apple-touch-icon.png',
              'icons/arcade-192.png',
              'icons/arcade-256.png',
              'icons/arcade-384.png',
              'icons/arcade-512.png',
              'icons/arcade-maskable-192.png',
              'icons/arcade-maskable-512.png',
            ],
            manifest: {
              name: 'Genki Arcade',
              short_name: 'Arcade',
              description:
                'Plug-and-play capture card app. Optimized for ShadowCast 3, plays nice with most other UVC capture cards.',
              start_url: '/',
              scope: '/',
              display: 'standalone',
              // Coral accent for the OS-rendered title bar / splash. Background
              // matches --arc-bg so the splash screen blends into the app.
              theme_color: '#f86461',
              background_color: '#0a0a0a',
              orientation: 'any',
              categories: ['entertainment', 'utilities'],
              // Icons in size-ascending order, multiple sizes for both
               // purposes. The cabinet is the *only* icon — no monogram
               // fallbacks here, because Chrome's install-icon picker has
               // been observed to prefer 'maskable' over 'any' on some
               // platforms even on desktop, and we don't want it landing
               // on the monogram. By making the cabinet (in safe-zone
               // padded form) the maskable variant too, every selection
               // path lands on the cabinet.
               //
               // Multiple sizes give browsers exact matches for their
               // preferred dimensions: 192 (Android home), 256 (macOS
               // standard app icon), 384 (high-DPI Windows), 512 (splash
               // + high-density).
              icons: [
                {
                  src: '/icons/arcade-192.png',
                  sizes: '192x192',
                  type: 'image/png',
                  purpose: 'any',
                },
                {
                  src: '/icons/arcade-256.png',
                  sizes: '256x256',
                  type: 'image/png',
                  purpose: 'any',
                },
                {
                  src: '/icons/arcade-384.png',
                  sizes: '384x384',
                  type: 'image/png',
                  purpose: 'any',
                },
                {
                  src: '/icons/arcade-512.png',
                  sizes: '512x512',
                  type: 'image/png',
                  purpose: 'any',
                },
                // Padded variant — cabinet sits at ~75% of canvas with
                // black surround so Android's icon-shape crop (80% safe
                // zone) leaves the whole cabinet intact.
                {
                  src: '/icons/arcade-maskable-192.png',
                  sizes: '192x192',
                  type: 'image/png',
                  purpose: 'maskable',
                },
                {
                  src: '/icons/arcade-maskable-512.png',
                  sizes: '512x512',
                  type: 'image/png',
                  purpose: 'maskable',
                },
              ],
            },
            workbox: {
              // Cap individual file size at 3 MB so the sc3-cable.jpg
              // (~860 KB) and main JS bundle precache cleanly. If a future
              // asset grows past this it'll be skipped — bump the limit
              // then, don't silently miss the warning.
              maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
              // Skip outdated caches when the SW activates so old asset
              // versions don't linger in storage.
              cleanupOutdatedCaches: true,
              // Precache hashed assets (js/css/images/fonts) — these have
              // content hashes in their filenames so cache-first is safe.
              // Explicitly EXCLUDE index.html from precache: it's the
              // entry HTML and needs to be network-first (see below) so
              // a new deploy can ship updated install-prompt code,
              // analytics, etc. without users being stuck on a one-build-
              // behind cached HTML.
              globPatterns: ['**/*.{js,css,png,jpg,jpeg,svg,woff2,ico}'],
              globIgnores: ['**/index.html'],
              // NetworkFirst for navigation requests (i.e. fetches of
              // index.html when the user opens / reloads the app).
              // Online → fresh HTML wins. Offline → falls back to the
              // cached copy populated by the same handler on prior
              // visits. 3-second timeout so a flaky network doesn't
              // hang the splash.
              runtimeCaching: [
                {
                  urlPattern: ({ request }) => request.mode === 'navigate',
                  handler: 'NetworkFirst',
                  options: {
                    cacheName: 'navigation-html',
                    networkTimeoutSeconds: 3,
                    expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 30 },
                  },
                },
              ],
            },
            devOptions: {
              // Disabled in dev to avoid SW caching surprises while iterating.
              // Test the install flow against the Vercel preview build.
              enabled: false,
            },
          }),
        ]
      : []),
  ],
  server: { https: true },
  build:
    mode === 'single'
      ? {
          target: 'es2022',
          assetsInlineLimit: 100_000_000,
          cssCodeSplit: false,
          rollupOptions: { output: { inlineDynamicImports: true } },
        }
      : undefined,
}));
