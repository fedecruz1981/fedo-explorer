// ============================================================
//  fedo~explorer — primitivas DSP compartidas
//  Filtros biquad, downmix a mono y Utilities de senal
//  Todo en JS puro: no hace falta ffmpeg para medir nada
//  Firmado: fedo soft
// ============================================================

// Coeficientes de un filtro biquad (forma directa 1, denominator normalizado)
export function biquad(b0, b1, b2, a1, a2) {
  return { b0, b1, b2, a1, a2 }
}

// Coeficientes de un paso alto de 2º orden (Butterworth con Q configurable)
export function highpass(f0, q, rate) {
  // Ajusta el angulo del filtro a la frecuencia de muestreo
  const k = Math.tan((Math.PI * f0) / rate)
  // Denominador sin normalizar
  const norm = 1 + k / q + k * k
  // Devuelve el filtro con el numerador del paso alto y el denominador listo
  return biquad(1 / norm, -2 / norm, 1 / norm, (2 * (k * k - 1)) / norm, (1 - k / q + k * k) / norm)
}

// Coeficientes de un paso bajo de 2º orden
export function lowpass(f0, q, rate) {
  // Ajusta el angulo del filtro a la frecuencia de muestreo
  const k = Math.tan((Math.PI * f0) / rate)
  // Denominador sin normalizar
  const norm = 1 + k / q + k * k
  // Devuelve el filtro con el numerador del paso bajo y el denominador listo
  return biquad(k * k / norm, (2 * k * k) / norm, k * k / norm, (2 * (k * k - 1)) / norm, (1 - k / q + k * k) / norm)
}

// Coeficientes del shelving alto de la curva K (etapa 1 del K-weighting).
// Los valores son los que usa libebur128 para EBU R128 / ITU-R BS.1770-4.
export function kWeightingShelf(rate) {
  // Frecuencia central del shelving
  const f0 = 1681.974450955533
  // Ganancia del shelving en dB
  const g = 3.999843853973347
  // Q del shelving
  const q = 0.7071752369554196
  // Ajusta el angulo del filtro a la frecuencia de muestreo
  const k = Math.tan((Math.PI * f0) / rate)
  // Ganancia lineal del shelving
  const vh = Math.pow(10, g / 20)
  // Ganancia intermedia para conservar el orden del filtro
  const vb = Math.pow(vh, 0.4996667741545416)
  // Denominador sin normalizar
  const norm = 1 + k / q + k * k
  // Devuelve el shelving de 2º orden
  return biquad(
    (vh + (vb * k) / q + k * k) / norm,
    (2 * (k * k - vh)) / norm,
    (vh - (vb * k) / q + k * k) / norm,
    (2 * (k * k - 1)) / norm,
    (1 - k / q + k * k) / norm
  )
}

// Coefficients del paso alto RLB (etapa 2 del K-weighting).
// Los valores son los que usa libebur128 para EBU R128 / ITU-R BS.1770-4.
export function kWeightingHighpass(rate) {
  // Frecuencia central del paso alto
  const f0 = 38.13547087602444
  // Q del paso alto
  const q = 0.5003270373238773
  // Ajusta el angulo del filtro a la frecuencia de muestreo
  const k = Math.tan((Math.PI * f0) / rate)
  // Denominador sin normalizar
  const norm = 1 + k / q + k * k
  // Devuelve el paso alto de 2º orden
  return biquad(1 / norm, (-2) / norm, 1 / norm, (2 * (k * k - 1)) / norm, (1 - k / q + k * k) / norm)
}

// Aplica un biquad sobre la senal y devuelve una copia filtrada
export function applyBiquad(input, coeffs) {
  // Desempacena los coeficientes del filtro
  const { b0, b1, b2, a1, a2 } = coeffs
  // Salida del filtro, con los dos estados iniciales en cero
  const out = new Float64Array(input.length)
  // Estados internos del filtro (y[n-1], y[n-2], x[n-1], x[n-2])
  let x1 = 0
  let x2 = 0
  let y1 = 0
  let y2 = 0
  // Recorre la senal muestra a muestra
  for (let i = 0; i < input.length; i++) {
    // Muestra de entrada actual
    const x0 = input[i]
    // Ecuacion de diferencias del biquad
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
    // Desplaza los estados para la siguiente muestra
    x2 = x1
    x1 = x0
    y2 = y1
    y1 = y0
    // Guarda la muestra filtrada
    out[i] = y0
  }
  return out
}

// Aplica varios biquads en cascada sobre la senal
export function applyBiquads(input, coeffsList) {
  // Senal filtrada, que se va reescribiendo en cascada
  let signal = input
  // Aplica cada etapa del filtro sobre la salida de la anterior
  for (const c of coeffsList) signal = applyBiquad(signal, c)
  return signal
}

// Promueve un AudioBuffer (o cualquier objeto con la misma interfaz) a mono
export function downmixToMono(audioBuffer) {
  // Numero de canales del buffer
  const n = audioBuffer.numberOfChannels
  // Longitud total de muestras
  const len = audioBuffer.length
  // Senal mono resultante
  const mono = new Float64Array(len)
  // Si es mono, basta con copiar el canal
  if (n === 1) {
    const c0 = audioBuffer.getChannelData(0)
    for (let i = 0; i < len; i++) mono[i] = c0[i]
    return mono
  }
  // Promedio de los canales: el oido percibe la suma de forma similar
  for (let c = 0; c < n; c++) {
    // Datos del canal actual
    const data = audioBuffer.getChannelData(c)
    // Suma el canal sobre la mezcla
    for (let i = 0; i < len; i++) mono[i] += data[i]
  }
  // Divide por la cantidad de canales
  for (let i = 0; i < len; i++) mono[i] /= n
  return mono
}

// Decima la senal a una frecuencia de muestreo objetivo.
// Cada bloque de `factor` muestras se promedia, asi que antes de tirar
// muestras se atenua lo que caeria por encima de Nyquist (sin aliasing).
export function decimate(input, fromRate, toRate) {
  // Si ya estamos en la frecuencia objetivo o por debajo, no se toca nada
  if (toRate >= fromRate) return { data: input, rate: fromRate }
  // Factor de decimacion entero
  const factor = Math.max(1, Math.round(fromRate / toRate))
  // Frecuencia de muestreo efectiva despues de decimar
  const outRate = fromRate / factor
  // Cantidad de muestras de salida (solo bloques completos)
  const outLen = Math.floor(input.length / factor)
  // Senal decimada
  const out = new Float64Array(outLen)
  // Promedia cada bloque y lo guarda
  for (let o = 0; o < outLen; o++) {
    // Suma del bloque actual
    let acc = 0
    // Primer indice del bloque
    const start = o * factor
    // Acumula todas las muestras del bloque
    for (let j = 0; j < factor; j++) acc += input[start + j]
    // Guarda el promedio del bloque
    out[o] = acc / factor
  }
  return { data: out, rate: outRate }
}

// Convierte un valor RMS a dBFS
export function rmsToDb(rms) {
  // El silencio no tiene equivalente en dB
  if (!(rms > 0)) return -Infinity
  return 20 * Math.log10(rms)
}
