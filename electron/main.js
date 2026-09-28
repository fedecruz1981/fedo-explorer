// ============================================================
//  fedo~explorer — proceso principal de Electron
//  Explorador de archivos de audio con reproduccion integrada
//  Firmado: fedo soft
// ============================================================
const { app, BrowserWindow, ipcMain, protocol, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const { Readable } = require('stream')

// Extensiones de archivos de audio reconocidas por la aplicacion
const AUDIO_EXT = new Set([
  'mp3', 'wav', 'flac', 'ogg', 'oga', 'm4a', 'aac', 'aiff', 'aif',
  'wma', 'opus', 'webm', 'mka', 'mpc', 'ape', 'amr', 'caf'
])

// Mapa de extension -> tipo MIME para el streaming de reproduccion
const MIME = {
  mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac', ogg: 'audio/ogg',
  oga: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac', aiff: 'audio/aiff',
  aif: 'audio/aiff', wma: 'audio/x-ms-wma', opus: 'audio/ogg',
  webm: 'audio/webm', mka: 'audio/x-matroska', mpc: 'audio/x-musepack',
  ape: 'audio/ape', amr: 'audio/amr', caf: 'audio/x-caf'
}

// Limite de seguridad para el conteo recursivo de archivos de audio
// (evita escaneos eternos en carpetas gigantes)
const SCAN_CAP = 20000

// Indica si un nombre de archivo tiene una extension de audio valida
function isAudioFile(name) {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return false
  return AUDIO_EXT.has(name.slice(dot + 1).toLowerCase())
}

// Devuelve la extension (en minusculas) de un nombre de archivo
function extOf(name) {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

// Ordena las entradas: primero carpetas, luego archivos, alfabeticamente
function sortEntries(a, b) {
  if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
}

// Lista el contenido de un directorio: subcarpetas y archivos de audio
function listDir(dirPath) {
  return fs.promises
    .readdir(dirPath, { withFileTypes: true })
    .then((entries) => {
      const dirs = []
      const files = []
      for (const ent of entries) {
        const full = path.join(dirPath, ent.name)
        if (ent.isDirectory()) {
          dirs.push({ name: ent.name, path: full, isDirectory: true })
        } else if (ent.isFile() && isAudioFile(ent.name)) {
          files.push({
            name: ent.name,
            path: full,
            isDirectory: false,
            ext: extOf(ent.name),
            size: 0
          })
        }
      }
      dirs.sort(sortEntries)
      files.sort(sortEntries)
      return { dirs, files }
    })
}

// Cuenta archivos de audio de forma recursiva dentro de una carpeta.
// - `seen`: conjunto de rutas ya visitadas (evita ciclos con symlinks)
// - `budget`: contador de archivos escaneados (corte al superar SCAN_CAP)
function countAudio(dirPath, seen, budget) {
  if (budget.used >= SCAN_CAP) return Promise.resolve(SCAN_CAP)
  let key = dirPath
  try {
    key = fs.realpathSync(dirPath)
  } catch (_) { /* ruta inaccesible: seguimos con la original */ }
  if (seen.has(key)) return Promise.resolve(0)
  seen.add(key)
  return fs.promises
    .readdir(dirPath, { withFileTypes: true })
    .then((entries) => {
      let count = 0
      const tasks = []
      for (const ent of entries) {
        if (budget.used >= SCAN_CAP) return SCAN_CAP
        if (ent.isDirectory()) {
          tasks.push(countAudio(path.join(dirPath, ent.name), seen, budget))
        } else if (ent.isFile() && isAudioFile(ent.name)) {
          count += 1
          budget.used += 1
        }
      }
      return Promise.all(tasks).then((res) => {
        for (const r of res) count += r
        return Math.min(count, SCAN_CAP)
      })
    })
    .catch(() => 0)
}

// Protocolo `fedo-media://` para servir archivos de audio con streaming.
// Soporta peticiones HTTP Range (necesarias para seek en <audio>).
function registerMediaProtocol() {
  protocol.handle('fedo-media', async (request) => {
    try {
      const url = new URL(request.url)
      const filePath = decodeURIComponent(url.pathname.slice(1))
      const stat = await fs.promises.stat(filePath)
      if (!stat.isFile()) throw new Error('not a file')
      const size = stat.size
      const range = request.headers.get('Range')

      // Analiza el header Range y recorta el rango de bytes a servir
      let start = 0
      let end = size - 1
      let partial = false
      if (range) {
        const m = /bytes=(\d*)-(\d*)/.exec(range)
        if (m && (m[1] !== '' || m[2] !== '')) {
          partial = true
          if (m[1] !== '') start = parseInt(m[1], 10)
          if (m[2] !== '') end = Math.min(parseInt(m[2], 10), size - 1)
          if (start > end || start >= size) {
            // Rango invalido: respuesta 416 con el tamano real del archivo
            return new Response('Range not satisfiable', {
              status: 416,
              headers: { 'Content-Range': `bytes */${size}` }
            })
          }
        }
      }

      // Stream del archivo recortado, como respuesta web con MIME correcto
      const stream = fs.createReadStream(filePath, { start, end })
      const ext = extOf(filePath)
      const headers = {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Accept-Ranges': 'bytes',
        'Content-Length': String(end - start + 1)
      }
      if (partial) headers['Content-Range'] = `bytes ${start}-${end}/${size}`
      return new Response(Readable.toWeb(stream), {
        status: partial ? 206 : 200,
        headers
      })
    } catch (err) {
      return new Response('Not found', { status: 404 })
    }
  })
}

// Lee la metadata tecnica de un archivo de audio via music-metadata
// (duracion, contenedor, codec, bitrate, sample rate, canales).
// Devuelve null si el archivo no puede analizarse.
async function readAudioMeta(filePath) {
  try {
    const { parseFile } = await import('music-metadata')
    const meta = await parseFile(filePath, { duration: true })
    const f = meta.format || {}
    return {
      duration: typeof f.duration === 'number' ? f.duration : null,
      container: f.container || null,
      codec: f.codec || null,
      bitrate: f.bitrate || null,
      sampleRate: f.sampleRate || null,
      numberOfChannels: f.numberOfChannels || null
    }
  } catch (err) {
    return null
  }
}

// Raices del arbol lateral: accesos rapidos + unidades disponibles.
// En Windows enumera las letras de disco existentes (A: a Z:).
async function listRoots() {
  const home = app.getPath('home')
  const quick = [
    { name: 'Home', path: home },
    { name: 'Escritorio', path: path.join(home, 'Desktop') },
    { name: 'Documentos', path: path.join(home, 'Documents') },
    { name: 'Descargas', path: path.join(home, 'Downloads') },
    { name: 'Música', path: path.join(home, 'Music') }
  ]
  const drives = []
  if (process.platform === 'win32') {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
    await Promise.all(
      letters.map(async (l) => {
        const root = l + ':\\'
        try {
          await fs.promises.access(root)
          drives.push({ name: `Disco ${l}:`, path: root })
        } catch (_) { /* letra inexistente: se omite */ }
      })
    )
  } else {
    drives.push({ name: 'Raíz', path: '/' })
  }
  return { quick, drives }
}

// Crea la ventana principal de la aplicacion.
// En desarrollo carga el servidor de Vite; en produccion el build local.
function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 980,
    minHeight: 620,
    title: 'fedo~explorer',
    backgroundColor: '#0A0A0F',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  win.once('ready-to-show', () => win.show())

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

// Registro del esquema privilegiado ANTES de que la app este lista
// (necesario para que el protocolo funcione con fetch/stream/CSP)
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'fedo-media',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true }
  }
])

app.whenReady().then(() => {
  registerMediaProtocol()

  // Canales IPC: el renderer pide datos al filesystem a traves de estos
  ipcMain.handle('fedo:listDir', (_e, dirPath) => listDir(dirPath))
  ipcMain.handle('fedo:listRoots', () => listRoots())
  ipcMain.handle('fedo:countAudio', (_e, dirPath) =>
    countAudio(dirPath, new Set(), { used: 0 })
  )
  ipcMain.handle('fedo:readAudioMeta', (_e, filePath) => readAudioMeta(filePath))
  // El borrado envia el archivo a la papelera del sistema (no lo destruye)
  ipcMain.handle('fedo:deleteFile', async (_e, filePath) => {
    await shell.trashItem(filePath)
    return { ok: true }
  })

  createWindow()

  // Comportamiento de macOS: recrear ventana al activar el dock
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Al cerrar todas las ventanas, salir (excepto en macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
