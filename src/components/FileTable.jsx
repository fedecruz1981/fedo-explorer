// ============================================================
//  fedo~explorer — tabla de archivos de la carpeta activa
//  Muestra nombre, duracion, formato y el analisis de audio
//  (BPM y LUFS) con el boton de borrado visible al pasar el mouse.
//  Firmado: fedo soft
// ============================================================
import { FileAudio, Trash2 } from 'lucide-react'
import { formatDuration, formatBitrate, formatSampleRate } from '../lib/format'

// Celda de analisis: spinner mientras se decodifica el archivo, el valor
// medido si salio, o un guion si no se pudo medir. La entrada `a` del cache
// es null (en curso), false (fallo) o el objeto con las mediciones.
function analysisCell(a, key, title) {
  if (a === null) {
    return (
      <span className="cell-loading">
        <span className="spinner" />
      </span>
    )
  }
  if (a && a[key] != null) {
    return <span title={title}>{a[key]}</span>
  }
  return <span className="cell-dim">—</span>
}

export default function FileTable({
  files,
  meta,
  analysis,
  current,
  playing,
  selected,
  onPlay,
  onDelete,
  loading,
}) {
  // Encabezado fijo de la tabla (grid alineado con las filas)
  const columns = (
    <div className="table-head">
      <div className="col">archivo</div>
      <div className="col" style={{ textAlign: 'right' }}>duración</div>
      <div className="col">formato</div>
      <div className="col" style={{ textAlign: 'right' }}>bpm</div>
      <div className="col" style={{ textAlign: 'right' }}>lufs</div>
      <div className="col" aria-hidden="true" />
    </div>
  )

  return (
    <div className="table-wrap">
      {columns}

      {/* Estado vacio: no hay audio en esta carpeta */}
      {files.length === 0 && !loading && (
        <div className="empty-state">
          <FileAudio size={40} className="big-icon" />
          <p>sin archivos de audio en esta carpeta</p>
          <small>mp3 · wav · flac · ogg · m4a · aiff · wma · opus</small>
        </div>
      )}

      {files.map((f) => {
        const m = meta.get(f.path)
        // Analisis del archivo: null = en curso, false = fallo, objeto = listo
        const a = analysis.get(f.path)
        const isCurrent = current && current.path === f.path
        // Formato principal: codec o contenedor de la metadata
        const fmt = m && (m.codec || m.container)
        // Detalle secundario: sample rate · bitrate
        const sub =
          m && (formatSampleRate(m.sampleRate) || formatBitrate(m.bitrate))
            ? [formatSampleRate(m.sampleRate), formatBitrate(m.bitrate)].filter(Boolean).join(' · ')
            : null

        return (
          <div
            key={f.path}
            className={`table-row ${selected === f.path ? 'selected' : ''} ${isCurrent ? 'playing' : ''}`}
            onClick={() => onPlay(f)}
            onDoubleClick={() => onPlay(f)}
            title={f.path}
          >
            {/* Nombre del archivo + icono + ecualizador si esta en reproduccion */}
            <div className="cell cell-name">
              <span className="file-icon">
                <FileAudio size={14} />
              </span>
              <span className="file-name">{f.name}</span>
              {isCurrent && (
                <span className={`eq ${playing ? '' : 'paused'}`}>
                  <span />
                  <span />
                  <span />
                </span>
              )}
            </div>

            {/* Duracion: spinner mientras se lee la metadata */}
            <div className="cell cell-num" style={{ textAlign: 'right' }}>
              {m === undefined ? (
                <span className="cell-loading">
                  <span className="spinner" />
                </span>
              ) : m && m.duration != null ? (
                formatDuration(m.duration)
              ) : (
                <span className="cell-dim">—</span>
              )}
            </div>

            {/* Formato + subdetalle */}
            <div className="cell cell-fmt">
              {(fmt || f.ext).toUpperCase()}
              {sub && <div className="cell-meta-sub">{sub}</div>}
            </div>

            {/* BPM detectado y loudness integrado EBU R128 */}
            <div className="cell cell-bpm" style={{ textAlign: 'right' }}>
              {analysisCell(a, 'bpm', 'tempo detectado (autocorrelacion de onsets)')}
            </div>
            <div className="cell cell-lufs" style={{ textAlign: 'right' }}>
              {analysisCell(a, 'lufs', 'loudness integrado (EBU R128 / ITU-R BS.1770-4)')}
            </div>

            {/* Borrado por fila: visible al hover, no dispara reproduccion */}
            <div className="cell cell-action">
              <button
                className="row-delete"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(f)
                }}
                title="mover a la papelera"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
