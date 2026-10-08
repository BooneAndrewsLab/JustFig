/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

import pkg from './package.json' with { type: 'json' };
import { BRAND } from './src/brand.ts';

/**
 * Deployment base path, e.g. "/JustFig/" for GitHub Pages under a repo.
 * Set BASE_PATH in the environment at build time; defaults to the root.
 */
const base = process.env['BASE_PATH'] ?? '/';

/** index.html takes its title from brand.ts (the branding rule, note 01). */
function brandHtml(): Plugin {
  return {
    name: 'brand-html',
    transformIndexHtml: (html) => html.replaceAll('%BRAND_NAME%', BRAND.name),
  };
}

export default defineConfig({
  base,
  define: {
    // So a user or a bug report can say which release they are on.
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    brandHtml(),
    VitePWA({
      // Registered by hand in main.tsx, production only.
      injectRegister: null,
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: BRAND.name,
        short_name: BRAND.shortName,
        description: BRAND.description,
        theme_color: BRAND.themeColor,
        background_color: BRAND.backgroundColor,
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' }],
        file_handlers: [{ action: base, accept: { [BRAND.mime]: [BRAND.fileExt] } }],
      },
      workbox: {
        // The app shell, the fonts (ttf: text layout and PDF embedding read
        // the files themselves) and the icon library's index: manifest,
        // shards and search index (~3 MB), so browsing and search work
        // offline. The library's SVGs and sprite sheets (~80 MB) are cached
        // as they are first used instead (below).
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,webmanifest,ttf,json}'],
        globIgnores: ['lib/*/svg/**', 'lib/*/thumbs/**', 'lib/*/LICENSES/**'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: `${base}index.html`,
        runtimeCaching: [
          {
            // Versioned paths (lib/<version>/…) never change: cache first.
            // (A RegExp, not a function: workbox serialises it into the service worker.)
            urlPattern: /\/lib\/[^/]+\/(?:(?:svg|thumbs|LICENSES)\/|CREDITS\.md$)/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'icon-library',
              expiration: { maxEntries: 5000 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  worker: {
    format: 'es',
  },
  test: {
    globals: true,
    // Model / render tests run in plain Node. Component tests opt into the
    // DOM with a `// @vitest-environment jsdom` docblock.
    environment: 'node',
    // svg2pdf's "main" is a UMD build that expects a global jsPDF; tests use its ES build.
    alias: {
      'svg2pdf.js': fileURLToPath(
        new URL('./node_modules/svg2pdf.js/dist/svg2pdf.es.js', import.meta.url),
      ),
    },
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 30_000,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.{test,spec}.{ts,tsx}', 'src/test/**', 'src/main.tsx', 'src/**/*.d.ts'],
    },
  },
});
