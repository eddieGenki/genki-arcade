import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import mkcert from 'vite-plugin-mkcert';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Two modes:
//   `npm run dev`            → HTTPS dev server (mkcert)
//   `npm run build:single`   → emits a single self-contained index.html
//                              you can double-click to open.
//
// __BUILD_TIME__ is replaced at build time with the ISO timestamp of when
// `vite build` ran. Surfaces in the idle screen so we can verify which
// deployment is being tested.
export default defineConfig(({ mode }) => ({
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    ...(mode === 'single' ? [viteSingleFile()] : []),
    ...(mode !== 'single' ? [mkcert()] : []),
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
