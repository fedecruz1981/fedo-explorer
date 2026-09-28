// Test de extremo a extremo del analisis de audio de fedo~explorer.
// Genera WAV reales con BPM y loudness conocidos, arranca la app de Electron
// apuntando a esa carpeta y comprueba que la tabla y el transporte muestran
// las mediciones. Es la cobertura que confirma que el decodificado real, el
// analisis y la interfaz estan conectados.

import { test, expect, _electron as electron } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Carpeta raiz del proyecto, resuelta desde la ubicacion de este archivo
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Frecuencia de los WAV generados
const RATE = 44100

// Tempo del WAV de prueba
const TEST_BPM = 120

// PRNG determinista para que el WAV de clicks sea siempre el mismo
function mulberry32(seed) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Escribe un WAV PCM de 16 bits mono a partir de un array de muestras
function writeWav(filePath, samples) {
  // Cantidad de muestras
  const n = samples.length
  // Buffer del archivo: cabecera de 44 bytes mas los datos de 16 bits
  const buf = Buffer.alloc(44 + n * 2)
  // Firma RIFF y tamaño total
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + n * 2, 4)
  // Formato WAVE con un bloque fmt
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  // PCM sin compresion
  buf.writeUInt16LE(1, 20)
  // Un solo canal
  buf.writeUInt16LE(1, 22)
  // Frecuencia de muestreo y velocidad en bytes
  buf.writeUInt32LE(RATE, 24)
  buf.writeUInt32LE(RATE * 2, 28)
  // Alineacion de bloque y bits por muestra
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  // Bloque de datos con su tamaño
  buf.write('data', 36)
  buf.writeUInt32LE(n * 2, 40)
  // Convierte cada muestra a entero de 16 bits con saturacion
  for (let i = 0; i < n; i++) {
    // Recorta al rango valido antes de convertir
    const v = Math.max(-1, Math.min(1, samples[i]))
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2)
  }
  fs.writeFileSync(filePath, buf)
}

// Seno de 1 kHz con la amplitud de pico pedida (loudness conocido)
function sineSample(seconds, peak) {
  // Cantidad de muestras del archivo
  const n = Math.round(seconds * RATE)
  // Senal resultante
  const out = new Float32Array(n)
  // Llena la senoide
  for (let i = 0; i < n; i++) {
    out[i] = peak * Math.sin((2 * Math.PI * 1000 * i) / RATE)
  }
  return out
}

// Track de clicks al tempo pedido (un thump grave mas un burst de ruido)
function clickSample(bpm, seconds) {
  // Cantidad de muestras del archivo
  const n = Math.round(seconds * RATE)
  // Senal resultante
  const out = new Float32Array(n)
  // Generador de ruido determinista
  const rand = mulberry32(7)
  // Distancia entre golpes en muestras
  const period = (60 / bpm) * RATE
  // Duracion maxima de cada golpe
  const hitLen = Math.round(0.3 * RATE)
  // El inicio de cada golpe va a un indice entero: un indice fraccionario
  // en un typed array se descarta en silencio
  for (let start = 0; start < n; start = Math.round(start + period)) {
    const len = Math.min(hitLen, n - start)
    for (let i = 0; i < len; i++) {
      const t = i / RATE
      const thump = 0.7 * Math.sin(2 * Math.PI * 70 * t) * Math.exp(-t / 0.08)
      const noise = 0.5 * (rand() * 2 - 1) * Math.exp(-t / 0.03)
      out[start + i] += thump + noise
    }
  }
  return out
}

// Crea una carpeta temporal con los dos WAV de prueba
function makeFixtureDir() {
  // Carpeta unica para esta ejecucion
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fedo-explorer-e2e-'))
  // WAV de loudness: seno puro de 1 kHz a -17 dBFS RMS
  writeWav(path.join(dir, 'loudness.wav'), sineSample(6, 0.2))
  // WAV de tempo: clicks a 120 BPM
  writeWav(path.join(dir, 'tempo.wav'), clickSample(TEST_BPM, 8))
  return dir
}

test.describe('analisis de audio (BPM y LUFS)', () => {
  test('mide el BPM y el LUFS de archivos reales y los muestra en la interfaz', async () => {
    // Carpeta con los WAV de prueba
    const dir = makeFixtureDir()
    // Arranca la app pasando la raiz del proyecto como argumento
    const app = await electron.launch({ args: [projectRoot] })
    const win = await app.firstWindow()

    try {
      // Redirige el acceso rapido Home hacia la carpeta de prueba. El puente
      // de contextBridge expone window.fedo con propiedades de solo lectura, asi
      // que el parche va en el proceso principal: se reemplaza el handler IPC y
      // se recarga la ventana para que el renderer lo vuelva a pedir.
      await app.evaluate(async ({ ipcMain }, fixture) => {
        ipcMain.removeHandler('fedo:listRoots')
        ipcMain.handle('fedo:listRoots', async () => ({
          quick: [{ name: 'Home', path: fixture }],
          drives: [],
        }))
      }, dir)
      await win.reload()
      await win.waitForLoadState('domcontentloaded')

      // La tabla debe listar los dos WAV de la carpeta
      await expect(win.locator('.table-row')).toHaveCount(2)

      // Fila del archivo de tempo
      const filaTempo = win.locator('.table-row', { hasText: 'tempo.wav' })
      await expect(filaTempo).toBeVisible()
      // Fila del archivo de loudness
      const filaLoudness = win.locator('.table-row', { hasText: 'loudness.wav' })
      await expect(filaLoudness).toBeVisible()

      // Reproducir el archivo de tempo dispara el analisis de esa fila
      await filaTempo.click()
      // El BPM medido aparece en la celda (la espera reintenta hasta el numero)
      const bpmCelda = filaTempo.locator('.cell-bpm')
      await expect(bpmCelda).toHaveText(/-?\d+(\.\d+)?/, { timeout: 30000 })
      const bpm = parseFloat((await bpmCelda.innerText()).replace(',', '.'))
      // El detector tiene que acertar el tempo del WAV sintetico
      expect(bpm).toBeGreaterThan(TEST_BPM - 2)
      expect(bpm).toBeLessThan(TEST_BPM + 2)

      // El transporte debe reflejar la misma medicion del archivo actual
      const bpmMedidor = win.locator('.meters .meter', { hasText: 'bpm' })
      await expect(bpmMedidor).toContainText(String(bpm))

      // Ahora el archivo de loudness: reproduce y espera la medicion
      await filaLoudness.click()
      const lufsCelda = filaLoudness.locator('.cell-lufs')
      await expect(lufsCelda).toHaveText(/-?\d+(\.\d+)?/, { timeout: 30000 })
      const lufs = parseFloat((await lufsCelda.innerText()).replace(',', '.'))
      // Un seno de 1 kHz a -17 dBFS RMS mide unos -17 LUFS con la curva K
      expect(lufs).toBeGreaterThan(-19.5)
      expect(lufs).toBeLessThan(-14.5)

      // Un seno puro no tiene onsets, asi que su BPM queda sin medir mientras
      // que el loudness si se calcula: confirma que el analisis es por archivo
      await expect(filaLoudness.locator('.cell-bpm')).toHaveText('—')
      // La fila ya analizada conserva su propia medicion de BPM
      await expect(filaTempo.locator('.cell-bpm')).toHaveText(String(bpm))
    } finally {
      // Cierra la app y borra la carpeta temporal
      await app.close()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
