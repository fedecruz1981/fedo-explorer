// ============================================================
//  fedo~explorer — tests del calculo de picos del waveform
//  computeAndPeak (funcion pura) y decodeAndPeak (con fetch stub)
// ============================================================
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { computePeaks, decodeAndPeak } from '../src/lib/peaks.js'

// AudioBuffer falso:Nx muestras por canal, sin depender del navegador
function fakeBuffer(channelData) {
  const channels = channelData.map((c) => Float32Array.from(c))
  return {
    numberOfChannels: channels.length,
    length: channels[0].length,
    duration: channels[0].length / 44100,
    getChannelData: (i) => channels[i],
  }
}

const mono = (values) => fakeBuffer([values])

describe('computePeaks', () => {
  it('devuelve la cantidad de bins pedidos', () => {
    const peaks = computePeaks(mono(new Array(1000).fill(0.5)), 100)
    expect(peaks).toHaveLength(100)
  })

  it('devuelve pares {min, max}', () => {
    const [bin] = computePeaks(mono([-0.5, 0.25]), 1)
    expect(bin).toEqual({ min: -0.5, max: 0.25 })
  })

  it('reduce el buffer a la cantidad de bins', () => {
    const buffer = mono(new Array(8000).fill(0.1))
    const peaks = computePeaks(buffer, 10)
    expect(peaks).toHaveLength(10)
  })

  it('detecta el maximo de cada bin', () => {
    // 4 muestras, 2 bins -> bin 0 = [1, -1], bin 1 = [0.5, 0.25]
    const peaks = computePeaks(mono([1, -1, 0.5, 0.25]), 2)
    expect(peaks[0].max).toBe(1)
    expect(peaks[0].min).toBe(-1)
    expect(peaks[1].max).toBe(0.5)
    expect(peaks[1].min).toBe(0.25)
  })

  it('mezca los canales al calcular cada bin', () => {
    // canal 1 = 0.1, canal 2 = 0.9 -> el pico del bin es 0.9
    const peaks = computePeaks(fakeBuffer([[0.1], [0.9]]), 1)
    expect(peaks[0].max).toBeCloseTo(0.9)
  })

  it('usa el minimo de todos los canales', () => {
    const peaks = computePeaks(fakeBuffer([[0.1], [-0.7]]), 1)
    expect(peaks[0].min).toBeCloseTo(-0.7)
  })

  it('no se rompe si hay menos muestras que bins', () => {
    const peaks = computePeaks(mono([0.5, -0.5]), 10)
    expect(peaks).toHaveLength(10)
    // los bins con muestras toman sus valores...
    expect(peaks[0].max).toBeCloseTo(0.5)
    // ...y los bins vacios conservan el centinela (min=1, max=-1)
    expect(peaks[5]).toEqual({ min: 1, max: -1 })
  })

  it('maneja silencio sin NaN', () => {
    const peaks = computePeaks(mono(new Array(100).fill(0)), 5)
    for (const bin of peaks) {
      expect(Number.isNaN(bin.min)).toBe(false)
      expect(Number.isNaN(bin.max)).toBe(false)
    }
  })
})

describe('decodeAndPeak', () => {
  const audioBuffer = mono([1, -1, 0.5, -0.5])

  beforeEach(() => {
    globalThis.fetch = vi.fn()
    globalThis.window = globalThis.window || {}
    globalThis.window.AudioContext = class {
      constructor() {
        this.state = 'running'
      }
      resume() {}
      decodeAudioData = vi.fn().mockResolvedValue(audioBuffer)
    }
  })

  it('devuelve los picos y la duracion', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    })
    const { peaks, duration } = await decodeAndPeak('fedo-media://file/x.mp3', 4)
    expect(peaks).toHaveLength(4)
    expect(duration).toBe(audioBuffer.duration)
  })

  it('lanza si la respuesta no es ok', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false })
    await expect(decodeAndPeak('fedo-media://file/x.mp3', 4)).rejects.toThrow('fetch failed')
  })

  it('reutiliza el mismo AudioContext entre llamadas', async () => {
    // peaks.js guarda el contexto en una variable de modulo, asi que hace
    // falta recargar el modulo para partir de un contexto limpio.
    vi.resetModules()
    const spy = vi.fn(function AudioContextStub() {
      this.state = 'running'
      this.resume = () => {}
      this.decodeAudioData = vi.fn().mockResolvedValue(audioBuffer)
    })
    globalThis.window.AudioContext = spy
    globalThis.fetch.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    })

    const fresh = await import('../src/lib/peaks.js')
    await fresh.decodeAndPeak('fedo-media://file/x.mp3', 4)
    await fresh.decodeAndPeak('fedo-media://file/y.mp3', 4)

    expect(spy).toHaveBeenCalledTimes(1)
  })
})
