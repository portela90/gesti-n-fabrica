// Pruebas de pantallas: la app montada (dist) servida en local y Supabase simulado (pruebas/simulador.ts).
import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const local = '/opt/pw-browsers/chromium';
export default defineConfig({
  testDir: 'pruebas',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: 'http://localhost:4173/gesti-n-fabrica/',
    viewport: { width: 390, height: 844 },
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    serviceWorkers: 'block',
    launchOptions: existsSync(local) && !process.env.CI ? { executablePath: local } : {},
  },
  webServer: { command: 'npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173/gesti-n-fabrica/', reuseExistingServer: !process.env.CI },
});
