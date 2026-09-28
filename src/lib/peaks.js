// ============================================================
//  fedo~explorer — calculo del waveform (picos) de un archivo
//  Decodifica el buffer de audio y reduce las muestras a bins
//  Firmado: fedo soft
// ============================================================

// Reduce un AudioBuffer a `bins` pares {min, max} por bin.
// Estos picos alimentan el canvas del waveform en el transporte.
export function computePeaks(buffer, bins) {
  const channels = buffer.numberOfChannels
  const data = []
  for (let c = 0; c < channels; c++) data.push(buffer.getChannelData(c))
  const length = buffer.length
  const step = Math.max(1, Math.floor(length / bins))
  const peaks = new Array(bins)
  for (let i = 0; i < bins; i++) {
    const start = i * step
    const end = Math.min(start + step, length)
    let min = 1
    let max = -1
    for (let j = start; j < end; j++) {
      for (let c = 0; c < channels; c++) {
        const v = data[c][j]
        if (v < min) min = v
        if (v > max) max = v
      }
    }
    peaks[i] = { min, max }
  }
  return peaks
}

// Pide los bytes del archivo al proceso principal (via IPC) y lo decodifica
// con Web Audio API. El buffer completo permite analizar el audio una sola
// vez: de aqui salen los picos, el BPM y el LUFS.
export async function decodeBuffer(filePath) {
  const bytes = await window.fedo.readAudio(filePath)
  const ctx = getCtx()
  return ctx.decodeAudioData(bytes)
}

// Descarga el archivo, lo decodifica y devuelve los picos
// mas su duracion real.
export async function decodeAndPeak(filePath, bins) {
  const audioBuffer = await decodeBuffer(filePath)
  return { peaks: computePeaks(audioBuffer, bins), duration: audioBuffer.duration }
}

// Contexto de audio compartido por toda la aplicacion
let sharedCtx = null
function getCtx() {
  if (!sharedCtx) sharedCtx = new (window.AudioContext || window.webkitAudioContext)()
  if (sharedCtx.state === 'suspended') sharedCtx.resume()
  return sharedCtx
}
