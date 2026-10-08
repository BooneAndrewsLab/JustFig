/**
 * End-to-end tests (note 03): the app as built for release, served by
 * `vite preview`, in Chromium, Firefox and WebKit, since exports go through
 * each engine's own SVG rasteriser. `npm run e2e`; one engine with
 * `npx playwright test --project=chromium`.
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = 5341;
/** The site's base, as the build is given it (GitHub Pages: `/<repo>/`). */
const BASE = process.env['BASE_PATH'] ?? '/';

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${String(PORT)}${BASE}`,
    trace: 'retain-on-failure',
    acceptDownloads: true,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: `npm run build && npx vite preview --host 127.0.0.1 --port ${String(PORT)} --strictPort`,
    url: `http://127.0.0.1:${String(PORT)}${BASE}`,
    reuseExistingServer: !process.env['CI'],
    timeout: 300_000,
  },
});
