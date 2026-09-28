// ============================================================
//  fedo~explorer — analisis de audio (BPM + LUFS)
//  Comparte un unico decodificado con el waveform: el archivo
//  se descarga y decodifica una sola vez y de ahi salen los picos,
//  el tempo y el loudness integrado.
//  Firmado: fedo soft
// ============================================================
import { computePeaks, decodeBuffer } from './peaks'
import { measureLoudness } from './loudness'
import { detectTempo } from './tempo'

// Corre el analisis de loudness y tempo sobre un buffer ya decodificado.
// Cada medicion va en su propio try: si una falla, la otra se muestra igual.
export function analyzeBuffer(audioBuffer) {
  // Resultado con valores nulos hasta que cada medicion exista
  const out = { bpm: null, bpmConfidence: null, lufs: null, shortTerm: null }
  try {
    // Loudness integrado (EBU R128)
    const loud = measureLoudness(audioBuffer)
    if (loud) {
      out.lufs = Math.round(loud.integrated * 10) / 10
      out.shortTerm = Math.round(loud.shortTerm * 10) / 10
    }
  } catch {
    // Si el audio no se puede medir, el BPM igual sirve
  }
  try {
    // Tempo detectado
    const tempo = detectTempo(audioBuffer)
    if (tempo) {
      out.bpm = tempo.bpm
      out.bpmConfidence = tempo.confidence
    }
  } catch {
    // Si el tempo no se puede detectar, el LUFS igual sirve
  }
  return out
}

// Descarga y decodifica el archivo una sola vez, y de ahi saca
// los picos del waveform mas el BPM y el LUFS del mismo buffer.
export async function analyzeMedia(filePath, bins) {
  // Decodifica el archivo completo con Web Audio API
  const audioBuffer = await decodeBuffer(filePath)
  return {
    duration: audioBuffer.duration,
    peaks: computePeaks(audioBuffer, bins),
    ...analyzeBuffer(audioBuffer)
  }
}
