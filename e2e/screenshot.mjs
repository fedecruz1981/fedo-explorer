// Genera la captura del README. Arranca la app con una biblioteca de WAV
// sinteticos, deja que la tabla y el transporte muestren mediciones reales
// y guarda el PNG en docs/. Se regenera con npm run captura, asi el README
// nunca muestra una imagen vieja de la interfaz.

import { _electron as electron } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Carpeta raiz del proyecto, resuelta desde la ubicacion de este archivo
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// Destino de la captura
const outFile = path.join(projectRoot, 'docs', 'captura.png')

// Frecuencia de los WAV generados
const RATE = 44100

// PRNG determinista para que la biblioteca sea siempre la misma
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
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, buf)
}

// Seno de una frecuencia con la amplitud de pico pedida
function sineSample(seconds, freq, peak) {
  // Cantidad de muestras del archivo
  const n = Math.round(seconds * RATE)
  // Factor de fase por muestra
  const step = (2 * Math.PI * freq) / RATE
  // Array de muestras inicializado en cero
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = peak * Math.sin(step * i)
  return out
}

// Golpes percusivos al tempo pedido, con cuerpo grave y ruido de ataque
function clickSample(seconds, bpm, seed) {
  // Generador de ruido reproducible
  const rand = mulberry32(seed)
  // Cantidad de muestras del archivo
  const n = Math.round(seconds * RATE)
  // Array de muestras inicializado en cero
  const out = new Float32Array(n)
  // Periodo entre golpes, en muestras
  const period = (60 / bpm) * RATE
  // Duracion de cada golpe: ataque corto con caida exponencial
  const hitLen = Math.round(0.1 * RATE)
  for (let start = 0; start < n; start = Math.round(start + period)) {
    // Recorta el ultimo golpe si se pasa del final del archivo
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

// Ruido filtrado de un polo para que tenga cuerpo grave
function noiseSample(seconds, peak, seed) {
  // Generador de ruido reproducible
  const rand = mulberry32(seed)
  // Cantidad de muestras del archivo
  const n = Math.round(seconds * RATE)
  // Array de muestras inicializado en cero
  const out = new Float32Array(n)
  // Estado del filtro
  let last = 0
  for (let i = 0; i < n; i++) {
    const white = rand() * 2 - 1
    // Mezcla del ruido con el estado anterior: atenua los agudos
    last = 0.98 * last + 0.02 * white
    out[i] = peak * last * 6
  }
  return out
}

// Crea la biblioteca de demo que se ve en la captura. Los nombres y las
// carpetas imitan una sesion real, pero el audio es sintetico: no se
// distribuye material de terceros en el repositorio. Va en Music con un
// nombre de sesion para que la ruta del panel lateral se vea creible en el
// README, y se borra al terminar.
function makeFixtureDir() {
  // Carpeta de la sesion de demo
  const dir = path.join(os.homedir(), 'Music', 'Sesion 12-08')
  // Empieza de cero si una corrida anterior dejo la carpeta a medias
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  // Archivos de la carpeta principal, con BPM y loudness distintos entre si
  const raiz = [
    ['1-ensayo-general.wav', clickSample(24, 120, 11)],
    ['2-bajo-loop.wav', clickSample(16, 92, 23)],
    ['3-pad-cuadra.wav', sineSample(14, 220, 0.14)],
    ['4-ruido-blanco.wav', noiseSample(12, 0.5, 37)],
    ['5-intro-128.wav', clickSample(10, 128, 41)],
  ]
  for (const [name, samples] of raiz) writeWav(path.join(dir, name), samples)
  // Subcarpetas con dos o tres archivos cada una
  const bancos = [
    ['bajo-01.wav', clickSample(8, 100, 53)],
    ['pad-01.wav', sineSample(8, 110, 0.2)],
    ['plano-01.wav', noiseSample(6, 0.4, 59)],
  ]
  for (const [name, samples] of bancos) writeWav(path.join(dir, 'Bancos', name), samples)
  const imports = [['import-01.wav', clickSample(7, 128, 61)]]
  for (const [name, samples] of imports) writeWav(path.join(dir, 'Imports', name), samples)
  return dir
}

// Espera a que un locator tenga texto numerico, con reintentos
async function waitForNumber(locator, timeout) {
  // Instante limite
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    // Texto actual de la celda
    const text = (await locator.innerText().catch(() => '')).trim()
    if (/-?\d+(\.\d+)?/.test(text)) return text
    // Espera corta antes de volver a intentar
    await new Promise((r) => setTimeout(r, 250))
  }
  return null
}

async function main() {
  // Carpeta con la biblioteca de demo
  const dir = makeFixtureDir()
  // Arranca la app pasando la raiz del proyecto como argumento
  const app = await electron.launch({ args: [projectRoot] })
  const win = await app.firstWindow()

  try {
    // Redirige los accesos rapidos hacia la biblioteca de demo. El puente de
    // contextBridge expone window.fedo con propiedades de solo lectura, asi que
    // el parche va en el proceso principal y luego se recarga la ventana. El
    // nombre 'Home' es obligatorio: la app selecciona esa raiz al arrancar.
    await app.evaluate(async ({ ipcMain }, fixture) => {
      ipcMain.removeHandler('fedo:listRoots')
      ipcMain.handle('fedo:listRoots', async () => ({
        quick: [
          { name: 'Home', path: fixture },
          { name: 'Bancos', path: `${fixture}\\Bancos` },
          { name: 'Imports', path: `${fixture}\\Imports` },
        ],
        drives: [],
      }))
    }, dir)
    await win.reload()
    await win.waitForLoadState('domcontentloaded')

    // Espera a que la tabla liste los WAV de la raiz
    const filas = win.locator('.table-row')
    await filas.first().waitFor({ timeout: 30000 })
    const total = await filas.count()
    if (total < 5) throw new Error(`se esperaban 5 filas y aparecieron ${total}`)

    // Reproducir un archivo dispara su analisis. Se analizan tres para que la
    // tabla muestre BPM y LUFS en varias filas, y se deja el ultimo sounding.
    for (const nombre of ['3-pad-cuadra.wav', '2-bajo-loop.wav', '1-ensayo-general.wav']) {
      const fila = filas.filter({ hasText: nombre })
      await fila.click()
      // Espera a que la medicion de la fila deje de ser un guion
      await waitForNumber(fila.locator('.cell-bpm'), 30000)
      await waitForNumber(fila.locator('.cell-lufs'), 30000)
    }

    // Comprueba que el transporte muestra la medicion del archivo actual
    const bpm = await waitForNumber(win.locator('.meters .meter', { hasText: 'bpm' }), 15000)
    if (!bpm) throw new Error('el BPM no aparecio en el transporte')
    console.log(`transporte: ${bpm} BPM`)

    // Deja asentar el waveform y las barras antes de capturar
    await win.waitForTimeout(1200)

    // Guarda la captura en docs/
    fs.mkdirSync(path.dirname(outFile), { recursive: true })
    await win.screenshot({ path: outFile })
    const kb = (fs.statSync(outFile).size / 1024).toFixed(0)
    console.log(`captura escrita en ${path.relative(projectRoot, outFile)} (${kb} KB)`)
  } finally {
    // Cierra la app y borra la carpeta temporal
    await app.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

export { makeFixtureDir, main }

// La captura solo corre cuando este archivo se invoca directamente. Si otro
// script lo importa para inspeccionar el estado de la interfaz, no debe
// arrancar la app por los ojos de quien importa.
const invocadoDirecto =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invocadoDirecto) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
