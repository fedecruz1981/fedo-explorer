// ============================================================
//  fedo~explorer — preload de Electron
//  Puente seguro entre el renderer (React) y el proceso principal
//  Firmado: fedo soft
// ============================================================
const { contextBridge, ipcRenderer } = require('electron')

// Expone la API `window.fedo` al renderer de forma aislada.
// Cada metodo invoca un canal IPC del proceso principal.
contextBridge.exposeInMainWorld('fedo', {
  // Lista carpetas y archivos de audio de un directorio
  listDir: (dirPath) => ipcRenderer.invoke('fedo:listDir', dirPath),
  // Devuelve accesos rapidos y discos disponibles
  listRoots: () => ipcRenderer.invoke('fedo:listRoots'),
  // Cuenta archivos de audio de forma recursiva
  countAudio: (dirPath) => ipcRenderer.invoke('fedo:countAudio', dirPath),
  // Lee la metadata tecnica de un archivo (duracion, formato, etc.)
  readAudioMeta: (filePath) => ipcRenderer.invoke('fedo:readAudioMeta', filePath),
  // Mueve un archivo a la papelera del sistema
  deleteFile: (filePath) => ipcRenderer.invoke('fedo:deleteFile', filePath),
  // Construye la URL del protocolo de streaming para reproducir
  mediaUrl: (filePath) => 'fedo-media://file/' + encodeURIComponent(filePath)
})
