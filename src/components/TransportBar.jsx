// ============================================================
//  fedo~explorer — barra de transporte inferior
//  Play/pausa, info de pista, waveform, tiempo, medidores y volumen
//  Firmado: fedo soft
// ============================================================
import { Pause, Play, Volume2, VolumeX } from 'lucide-react'
import Waveform from './Waveform'
import { formatDuration } from '../lib/format'

export default function TransportBar({
  current,
  playing,
  time,
  duration,
  volume,
  peaks,
  analysis,
  onToggle,
  onSeek,
  onVolume,
}) {
  // Medidor de analisis: spinner, valor medido o guion segun el estado
  const meter = (label, key, title) => {
    // Hay archivo pero todavia no se termino de analizar
    if (analysis === null && current) {
      return (
        <div className="meter" title={`${title} — analizando`}>
          <span className="meter-label">{label}</span>
          <span className="meter-value">
            <span className="spinner" />
          </span>
        </div>
      )
    }
    // El archivo tiene la medicion disponible
    if (analysis && analysis[key] != null) {
      return (
        <div className="meter" title={title}>
          <span className="meter-label">{label}</span>
          <span className="meter-value">{analysis[key]}</span>
        </div>
      )
    }
    // Sin archivo o sin medicion
    return (
      <div className="meter" title={title}>
        <span className="meter-label">{label}</span>
        <span className="meter-value dim">—</span>
      </div>
    )
  }
  return (
    <footer className="transport">
      {/* Fila superior: transporte + waveform + tiempo */}
      <div className="transport-top">
        {/* Boton principal de play/pausa (magenta del sistema de diseno) */}
        <button className="play-btn" onClick={onToggle} title={playing ? 'pausa (espacio)' : 'reproducir (espacio)'}>
          {playing ? <Pause size={20} /> : <Play size={20} style={{ marginLeft: 2 }} />}
        </button>

        {/* Nombre y ruta del archivo en reproduccion */}
        <div className="track-info">
          {current ? (
            <>
              <div className="track-name">{current.name}</div>
              <div className="track-path" title={current.path}>
                {current.path}
              </div>
            </>
          ) : (
            <div className="track-empty">sin reproducción</div>
          )}
        </div>

        {/* Waveform con playhead y seek */}
        <Waveform
          peaks={peaks}
          time={time}
          duration={duration}
          active={!!current}
          onSeek={onSeek}
        />

        {/* Tiempo actual / total */}
        <div className="time-readout">
          <span className="current">{formatDuration(time)}</span>
          <span> / {formatDuration(duration)}</span>
        </div>
      </div>

      {/* Fila inferior: medidores de analisis + volumen */}
      <div className="transport-bottom">
        <div className="meters">
          {meter('lufs', 'lufs', 'loudness integrado (EBU R128 / ITU-R BS.1770-4)')}
          {meter('bpm', 'bpm', 'tempo detectado (autocorrelacion de onsets)')}
        </div>

        {/* Control de volumen */}
        <div className="volume">
          {volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => onVolume(parseFloat(e.target.value))}
          />
        </div>
      </div>
    </footer>
  )
}
