// ============================================================
//  fedo~explorer — tests del loudness integrado (EBU R128)
//  Valida la curva K, los dos gates y la calibracion contra
//  la formula de ITU-R BS.1770-4
// ============================================================
import { describe, it, expect } from 'vitest'
import { measureLoudness } from '../src/lib/loudness.js'
import { applyBiquads, kWeightingHighpass, kWeightingShelf } from '../src/lib/dsp.js'

const RATE = 48000

// AudioBuffer falso: N muestras por canal, sin depender del navegador
function fakeBuffer(channels, sampleRate = RATE) {
  const data = channels.map((c) => Float32Array.from(c))
  return {
    numberOfChannels: data.length,
    length: data[0].length,
    sampleRate,
    duration: data[0].length / sampleRate,
    getChannelData: (i) => data[i],
  }
}

// Senoidal de una frecuencia y duracion, con amplitud de pico
function sine(freq, seconds, peak, sampleRate = RATE) {
  const n = Math.round(seconds * sampleRate)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    out[i] = peak * Math.sin((2 * Math.PI * freq * i) / sampleRate)
  }
  return out
}

// Concatena senales en una sola linea de tiempo
function concat(parts) {
  const total = parts.reduce((acc, p) => acc + p.length, 0)
  const out = new Float32Array(total)
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

// Ganancia en dB de la curva K a una frecuencia, medida sobre su
// respuesta al impulso (independiente del pipeline de medicion)
function kWeightingDb(freq, sampleRate = RATE) {
  const n = 16384
  const impulse = new Float64Array(n)
  impulse[0] = 1
  const out = applyBiquads(impulse, [kWeightingShelf(sampleRate), kWeightingHighpass(sampleRate)])
  let re = 0
  let im = 0
  for (let i = 0; i < n; i++) {
    const w = (2 * Math.PI * freq * i) / sampleRate
    re += out[i] * Math.cos(w)
    im -= out[i] * Math.sin(w)
  }
  return 20 * Math.log10(Math.hypot(re, im))
}

// Valor esperado de LUFS segun la formula del estandar para un seno de pico `peak`
function expectedLufs(freq, peak) {
  const rms = peak / Math.SQRT2
  return 20 * Math.log10(rms) + kWeightingDb(freq) - 0.691
}

describe('curva K (K-weighting)', () => {
  it('aplica +4 dB de shelving a 4 kHz', () => {
    // La mascara de BS.1770-4 pide +4 dB alrededor de 4 kHz
    expect(Math.abs(kWeightingDb(4000) - 4)).toBeLessThan(0.2)
  })

  it('deja pasar 1 kHz con la leve ganancia de la curva', () => {
    // A 1 kHz la curva K no es plana: sube ~0.65 dB. Esa ganancia es la
    // que compensa la constante de calibracion de -0.691 del estandar.
    expect(kWeightingDb(1000)).toBeGreaterThan(0.4)
    expect(kWeightingDb(1000)).toBeLessThan(1)
  })

  it('corta los graves por debajo de 100 Hz', () => {
    // El paso alto RLB (38 Hz) atenua mucho mas a 50 Hz que a 1 kHz
    expect(kWeightingDb(1000) - kWeightingDb(50)).toBeGreaterThan(3)
    expect(kWeightingDb(1000) - kWeightingDb(20)).toBeGreaterThan(12)
  })
})

describe('measureLoudness', () => {
  it('coincide con la formula de BS.1770-4 para un seno de 1 kHz', () => {
    const peak = 0.2
    const { integrated } = measureLoudness(fakeBuffer([sine(1000, 10, peak)]))
    expect(integrated).toBeCloseTo(expectedLufs(1000, peak), 1)
  })

  it('sube 6 dB al duplicar la amplitud', () => {
    const a = measureLoudness(fakeBuffer([sine(1000, 8, 0.1)]))
    const b = measureLoudness(fakeBuffer([sine(1000, 8, 0.2)]))
    expect(b.integrated - a.integrated).toBeCloseTo(6.02, 1)
  })

  it('pesa 3 dB mas un stereo con la misma senal en los dos canales', () => {
    // Dual mono real: BS.1770-4 suma la potencia de los dos canales
    // (10*log10(2) = 3.01 dB), no promedia
    const mono = measureLoudness(fakeBuffer([sine(1000, 8, 0.2)]))
    const stereo = measureLoudness(fakeBuffer([sine(1000, 8, 0.2), sine(1000, 8, 0.2)]))
    expect(stereo.integrated - mono.integrated).toBeCloseTo(3.01, 1)
  })

  it('sube el loudness cuando la senal es mas brillante', () => {
    // Con la curva K aplicada, un seno de 4 kHz al mismo RMS suena mas fuerte
    const grave = measureLoudness(fakeBuffer([sine(100, 8, 0.2)]))
    const agudo = measureLoudness(fakeBuffer([sine(4000, 8, 0.2)]))
    expect(agudo.integrated - grave.integrated).toBeGreaterThan(3)
  })

  it('el gate absoluto ignora una cola por debajo de -70 LUFS', () => {
    const fuerte = sine(1000, 6, 0.2)
    const mudo = sine(1000, 6, 0.0002)
    const soloFuerte = measureLoudness(fakeBuffer([fuerte]))
    const conCola = measureLoudness(fakeBuffer([concat([fuerte, mudo])]))
    // La parte en silencio no arrastra el resultado hacia abajo. Solo queda
    // el bloque de 400 ms que cruza la transicion y este si pasa el gate
    // (esta a 6 dB del promedio, dentro de los 10 LU del gate relativo).
    expect(Math.abs(conCola.integrated - soloFuerte.integrated)).toBeLessThan(0.3)
  })

  it('el gate relativo descarta los passages 10 LU por debajo', () => {
    // Dos mitades con 20 dB de diferencia: la suave queda bajo el gate relativo
    const fuerte = sine(1000, 4, 0.2828)
    const suave = sine(1000, 4, 0.02828)
    const soloFuerte = measureLoudness(fakeBuffer([fuerte]))
    const conSuave = measureLoudness(fakeBuffer([concat([fuerte, suave])]))
    expect(Math.abs(conSuave.integrated - soloFuerte.integrated)).toBeLessThan(0.3)
  })

  it('el maximo de corto plazo es mayor o igual al integrado', () => {
    const { integrated, shortTerm } = measureLoudness(fakeBuffer([sine(1000, 10, 0.2)]))
    expect(shortTerm).toBeGreaterThanOrEqual(integrated - 0.01)
  })

  it('devuelve null con silencio digital', () => {
    expect(measureLoudness(fakeBuffer([new Float32Array(RATE * 2)]))).toBeNull()
  })

  it('devuelve null si el audio es mas corto que un bloque', () => {
    expect(measureLoudness(fakeBuffer([sine(1000, 0.1, 0.2)]))).toBeNull()
  })

  it('no se rompe con un buffer vacio', () => {
    expect(measureLoudness(fakeBuffer([new Float32Array(0)]))).toBeNull()
  })
})
