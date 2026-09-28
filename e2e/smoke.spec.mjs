// Smoke test de arranque de fedo~explorer: comprueba que el proceso principal
// de Electron arranca con la version actual, que la ventana carga el build del
// renderer y que el puente de IPC (preload) responde. Es la red de seguridad
// frente a regressions de API al subir de version de Electron.

import { test, expect, _electron as electron } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Carpeta raiz del proyecto, resuelta desde la ubicacion de este archivo
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Arranca la aplicacion Electron y devuelve el proceso junto a su primera ventana
async function launchApp() {
  // Lanza la app pasando la raiz del proyecto como argumento
  const app = await electron.launch({ args: [projectRoot] })
  // Espera a que aparezca la primera ventana del renderer
  const win = await app.firstWindow()
  // Devuelve el proceso y la ventana ya disponible
  return { app, win }
}

test.describe('fedo~explorer', () => {
  test('arranca y carga la ventana principal', async () => {
    // Lanza la app y toma la ventana
    const { app, win } = await launchApp()

    try {
      // La ventana debe tener el titulo de la app
      await expect(win).toHaveTitle(/fedo~explorer/)

      // Espera a que el documento termine de cargar
      await win.waitForLoadState('domcontentloaded')

      // React debe haber montado algo dentro de #root
      await expect(win.locator('#root')).toBeAttached()
      // La raiz de la app no puede estar vacia
      const rootHtml = await win.locator('#root').innerHTML()
      // Confirma que React renderizo la interfaz
      expect(rootHtml.length).toBeGreaterThan(0)

      // La ventana principal debe estar creada en el proceso principal
      const windowCount = await app.evaluate(async ({ BrowserWindow }) => {
        // Devuelve cuantas ventanas existen en el proceso principal
        return BrowserWindow.getAllWindows().length
      })
      // Debe existir exactamente una ventana
      expect(windowCount).toBe(1)
    } finally {
      // Cierra siempre la app para no dejar procesos colgados
      await app.close()
    }
  })

  test('expone el puente de IPC y responde desde el main', async () => {
    // Lanza la app y toma la ventana
    const { app, win } = await launchApp()

    try {
      // Espera a que el documento termine de cargar
      await win.waitForLoadState('domcontentloaded')

      // El preload debe haber publicado window.fedo en el renderer
      const tieneBridge = await win.evaluate(() => typeof window.fedo === 'object')
      // Confirma que el puente de IPC existe
      expect(tieneBridge).toBe(true)

      // listRoots es un manejador de solo lectura: valida el viaje completo
      // preload -> ipcRenderer.invoke -> ipcMain.handle -> respuesta
      const raices = await win.evaluate(() => window.fedo.listRoots())
      // El manejador devuelve accesos rapidos y unidades
      expect(Array.isArray(raices.quick)).toBe(true)
      // Los accesos rapidos incluyen la carpeta personal
      expect(raices.quick.length).toBeGreaterThan(0)
      // Las unidades tambien se devuelven como lista
      expect(Array.isArray(raices.drives)).toBe(true)
    } finally {
      // Cierra siempre la app
      await app.close()
    }
  })

  test('no registra errores de JavaScript al arrancar', async () => {
    // Lanza la app y toma la ventana
    const { app, win } = await launchApp()

    try {
      // Recoge los errores de la pagina que aparezcan tras cargar
      const errores = []
      // Escucha los errores no capturados del renderer
      win.on('pageerror', (err) => errores.push(String(err)))

      // Fuerza una recarga para observar el arranque completo
      await win.reload()
      // Espera a que el documento termine de cargar
      await win.waitForLoadState('domcontentloaded')
      // Margen para que se dispare algun error asincrono tardio
      await win.waitForTimeout(2000)

      // Ningun error de JavaScript debe haber aparecido
      expect(errores).toEqual([])
    } finally {
      // Cierra siempre la app
      await app.close()
    }
  })
})
