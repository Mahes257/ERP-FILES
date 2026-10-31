import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  // Read .env (including non-VITE_ variables like ERP_PROXY_TARGET) so the dev
  // proxy target is configurable without hardcoding the backend origin here.
  const env = loadEnv(mode, '.', '')
  const proxyTarget = env.ERP_PROXY_TARGET || 'http://localhost:8080'

  return {
    plugins: [
      react(),
      tailwindcss(),
    ],
    optimizeDeps: {
      include: ['leaflet', 'react-leaflet'],
    },
    build: {
      // Split heavy libraries that are genuinely shared or lazily imported into
      // their own long-lived chunks. Route-level code splitting already keeps
      // modules apart; these groups only prevent one route's vendor payload
      // from being pulled into the initial entry chunk (and let the browser
      // cache them across deployments). Keep this list tied to real imports in
      // src — do not add a package the app does not use.
      rollupOptions: {
        output: {
          // Vite 8 / rolldown requires the function form (the object form is
          // rejected). Matching is by package path, so it stays tied to the
          // dependencies this app actually imports.
          manualChunks(id) {
            const path = id.replace(/\\/g, '/');
            if (!path.includes('node_modules')) return undefined;
            if (path.includes('/leaflet/') || path.includes('/react-leaflet/')) return 'vendor-maps';
            if (path.includes('/jspdf/') || path.includes('/jspdf-autotable/') ||
                path.includes('/html2canvas-pro/')) return 'vendor-pdf';
            if (path.includes('/xlsx/')) return 'vendor-xlsx';
            if (path.includes('/@stomp/')) return 'vendor-ws';
            if (path.includes('/react-router') || path.includes('/react-router-dom/') ||
                path.includes('/react-dom/') || path.includes('/react/') ||
                path.includes('/scheduler/')) return 'vendor-react';
            return undefined;
          },
        },
      },
    },
    server: {
      // Standard development port. strictPort makes Vite fail fast when 5173 is
      // taken instead of silently moving to 5174 — the backend CORS allow-list
      // and every documented URL expect 5173.
      port: 5173,
      strictPort: true,
      allowedHosts: true,
      // Same-origin API proxying: the frontend calls /v1 (see src/api/axiosInstance.js),
      // which is forwarded to the Spring Boot backend. This makes localhost and the
      // ngrok public URL behave identically from any device (no hardcoded localhost:8080
      // in browser code, no CORS dependency). Target comes from ERP_PROXY_TARGET.
      proxy: {
        '/v1': {
          target: proxyTarget,
          changeOrigin: true,
          ws: true,
        },
      },
      // Never let the browser cache dev assets so the latest bundle is always served
      // on localhost and through ngrok after every HMR/rebuild.
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  }
})
