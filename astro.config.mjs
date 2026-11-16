// @ts-check
import { defineConfig } from 'astro/config'
import vue from '@astrojs/vue'
import tailwindcss from '@tailwindcss/vite'
import { AstroPWAIntegration as AstroPWA } from '@vite-pwa/astro'

// Kitroid is a fully static site served by GitHub Pages at https://kitroid.com.
// No server, no database server: every tool keeps its data on the user's device.
export default defineConfig({
  site: 'https://kitroid.com',
  output: 'static',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  integrations: [
    // Vue islands on Astro pages get PrimeVue + i18n from this entrypoint.
    vue({ appEntrypoint: '/src/vue-app' }),
    AstroPWA({
      // One service worker at the site root caches the landing page and every tool,
      // so tools open with no internet after the first visit. 'prompt' = we never
      // reload under the user's feet (e.g. mid-sale); the app shows an update banner.
      registerType: 'prompt',
      injectRegister: false,
      // Each tool ships its own manifest (public/<tool>/manifest.webmanifest) so it
      // installs as its own app with its own start_url and scope.
      manifest: false,
      // sqlite3.wasm is ~1 MB; allow it into the precache.
      maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      generateSW: {
        globPatterns: ['**/*.{html,js,mjs,css,svg,png,ico,webp,wasm,woff2,json,webmanifest}'],
        globIgnores: [
          // sqlite-wasm ships helpers for its other VFS/APIs; we only use opfs-sahpool in our own worker.
          '**/sqlite3-worker1-*.js',
          '**/sqlite3-opfs-async-proxy-*.js',
          // legacy icon-font formats; browsers use the woff2
          '**/primeicons.*.svg',
        ],
        navigateFallback: null,
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
      // Serve precached /pos/ and /en/ (directory pages) for navigations with or without the trailing slash.
      experimental: { directoryAndTrailingSlashHandler: true },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
    // sqlite-wasm loads its .wasm via import.meta.url; pre-bundling breaks that.
    optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
    worker: { format: 'es' },
  },
})
