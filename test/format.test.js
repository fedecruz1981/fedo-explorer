// ============================================================
//  fedo~explorer — tests de las utilidades de formato
//  Duracion, bitrate, sample rate y helpers de rutas
// ============================================================
import { describe, it, expect } from 'vitest'
import { formatDuration, formatBitrate, formatSampleRate, basename, isAudioPath } from '../src/lib/format.js'

describe('formatDuration', () => {
  it('formatea segundos cortos como m:ss', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(5)).toBe('0:05')
    expect(formatDuration(65)).toBe('1:05')
    expect(formatDuration(599)).toBe('9:59')
  })

  it('usa h:mm:ss a partir de una hora', () => {
    expect(formatDuration(3600)).toBe('1:00:00')
    expect(formatDuration(3661)).toBe('1:01:01')
    expect(formatDuration(7325)).toBe('2:02:05')
  })

  it('trunca los decimales', () => {
    expect(formatDuration(65.9)).toBe('1:05')
    expect(formatDuration(0.99)).toBe('0:00')
  })

  it('rellena con ceros a la izquierda', () => {
    expect(formatDuration(65)).toBe('1:05')
    expect(formatDuration(6005)).toBe('1:40:05')
  })

  it('devuelve guion largo para valores invalidos', () => {
    expect(formatDuration(null)).toBe('—')
    expect(formatDuration(undefined)).toBe('—')
    expect(formatDuration(-1)).toBe('—')
    expect(formatDuration(NaN)).toBe('—')
    expect(formatDuration(Infinity)).toBe('—')
    expect(formatDuration('abc')).toBe('—')
  })
})

describe('formatBitrate', () => {
  it('convierte a kbps', () => {
    expect(formatBitrate(320000)).toBe('320 kbps')
    expect(formatBitrate(128000)).toBe('128 kbps')
  })

  it('redondea los kbps', () => {
    expect(formatBitrate(320400)).toBe('320 kbps')
    expect(formatBitrate(320600)).toBe('321 kbps')
  })

  it('deja los valores muy bajos en bps', () => {
    expect(formatBitrate(999)).toBe('999 bps')
    expect(formatBitrate(1)).toBe('1 bps')
  })

  it('devuelve null para valores no utilizables', () => {
    expect(formatBitrate(null)).toBeNull()
    expect(formatBitrate(undefined)).toBeNull()
    expect(formatBitrate(0)).toBeNull()
    expect(formatBitrate(-1)).toBeNull()
  })
})

describe('formatSampleRate', () => {
  it('muestra en kHz a partir de 1000 Hz', () => {
    expect(formatSampleRate(44100)).toBe('44.1 kHz')
    expect(formatSampleRate(48000)).toBe('48 kHz')
    expect(formatSampleRate(96000)).toBe('96 kHz')
    expect(formatSampleRate(8000)).toBe('8 kHz')
  })

  it('deja los valores muy bajos en Hz', () => {
    expect(formatSampleRate(441)).toBe('441 Hz')
    expect(formatSampleRate(800)).toBe('800 Hz')
  })

  it('devuelve null para valores no utilizables', () => {
    expect(formatSampleRate(null)).toBeNull()
    expect(formatSampleRate(undefined)).toBeNull()
    expect(formatSampleRate(0)).toBeNull()
    expect(formatSampleRate(-44100)).toBeNull()
  })
})

describe('basename', () => {
  it('extrae el nombre con separador unix', () => {
    expect(basename('/home/usuario/cancion.mp3')).toBe('cancion.mp3')
  })

  it('extrae el nombre con separador windows', () => {
    expect(basename('C:\\Users\\usuario\\cancion.mp3')).toBe('cancion.mp3')
  })

  it('ignora las barras finales', () => {
    expect(basename('/home/usuario/')).toBe('usuario')
    expect(basename('C:\\Users\\usuario\\\\')).toBe('usuario')
  })

  it('colapsa separadores repetidos', () => {
    expect(basename('/home//usuario///cancion.mp3')).toBe('cancion.mp3')
  })

  it('devuelve la ruta si ya es un nombre', () => {
    expect(basename('cancion.mp3')).toBe('cancion.mp3')
  })

  it('devuelve la ruta si queda vacia', () => {
    expect(basename('/')).toBe('/')
  })
})

describe('isAudioPath', () => {
  const aceptados = [
    'a.mp3', 'a.wav', 'a.flac', 'a.ogg', 'a.oga', 'a.m4a', 'a.aac',
    'a.aiff', 'a.aif', 'a.wma', 'a.opus', 'a.webm', 'a.mka', 'a.mpc',
    'a.ape', 'a.amr', 'a.caf',
  ]

  it.each(aceptados)('acepta %s', (archivo) => {
    expect(isAudioPath(archivo)).toBe(true)
  })

  it('no distingue mayusculas', () => {
    expect(isAudioPath('CANCION.MP3')).toBe(true)
    expect(isAudioPath('Cancion.FlAc')).toBe(true)
  })

  it('rechaza otras extensiones', () => {
    expect(isAudioPath('a.txt')).toBe(false)
    expect(isAudioPath('a.mp4')).toBe(false)
    expect(isAudioPath('a.mp3.txt')).toBe(false)
  })

  it('rechaza archivos sin extension', () => {
    expect(isAudioPath('cancion')).toBe(false)
  })

  it('funciona con rutas completas', () => {
    expect(isAudioPath('C:\\Users\\fedo\\Musica\\tema.mp3')).toBe(true)
    expect(isAudioPath('/home/fedo/Musica/tema.flac')).toBe(true)
  })
})
