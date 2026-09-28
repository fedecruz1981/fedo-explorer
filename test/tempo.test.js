// ============================================================
//  fedo~explorer — tests de la deteccion de tempo (BPM)
//  Se prueba con tracks de clicks sinteticos a BPM conocidos
// ============================================================
import { describe, it, expect } from 'vitest'
import { detectTempo } from '../src/lib/tempo.js'

const RATE = 44100

// PRNG determinista: los tests tienen que ser reproducibles
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

// Track de clicks al tempo pedido: cada golpe tiene un thump grave
// y un burst de ruido, para que las 3 bandas tengan onsets que ver
function clickTrack(bpm, seconds, sampleRate = RATE, seed = 7) {
  const n = Math.round(seconds * sampleRate)
  const out = new Float32Array(n)
  const rand = mulberry32(seed)
  const period = (60 / bpm) * sampleRate
  const hitLen = Math.round(0.3 * sampleRate)
  // El inicio de cada golpe va a un indice entero: en un typed array un
  // indice fraccionario se descarta en silencio y el golpe se pierde
  for (let start = 0; start < n; start = Math.round(start + period)) {
    const len = Math.min(hitLen, n - start)
    for (let i = 0; i < len; i++) {
      const t = i / sampleRate
      const thump = 0.7 * Math.sin(2 * Math.PI * 70 * t) * Math.exp(-t / 0.08)
      const noise = 0.5 * (rand() * 2 - 1) * Math.exp(-t / 0.03)
      out[start + i] += thump + noise
    }
  }
  return out
}

describe('detectTempo', () => {
  it('detecta 120 BPM', () => {
    const { bpm } = detectTempo(fakeBuffer([clickTrack(120, 12)]))
    expect(bpm).not.toBeNull()
    expect(bpm).toBeCloseTo(120, 0)
  })

  it('detecta 90 BPM', () => {
    const { bpm } = detectTempo(fakeBuffer([clickTrack(90, 14)]))
    expect(bpm).toBeCloseTo(90, 0)
  })

  it('detecta 140 BPM', () => {
    const { bpm } = detectTempo(fakeBuffer([clickTrack(140, 12)]))
    expect(bpm).toBeCloseTo(140, 0)
  })

  it('detecta 128 BPM', () => {
    const { bpm } = detectTempo(fakeBuffer([clickTrack(128, 12)]))
    expect(bpm).toBeCloseTo(128, 0)
  })

  it('pliega a la mitad un tempo de 240 BPM', () => {
    // 240 BPM es real pero queda fuera de rango: se reporta como 120
    const { bpm } = detectTempo(fakeBuffer([clickTrack(240, 12)]))
    expect(bpm).toBeCloseTo(120, 0)
  })

  it('funciona con una pista stereo identica en ambos canales', () => {
    const track = clickTrack(120, 12)
    const { bpm } = detectTempo(fakeBuffer([track, track]))
    expect(bpm).toBeCloseTo(120, 0)
  })

  it('devuelve una confianza entre 0 y 1', () => {
    const { confidence } = detectTempo(fakeBuffer([clickTrack(120, 12)]))
    expect(confidence).toBeGreaterThan(0)
    expect(confidence).toBeLessThanOrEqual(1)
  })

  it('no detecta tempo en un tono continuo sin percusion', () => {
    // Un seno puro no tiene ataques: el envelope de onsets queda plano y
    // cualquier tempo seria inventado
    const n = Math.round(8 * RATE)
    const tono = new Float32Array(n)
    for (let i = 0; i < n; i++) tono[i] = 0.2 * Math.sin((2 * Math.PI * 1000 * i) / RATE)
    expect(detectTempo(fakeBuffer([tono]))).toBeNull()
  })

  it('no detecta tempo en silencio digital', () => {
    expect(detectTempo(fakeBuffer([new Float32Array(RATE * 5)]))).toBeNull()
  })

  it('no detecta tempo en un archivo demasiado corto', () => {
    expect(detectTempo(fakeBuffer([new Float32Array(RATE * 0.2)]))).toBeNull()
  })

  it('no se rompe con un buffer vacio', () => {
    expect(detectTempo(fakeBuffer([new Float32Array(0)]))).toBeNull()
  })
})
