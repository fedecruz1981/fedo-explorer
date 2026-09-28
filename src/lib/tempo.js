// ============================================================
//  fedo~explorer — deteccion de tempo (BPM)
//  Flujo espectral en 3 bandas + autocorrelacion con prior
//  log-gaussiano sobre el envelope de onsets (en JS puro)
//  Firmado: fedo soft
// ============================================================
import { applyBiquads, decimate, downmixToMono, highpass, lowpass } from './dsp'

// Frecuencia a la que se decim la senal para analizar onsets (4x mas rapido)
const TARGET_RATE = 11025

// Largo maximo analizado: el tempo es estable, no hace falta mas
const MAX_SECONDS = 180

// Largo minimo analizado: con menos onsets la autocorrelacion no es confiable
const MIN_SECONDS = 3

// Salto del envelope de onsets en muestras de la senal decimada (~86 Hz)
const HOP = 128

// Rango de BPM buscable antes de plegar octavas
const MIN_BPM = 60
const MAX_BPM = 200

// Prior log-gaussiano centrado en 120 BPM (evita errores de octava)
const PRIOR_CENTER = 120
const PRIOR_WIDTH_OCTAVES = 0.85

// Contraste minimo del envelope de onsets (desviacion tipica sobre media).
// Un tono continuo genera un envelope casi plano (valor cercano a 1) porque
// la medicion del RMS por ventana fluctua muy poco, mientras que un material
// percusivo da un envelope muy modulado (valor de 4 a 6). Por debajo de este
// umbral no hay contenido ritmico y no se informa un tempo.
const MIN_CONTRAST = 2

// Cortes de las 3 bandas (graves, medios, agudos) en Hz.
// El corte agudo se limita por Nyquist de la senal ya decimada.
const BAND_EDGES = [
  { low: 40, high: 200 },
  { low: 200, high: 2000 },
  { low: 2000, high: 5000 }
]

// Separa la senal en 3 bandas con filtros biquad en cascada
function splitBands(signal, rate) {
  // Nyquist de la senal decimada
  const nyquist = rate / 2
  // Banda maxima, recortada si se pasa de Nyquist
  const top = Math.min(BAND_EDGES[BAND_EDGES.length - 1].high, nyquist * 0.9)
  // Senales de cada banda
  const bands = []
  // Recorre los cortes de banda
  for (let i = 0; i < BAND_EDGES.length; i++) {
    // Corte superior de la banda actual
    const high = i === BAND_EDGES.length - 1 ? top : Math.min(BAND_EDGES[i].high, top)
    // Si la banda quedo sin ancho util, se descarta
    if (high <= BAND_EDGES[i].low) break
    // Etapas del filtro: quita graves y quita agudos
    const stages = [highpass(BAND_EDGES[i].low, 0.707, rate), lowpass(high, 0.707, rate)]
    // Aplica la cascada y guarda la banda
    bands.push(applyBiquads(signal, stages))
  }
  return bands
}

// Calcula el RMS por salto de cada banda
function bandRms(signals, hop) {
  // Cantidad de saltos que cubre la senal
  const frames = Math.floor(signals[0].length / hop)
  // RMS de cada banda en cada salto
  const out = signals.map(() => new Float64Array(frames))
  // Recorre banda por banda
  for (let b = 0; b < signals.length; b++) {
    // Senal de la banda actual
    const data = signals[b]
    // Acumula el RMS de cada salto
    for (let f = 0; f < frames; f++) {
      // Primer indice del salto
      const start = f * hop
      // Suma de cuadrados del salto
      let acc = 0
      // Suma las muestras del salto
      for (let i = 0; i < hop; i++) {
        // Muestra actual
        const v = data[start + i]
        // Acumula el cuadrado
        acc += v * v
      }
      // Guarda la raiz de la potencia media
      out[b][f] = Math.sqrt(acc / hop)
    }
  }
  return out
}

// Convierte el RMS por banda en un envelope de fuerza de onset.
// Se rectifica a media onda (solo cuenta los ataques) y se normaliza.
// Devuelve null si el envelope es plano (silencio digital).
function onsetEnvelope(rmsBands) {
  // Frames disponibles
  const frames = rmsBands[0].length
  // Envelope resultante
  const env = new Float64Array(Math.max(0, frames - 1))
  // Suma los aumentos de energia de todas las bandas
  for (let f = 1; f < frames; f++) {
    // Fuerza del onset en este frame
    let v = 0
    // Suma la parte positiva de la subida de cada banda
    for (let b = 0; b < rmsBands.length; b++) {
      const delta = rmsBands[b][f] - rmsBands[b][f - 1]
      if (delta > 0) v += delta
    }
    env[f - 1] = v
  }
  // Normaliza por el maximo para que no dependa del volumen del archivo
  let max = 0
  for (let i = 0; i < env.length; i++) if (env[i] > max) max = env[i]
  // Sin energia no hay onsets que analizar
  if (max <= 0) return null
  for (let i = 0; i < env.length; i++) env[i] /= max
  return env
}

