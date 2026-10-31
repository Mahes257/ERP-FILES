/**
 * vitest.config.js
 * ------------------------------------------------------------------
 * Unit-test configuration for the tests that live NEXT TO the code they
 * cover (src/**\/*.test.js). Those modules are browser-side stores and
 * services that read and write `localStorage`, so the suite runs in a
 * jsdom environment instead of the bare node environment — without a DOM
 * every store silently degrades to "Failed to persist …" and the suites
 * that seed state through `localStorage` cannot run at all.
 *
 * Scope is deliberately limited to src/**: the repository also keeps a
 * legacy suite in tests/ that is written for node's built-in test runner
 * (`npm run test:node`). Running those files through vitest as well would
 * execute them under a second framework, so they are excluded here.
 *
 * VITE_PURCHASE_DATA_MODE is pinned to "local" for the same reason: the
 * Purchase services route every call through `withFallback` (see
 * src/purchase/services/api-client.js) and only reach for the REST API
 * when the mode is "api". The suites drive the local/storage-backed
 * facades (mockPurchaseOrderService, ordersStore, localStorage …), so
 * leaving the module default ("api") makes them fire real HTTP requests
 * that no test environment serves.
 * ------------------------------------------------------------------
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{js,jsx}'],
    exclude: ['node_modules/**', 'dist/**', 'build/**', 'tests/**'],
    clearMocks: true,
    env: {
      VITE_PURCHASE_DATA_MODE: 'local'
    }
  }
});
