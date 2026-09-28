// ============================================================
//  fedo~explorer — loudness integrado (EBU R128 / ITU-R BS.1770-4)
//  Implementacion en JS puro del K-weighting con doble gate,
//  la misma que usa el filtro ebur128 de ffmpeg o libebur128
//  Firmado: fedo soft
// ============================================================
import { applyBiquads, kWeightingHighpass, kWeightingShelf } from './dsp'

// Duracion de los bloques de medicion (400 ms con 100 ms de salto)
const BLOCK_SECONDS = 0.4
const HOP_SECONDS = 0.1

// Duracion de los bloques de corto plazo para el maximo S (3 s con 100 ms de salto)
const SHORT_SECONDS = 3

// Gate absoluto: por debajo de -70 LUFS el bloque no cuenta
const ABS_GATE_LUFS = -70

// Gate relativo: 10 LU por debajo del promedio de los bloques sobre el gate absoluto
const REL_GATE_LU = -10

// Constante de calibracion de BS.1770-4 (referencia de la calibracion de 1 kHz)
const OFFSET_LUFS = -0.691

// Peso de cada canal segun el estandar: L/R/C pesan 1, surrounds 1.41
function channelWeight(index, total) {
  // Los tres primeros canales (izquierda, derecha, centro) pesan 1
  if (index < 3) return 1
  // Un canal mono tambien pesa 1
  if (total === 1) return 1
  // Los canales de surround (Ls, Rs, LFE) pesan 1.41
  return 1.41
}

// Convierte una energia (potencia media) a LUFS
function energyToLufs(energy) {
  // La energia cero no tiene equivalente logaritmico
  if (!(energy > 0)) return -Infinity
  return OFFSET_LUFS + 10 * Math.log10(energy)
}

// Calcula la energia media ponderada de los canales en cada bloque temporal.
// Devuelve un array con una energia por bloque.
function blockEnergies(channels, rate, blockSize, hopSize, total) {
  // Cantidad de bloques que cubren toda la senal
  const count = Math.max(0, Math.floor((channels[0].length - blockSize) / hopSize) + 1)
  // Energia de cada bloque
  const out = new Float64Array(count)
  // Si la senal es mas corta que un bloque no hay nada que medir
  if (count === 0) return out
  // Recorre cada canal por separado para no repetir la cuenta por canal
  for (let c = 0; c < channels.length; c++) {
    // Datos del canal ya filtrados con K-weighting
    const data = channels[c]
    // Peso del canal en la suma de potencias
    const g = channelWeight(c, total)
    // Acumula la energia bloque a bloque
    for (let b = 0; b < count; b++) {
      // Primer indice del bloque actual
      const start = b * hopSize
      // Suma de cuadrados del bloque (potencia media)
      let acc = 0
      // Suma las muestras del bloque
      for (let i = 0; i < blockSize; i++) {
        // Muestra actual
        const v = data[start + i]
        // Acumula el cuadrado para obtener la potencia
        acc += v * v
      }
      // Suma la potencia ponderada al total del bloque
      out[b] += (g * acc) / blockSize
    }
  }
  return out
}

// Aplica el K-weighting a todos los canales del buffer
function kWeight(audioBuffer) {
  // Senales filtradas de cada canal
  const out = []
  // Aplica las dos etapas del K-weighting a cada canal
  for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
    // Copia el canal a precision doble (Float32 no alcanza para la suma)
    const data = Float64Array.from(audioBuffer.getChannelData(c))
    // Etapa 1: shelving alto, etapa 2: paso alto RLB
    out.push(applyBiquads(data, [kWeightingShelf(audioBuffer.sampleRate), kWeightingHighpass(audioBuffer.sampleRate)]))
  }
  return out
}

// Mide el loudness integrado y el maximo de corto plazo de un archivo.
// Devuelve null si el audio es demasiado corto o esta en silencio digital.
export function measureLoudness(audioBuffer) {
  // Sin canales o vacio no hay nada que medir
  if (!audioBuffer || audioBuffer.numberOfChannels < 1 || audioBuffer.length === 0) return null

  // Filtra cada canal con la curva K
  const channels = kWeight(audioBuffer)
  // Frecuencia de muestreo del archivo
  const rate = audioBuffer.sampleRate

  // Tamanos de bloque y salto en muestras
  const blockSize = Math.max(1, Math.round(BLOCK_SECONDS * rate))
  const hopSize = Math.max(1, Math.round(HOP_SECONDS * rate))
  // Energia ponderada de cada bloque de 400 ms
  const energies = blockEnergies(channels, rate, blockSize, hopSize, audioBuffer.numberOfChannels)
  // Energia insuficiente para un bloque completo
  if (energies.length === 0) return null

  // Primer gate: promedia solo los bloques por encima de -70 LUFS
  let gateSum = 0
  // Cantidad de bloques que superan el gate absoluto
  let gateCount = 0
  for (let i = 0; i < energies.length; i++) {
    if (energyToLufs(energies[i]) > ABS_GATE_LUFS) {
      gateSum += energies[i]
      gateCount++
    }
  }
  // Todo el audio esta por debajo del gate absoluto (o es silencio)
  if (gateCount === 0) return null

  // Gate relativo: 10 LU por debajo del promedio de los bloques del gate absoluto
  const relativeGate = (gateSum / gateCount) * Math.pow(10, REL_GATE_LU / 10)

  // Suma y conteo de los bloques que superan ambos gates
  let sum = 0
  let count = 0
  for (let i = 0; i < energies.length; i++) {
    if (energies[i] > relativeGate) {
      sum += energies[i]
      count++
    }
  }
  // El gate relativo dejo el conjunto vacio (no deberia pasar con un gate de -10 LU)
  if (count === 0) return null

  // Loudness integrado final
  const integrated = energyToLufs(sum / count)

  // Maximo de corto plazo (ventanas de 3 s, el estandar de referencia para LRA)
  const shortBlock = Math.max(1, Math.round(SHORT_SECONDS * rate))
  const shortEnergies = blockEnergies(channels, rate, shortBlock, hopSize, audioBuffer.numberOfChannels)
  // Maximo de las ventanas de 3 s
  let shortTerm = -Infinity
  for (let i = 0; i < shortEnergies.length; i++) {
    const l = energyToLufs(shortEnergies[i])
    if (l > shortTerm) shortTerm = l
  }
  // Si no entra ninguna ventana de 3 s, el integrated es el mejor valor disponible
  if (!isFinite(shortTerm)) shortTerm = integrated

  return { integrated, shortTerm }
}