// Autocorrelacion del envelope en el rango de lags que cubre MIN..MAX BPM
function autocorrelate(env, envRate) {
  // Lag del BPM mas lento y del mas rapido
  const minLag = Math.floor((envRate * 60) / MAX_BPM)
  const maxLag = Math.ceil((envRate * 60) / MIN_BPM)
  // Media del envelope (la autocorrelacion usa la señal centrada)
  let mean = 0
  for (let i = 0; i < env.length; i++) mean += env[i]
  mean /= env.length
  // Envelope centrado en cero
  const centered = new Float64Array(env.length)
  for (let i = 0; i < env.length; i++) centered[i] = env[i] - mean
  // Suma de cuadrados total (normalizador comun)
  let energy = 0
  for (let i = 0; i < centered.length; i++) energy += centered[i] * centered[i]
  // Autocorrelacion por lag, indexada por lag
  const acf = new Float64Array(maxLag + 1)
  for (let lag = minLag; lag <= maxLag; lag++) {
    let acc = 0
    for (let i = 0; i + lag < centered.length; i++) acc += centered[i] * centered[i + lag]
    acf[lag] = energy > 0 ? acc / energy : 0
  }
  return { acf, minLag, maxLag }
}

// Detecta el tempo de un archivo.
// Devuelve { bpm, confidence } o null si el audio es silencio o muy corto.
export function detectTempo(audioBuffer) {
  // Sin canales o vacio no hay nada que analizar
  if (!audioBuffer || audioBuffer.numberOfChannels < 1 || audioBuffer.length === 0) return null

  // Frecuencia de muestreo original
  const rate = audioBuffer.sampleRate
  // Mezcla a mono, que es lo que percibe el oido
  const mono = downmixToMono(audioBuffer)
  // Recorta a MAX_SECONDS para acotar el costo
  const maxSamples = MAX_SECONDS * rate
  const monoCut = mono.length > maxSamples ? mono.slice(0, maxSamples) : mono
  // Con menos de MIN_SECONDS no hay suficientes onsets para que la
  // autocorrelacion signifique algo
  if (monoCut.length < MIN_SECONDS * rate) return null
  // Decima para analizar onsets (Nyquist de 5.5 kHz alcanza para percusion)
  const { data, rate: lowRate } = decimate(monoCut, rate, TARGET_RATE)

  // Un salto por banda y al menos medio segundo de audio
  if (data.length < HOP * 5) return null

  // Separa en bandas, calcula el RMS por salto y arma el envelope de onsets
  const bands = splitBands(data, lowRate)
  // RMS por banda y salto
  const rms = bandRms(bands, HOP)
  // Envelope de fuerza de onset normalizado (null si hay silencio)
  const env = onsetEnvelope(rms)
  // Envelope vacio, plano o demasiado corto: no se puede detectar nada
  if (!env || env.length < 8) return null

  // Contraste del envelope: separa el material percusivo de un tono continuo
  let media = 0
  for (let i = 0; i < env.length; i++) media += env[i]
  media /= env.length
  let varianza = 0
  for (let i = 0; i < env.length; i++) varianza += (env[i] - media) * (env[i] - media)
  const desviacion = Math.sqrt(varianza / env.length)
  // Envelope plano: hay senal pero ningun ataque que marcar un pulso
  if (media <= 0 || desviacion / media < MIN_CONTRAST) return null

  // Frecuencia del envelope en Hz
  const envRate = lowRate / HOP
  // Autocorrelacion en el rango util de lags
  const { acf, minLag, maxLag } = autocorrelate(env, envRate)
  // Envelope de silencio: autocorrelacion plana, sin confianza posible
  if (maxLag >= acf.length || minLag < 1) return null

  // Busca el maximo de la autocorrelacion ponderada por el prior de tempo
  let best = null
  let bestScore = -Infinity
  let scoreSum = 0
  let scoreCount = 0
  for (let lag = minLag; lag <= maxLag; lag++) {
    // BPM correspondiente a este lag
    const bpm = (envRate * 60) / lag
    // Distancia al centro del prior, en octavas
    const octaves = Math.log2(bpm / PRIOR_CENTER)
    // Prior log-gaussiano: penaliza los tempos muy lejanos de 120 BPM
    const prior = Math.exp(-0.5 * (octaves / PRIOR_WIDTH_OCTAVES) ** 2)
    // Puntaje del lag
    const score = acf[lag] * prior
    // Lleva la cuenta del promedio de puntajes (para la confianza)
    scoreSum += score
    scoreCount++
    // Guarda el mejor puntaje
    if (score > bestScore) {
      bestScore = score
      best = { lag, bpm }
    }
  }
  // No hay ningun lag valido en el rango
  if (!best) return null

  // Refina el BPM con una parabola alrededor del lag ganador (sub-muestra el pico)
  let bpm = best.bpm
  if (best.lag > minLag && best.lag < maxLag) {
    // Los tres puntos alrededor del pico
    const ym1 = acf[best.lag - 1]
    const y0 = acf[best.lag]
    const yp1 = acf[best.lag + 1]
    // Denominador de la parabola
    const denom = ym1 - 2 * y0 + yp1
    // Vértice de la parabola: desplazamiento fraccionario del pico
    const shift = denom !== 0 ? (0.5 * (ym1 - yp1)) / denom : 0
    // Ajusta el lag con el desplazamiento y vuelve a BPM
    if (Math.abs(shift) <= 1) bpm = (envRate * 60) / (best.lag + shift)
  }

  // Pliega octavas para dejar el tempo en el rango musical habitual
  while (bpm > 180) bpm /= 2
  while (bpm < 60) bpm *= 2

  // Confianza: cuanto destaca el pico sobre el promedio de la curva
  const avg = scoreCount > 0 ? scoreSum / scoreCount : 0
  const confidence = avg > 0 ? Math.max(0, Math.min(1, bestScore / avg / 4)) : 0

  return { bpm: Math.round(bpm * 10) / 10, confidence: Math.round(confidence * 100) / 100 }
}
