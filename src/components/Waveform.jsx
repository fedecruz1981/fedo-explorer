// ============================================================
//  fedo~explorer — waveform en canvas con playhead
//  Dibuja los picos, el progreso y permite seek por click
//  Firmado: fedo soft
// ============================================================
import { useEffect, useRef, useState } from 'react'

export default function Waveform({ peaks, time, duration, active, onSeek }) {
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const peaksRef = useRef(null) // canvas fuera de pantalla con los picos
  const [size, setSize] = useState({ w: 0, h: 0 })

  // Mantiene el tamano del canvas sincronizado con el contenedor
  useEffect(() => {
    const wrap = wrapRef.current
    const measure = () => {
      if (wrap) setSize({ w: wrap.clientWidth, h: wrap.clientHeight })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [])

  // Renderiza los picos en un canvas fuera de pantalla (una sola vez).
  // Asi el redibujado por frame solo copia la imagen + playhead.
  useEffect(() => {
    if (!peaks || size.w === 0) {
      peaksRef.current = null
      return
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = Math.round(size.w * dpr)
    const h = Math.round(size.h * dpr)
    const off = document.createElement('canvas')
    off.width = w
    off.height = h
    const ctx = off.getContext('2d')
    const mid = h / 2
    const amp = h / 2 - 2

    // Linea central tenue de referencia
    ctx.strokeStyle = 'rgba(35, 230, 201, 0.16)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, mid)
    ctx.lineTo(w, mid)
    ctx.stroke()

    // Barras verticales de los picos (cyan del sistema de diseno)
    ctx.fillStyle = 'rgba(35, 230, 201, 0.85)'
    const step = w / peaks.length
    const bw = Math.max(1, step * 0.62)
    for (let i = 0; i < peaks.length; i++) {
      const x = i * step
      const top = mid + peaks[i].min * amp
      const bottom = mid + peaks[i].max * amp
      ctx.fillRect(x, top, bw, Math.max(1, bottom - top))
    }
    peaksRef.current = off
  }, [peaks, size])

  // Dibuja el frame actual: waveform + zona reproducida + playhead magenta
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || size.w === 0) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = size.w
    const h = size.h
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, w, h)

    const off = peaksRef.current
    if (!off) return

    ctx.drawImage(off, 0, 0, w, h)

    // Progreso de reproduccion (zona reproducida en cyan mas intenso)
    const ratio = duration > 0 ? Math.min(time / duration, 1) : 0
    if (ratio > 0) {
      const pw = w * ratio
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, pw, h)
      ctx.clip()
      ctx.drawImage(off, 0, 0, w, h)
      ctx.fillStyle = 'rgba(35, 230, 201, 0.28)'
      ctx.fillRect(0, 0, pw, h)
      ctx.restore()

      // Playhead vertical magenta
      ctx.strokeStyle = 'rgba(255, 47, 110, 0.95)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(pw, 0)
      ctx.lineTo(pw, h)
      ctx.stroke()
    }
  }, [peaks, size, time, duration])

  // Click sobre el waveform = seek a la posicion proporcional
  const handleClick = (e) => {
    if (!onSeek || !peaks) return
    const rect = canvasRef.current.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    onSeek(Math.max(0, Math.min(1, ratio)))
  }

  return (
    <div ref={wrapRef} className="waveform-wrap">
      <canvas ref={canvasRef} className="waveform-canvas" onClick={handleClick} />
      {/* Pista para el usuario cuando no hay archivo en reproduccion */}
      {!active && (
        <div className="waveform-hint">seleccioná un archivo para reproducir</div>
      )}
    </div>
  )
}
