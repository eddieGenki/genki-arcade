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
            includeAssets: ['favicon.png', 'icons/apple-touch-icon.png'],
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
              icons: [
                {
                  src: '/icons/pwa-192.png',
                  sizes: '192x192',
                  type: 'image/png',
                  purpose: 'any',
                },
                {
                  src: '/icons/pwa-512.png',
                  sizes: '512x512',
                  type: 'image/png',
                  purpose: 'any',
                },
                {
                  // Same source, marked maskable so Android crops safely
                  // inside the OS icon shape. The Genki monogram has enough
                  // padding around the symbol that a 10% safe-zone crop
                  // doesn't clip anything.
                  src: '/icons/pwa-512.png',
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
              // The existing /service-worker.js kill-switch isn't part of
              // the precache (it's at the origin root and intentionally
              // separate from this SW's scope).
              globPatterns: ['**/*.{js,css,html,png,jpg,jpeg,svg,woff2,ico}'],
              // SPA fallback so deep links work offline (the app is a SPA
              // so every route resolves to /index.html anyway).
              navigateFallback: '/index.html',
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
