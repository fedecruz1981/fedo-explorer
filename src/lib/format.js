// ============================================================
//  fedo~explorer — utilidades de formato de datos
//  Duracion, bitrate, sample rate y helpers de rutas
//  Firmado: fedo soft
// ============================================================

// Formatea segundos como m:ss (o h:mm:ss para duraciones largas).
// Devuelve "—" si el valor no es valido.
export function formatDuration(sec) {
  if (sec == null || !isFinite(sec) || sec < 0) return '—'
  const total = Math.floor(sec)
  const s = String(total % 60).padStart(2, '0')
  const m = Math.floor(total / 60)
  if (m >= 60) {
    const h = Math.floor(m / 60)
    return `${h}:${String(m % 60).padStart(2, '0')}:${s}`
  }
  return `${m}:${s}`
}

// Formatea el bitrate en kbps (o bps para valores muy bajos)
export function formatBitrate(bps) {
  if (bps == null || bps <= 0) return null
  if (bps < 1000) return `${bps} bps`
  return `${Math.round(bps / 1000)} kbps`
}

// Formatea la frecuencia de muestreo en kHz o Hz
export function formatSampleRate(hz) {
  if (hz == null || hz <= 0) return null
  return hz >= 1000 ? `${hz / 1000} kHz` : `${hz} Hz`
}

// Nombre base de una ruta (funciona con \ y / indistintamente)
export function basename(p) {
  const parts = p.replace(/[\\/]+$/, '').split(/[\\/]/)
  return parts[parts.length - 1] || p
}

// Indica si una ruta apunta a un archivo de audio soportado
export function isAudioPath(p) {
  return /\.(mp3|wav|flac|ogg|oga|m4a|aac|aiff|aif|wma|opus|webm|mka|mpc|ape|amr|caf)$/i.test(p)
}
