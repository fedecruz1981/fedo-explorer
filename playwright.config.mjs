// Configuración de Playwright para el smoke test de arranque de Electron.
// Solo se necesita el binario de Electron del propio proyecto: no se
// descargan navegadores, porque el test lanza la app con _electron.launch().

import { defineConfig } from '@playwright/test'

// Configuración del smoke test: un solo proyecto, sin parallelism para que
// dos-electron no compitan por los recursos de la maquina.
export default defineConfig({
  // Limita los tests a la carpeta e2e para no capturar los *.test.js de vitest
  testDir: './e2e',
  // Solo acepta los *.e2e.mjs de la carpeta e2e
  testMatch: /.*\.e2e\.mjs/,
  // Un solo worker: la app Electron es pesada y no necesita paralelismo
  workers: 1,
  // Sin reintentos: un fallo de arranque es un fallo real, no es flakiness
  retries: 0,
  // Margen generoso: el primer arranque tras npm ci es lento
  timeout: 120000,
  expect: {
    // Margen para las aserciones de UI
    timeout: 20000
  },
  reporter: [['list']]
})
