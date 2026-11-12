import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';

// versión visible en la app: fecha de publicación + commit (p. ej. 2026.11.12-a1b2c3d)
const fecha = new Date().toISOString().slice(0, 10).replaceAll('-', '.');
let commit = 'local';
try { commit = execSync('git rev-parse --short HEAD').toString().trim(); } catch { /* sin git */ }

export default defineConfig({
  base: '/gesti-n-fabrica/',
  define: { __VERSION__: JSON.stringify(`${fecha}-${commit}`) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icono.svg'],
      manifest: {
        name: 'Gestión de fábrica',
        short_name: 'Fábrica',
        description: 'App de planta de MAPRI y CIE',
        lang: 'es',
        theme_color: '#0f1729',
        background_color: '#f4f5f7',
        display: 'standalone',
        start_url: '/gesti-n-fabrica/',
        scope: '/gesti-n-fabrica/',
        icons: [{ src: 'icono.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: { navigateFallback: 'index.html', globPatterns: ['**/*.{js,css,html,svg}'] },
    }),
  ],
});
