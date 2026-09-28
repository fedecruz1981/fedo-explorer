// ============================================================
//  fedo~explorer — componente principal (App)
//  Orquesta sidebar, tabla de archivos y barra de transporte,
//  ademas de toda la logica de reproduccion y borrado.
//  Firmado: fedo soft
// ============================================================
import { useCallback, useEffect, useRef, useState } from 'react'
import Sidebar from './components/Sidebar'
import FileTable from './components/FileTable'
import TransportBar from './components/TransportBar'
import { RefreshCw, Trash2 } from 'lucide-react'
import { decodeAndPeak } from './lib/peaks'

export default function App() {
  // Referencia al elemento <audio> oculto que reproduce los archivos
  const audioRef = useRef(null)

  // Estado del arbol de directorios y de la carpeta seleccionada
  const [roots, setRoots] = useState(null) // accesos rapidos + discos
  const [nodes, setNodes] = useState({}) // cache de carpetas expandidas
  const [expanded, setExpanded] = useState(() => new Set()) // nodos abiertos
  const [selectedPath, setSelectedPath] = useState(null) // carpeta activa
  const [dirFiles, setDirFiles] = useState([]) // archivos de la carpeta activa
  const [loadingDir, setLoadingDir] = useState(false)
  const [dirError, setDirError] = useState(null)

  // Cache de metadata por archivo (path -> metadata o null)
  const metaRef = useRef(new Map())
  const [meta, setMeta] = useState(metaRef.current)
  const metaToken = useRef(0) // token para cancelar lecturas obsoletas

  // Estado de reproduccion y seleccion
  const [current, setCurrent] = useState(null) // archivo en el transporte
  const [selectedFile, setSelectedFile] = useState(null) // fila seleccionada
  const [confirmDelete, setConfirmDelete] = useState(null) // dialogo de borrado
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [peaks, setPeaks] = useState(null) // waveform del archivo actual

  // Cache de waveform por archivo + token anti-carrera
  const peaksCache = useRef(new Map())
  const peakToken = useRef(0)

  // Al arrancar: cargar raices y seleccionar el Home por defecto
  useEffect(() => {
    window.fedo.listRoots().then((r) => {
      setRoots(r)
      const home = r.quick.find((x) => x.name === 'Home')
      if (home) select(home.path)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sincroniza el estado de React con los eventos del elemento <audio>
  useEffect(() => {
    const a = audioRef.current
    const onTime = () => setTime(a.currentTime)
    const onDur = () => setDuration(isFinite(a.duration) ? a.duration : 0)
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onEnded = () => setPlaying(false)
    a.addEventListener('timeupdate', onTime)
    a.addEventListener('durationchange', onDur)
    a.addEventListener('play', onPlay)
    a.addEventListener('pause', onPause)
    a.addEventListener('ended', onEnded)
    return () => {
      a.removeEventListener('timeupdate', onTime)
      a.removeEventListener('durationchange', onDur)
      a.removeEventListener('play', onPlay)
      a.removeEventListener('pause', onPause)
      a.removeEventListener('ended', onEnded)
    }
  }, [])

  // Carga los hijos de una carpeta en el arbol (una sola vez por nodo)
  const loadChildren = useCallback(async (path) => {
    if (nodes[path]?.loaded) return
    setNodes((prev) => ({
      ...prev,
      [path]: { ...(prev[path] || {}), loading: true, error: null }
    }))
    try {
      const res = await window.fedo.listDir(path)
      setNodes((prev) => ({
        ...prev,
        [path]: {
          ...prev[path],
          dirs: res.dirs,
          files: res.files,
          loaded: true,
          loading: false,
          error: null
        }
      }))
      // Dispara el conteo de audio de cada subcarpeta en segundo plano
      res.dirs.forEach((d) => countFor(path, d.path))
    } catch (err) {
      setNodes((prev) => ({
        ...prev,
        [path]: { ...prev[path], loading: false, error: String(err) }
      }))
    }
  }, [nodes])

  // Calcula y cachea el total de audio de una subcarpeta
  const countFor = useCallback(async (parentPath, childPath) => {
    setNodes((prev) => ({
      ...prev,
      [parentPath]: {
        ...prev[parentPath],
        counts: { ...prev[parentPath]?.counts, [childPath]: 'pending' }
      }
    }))
    const c = await window.fedo.countAudio(childPath)
    setNodes((prev) => ({
      ...prev,
      [parentPath]: {
        ...prev[parentPath],
        counts: { ...prev[parentPath]?.counts, [childPath]: c }
      }
    }))
  }, [])

  // Selecciona una carpeta: la marca activa y carga sus archivos
  const select = useCallback(
    (path) => {
      setSelectedPath(path)
      loadChildren(path)
      setLoadingDir(true)
      setDirError(null)
      setDirFiles([])
      window.fedo
        .listDir(path)
        .then((res) => {
          setDirFiles(res.files)
          setLoadingDir(false)
        })
        .catch((err) => {
          setDirError(String(err))
          setLoadingDir(false)
        })
    },
    [loadChildren]
  )

  // Expande / colapsa un nodo del arbol
  const toggle = useCallback(
    (path) => {
      setExpanded((prev) => {
        const next = new Set(prev)
        if (next.has(path)) {
          next.delete(path)
        } else {
          next.add(path)
          loadChildren(path)
        }
        return next
      })
    },
    [loadChildren]
  )

  // Lee la metadata de la carpeta activa en batches de 8 (no bloquea la UI).
  // Los resultados ya cacheados se saltan; el token invalida lecturas viejas.
  useEffect(() => {
    const token = ++metaToken.current
    const unparsed = dirFiles.filter((f) => !metaRef.current.has(f.path))
    let i = 0
    const workers = Array.from({ length: 8 }, async () => {
      while (i < unparsed.length) {
        if (token !== metaToken.current) return
        const f = unparsed[i++]
        let m
        try {
          m = await window.fedo.readAudioMeta(f.path)
        } catch {
          m = null
        }
        if (token !== metaToken.current) return
        metaRef.current.set(f.path, m)
        setMeta(new Map(metaRef.current))
      }
    })
    Promise.all(workers)
  }, [dirFiles])

  // Reproduce un archivo. Si es el mismo ya cargado, alterna play/pausa.
  // Tambien marca la fila como seleccionada y dispara el waveform.
  const playFile = useCallback((file) => {
    const a = audioRef.current
    setSelectedFile({ path: file.path, name: file.name })
    if (current && current.path === file.path) {
      if (a.paused) {
        a.play().catch(() => {})
      } else {
        a.pause()
      }
      return
    }
    setCurrent(file)
    setTime(0)
    setPeaks(null)
    const src = window.fedo.mediaUrl(file.path)
    a.src = src
    a.play().catch(() => {})
    decodePeaks(file.path, src)
  }, [current])

  // Decodifica el archivo en segundo plano y calcula los picos del waveform.
  // El resultado se cachea para no repetir el trabajo en visitas siguientes.
  const decodePeaks = useCallback(async (path, src) => {
    const token = ++peakToken.current
    if (peaksCache.current.has(path)) {
      setPeaks(peaksCache.current.get(path))
      return
    }
    try {
      const result = await decodeAndPeak(src, 1400)
      if (token !== peakToken.current) return
      peaksCache.current.set(path, result.peaks)
      setPeaks(result.peaks)
    } catch {
      if (token === peakToken.current) setPeaks(null)
    }
  }, [])

  // Play/pausa del transporte; si no hay archivo, arranca el primero
  const togglePlay = useCallback(() => {
    const a = audioRef.current
    if (current) {
      if (a.paused) a.play().catch(() => {})
      else a.pause()
      return
    }
    if (dirFiles.length > 0) playFile(dirFiles[0])
  }, [current, dirFiles, playFile])

  // Seek por click en el waveform (posicion proporcional a la duracion)
  const onSeek = useCallback(
    (ratio) => {
      const a = audioRef.current
      if (!a.src || !isFinite(a.duration)) return
      a.currentTime = ratio * a.duration
    },
    []
  )

  // Cambio de volumen (0 a 1) sobre el elemento <audio>
  const onVolume = useCallback((v) => {
    setVolume(v)
    if (audioRef.current) audioRef.current.volume = v
  }, [])

  // Ejecuta el borrado confirmado: envia a la papelera y limpia la UI
  const doDelete = useCallback(async () => {
    const f = confirmDelete
    if (!f) return
    try {
      await window.fedo.deleteFile(f.path)
      // Si era el archivo en reproduccion, detener y limpiar el transporte
      if (current && current.path === f.path) {
        const a = audioRef.current
        a.pause()
        a.removeAttribute('src')
        setCurrent(null)
        setPlaying(false)
        setTime(0)
        setDuration(0)
        setPeaks(null)
      }
      if (selectedFile && selectedFile.path === f.path) setSelectedFile(null)
      // Quita la fila de la lista visible
      setDirFiles((prev) => prev.filter((x) => x.path !== f.path))
      setConfirmDelete(null)
    } catch (err) {
      // Si falla, muestra el error dentro del dialogo sin cerrarlo
      setConfirmDelete({ ...f, error: String(err) })
    }
  }, [confirmDelete, current, selectedFile])

  // Atajos de teclado: Espacio = play/pausa, Supr = borrar seleccion
  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Space') {
        const el = e.target
        if (el && (el.tagName === 'INPUT' || el.tagName === 'BUTTON')) return
        e.preventDefault()
        togglePlay()
      }
      if (e.code === 'Delete' && selectedFile) {
        const el = e.target
        if (el && (el.tagName === 'INPUT' || el.tagName === 'BUTTON')) return
        e.preventDefault()
        setConfirmDelete(selectedFile)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePlay, selectedFile])

  // Recarga la carpeta activa (boton de refresco)
  const refresh = () => {
    if (selectedPath) select(selectedPath)
  }

  // Migas de pan de la ruta actual para la toolbar
  const pathCrumb = selectedPath ? selectedPath.split(/[\\/]+/).filter(Boolean) : []

  return (
    <div className="app">
      <div className="app-body">
        {/* Arbol de directorios lateral */}
        <Sidebar
          roots={roots}
          nodes={nodes}
          expanded={expanded}
          selectedPath={selectedPath}
          onToggle={toggle}
          onSelect={select}
        />

        <main className="main">
          {/* Barra superior: ruta, contador, borrado y refresco */}
          <div className="toolbar">
            <div className="path">
              {selectedPath ? (
                pathCrumb.map((part, i) => (
                  <span key={i}>
                    {i > 0 && <span className="sep">/</span>}
                    <span style={i === pathCrumb.length - 1 ? { color: 'var(--text)' } : undefined}>
                      {part}
                    </span>
                  </span>
                ))
              ) : (
                <span>cargando…</span>
              )}
            </div>
            <span className="count-chip">
              <b>{dirFiles.length}</b> archivos
            </span>
            {/* Borrado de la seleccion (alternativa a la papelera de la fila) */}
            <button
              className="icon-btn danger"
              disabled={!selectedFile}
              onClick={() => selectedFile && setConfirmDelete(selectedFile)}
              title={selectedFile ? `borrar «${selectedFile.name}» (Supr)` : 'seleccioná un archivo para borrarlo (Supr)'}
            >
              <Trash2 size={15} />
            </button>
            <button className="icon-btn" onClick={refresh} title="recargar carpeta">
              <RefreshCw size={15} />
            </button>
          </div>

          {/* Tabla de archivos de la carpeta activa */}
          {dirError ? (
            <div className="empty-state">
              <p style={{ color: 'var(--magenta)' }}>no se pudo leer esta carpeta</p>
              <small>{dirError}</small>
            </div>
          ) : (
            <FileTable
              files={dirFiles}
              meta={meta}
              current={current}
              playing={playing}
              selected={selectedFile ? selectedFile.path : null}
              onPlay={playFile}
              onDelete={(f) => setConfirmDelete({ path: f.path, name: f.name })}
              loading={loadingDir}
            />
          )}

          {/* Barra de transporte inferior */}
          <TransportBar
            current={current}
            playing={playing}
            time={time}
            duration={duration}
            volume={volume}
            peaks={peaks}
            onToggle={togglePlay}
            onSeek={onSeek}
            onVolume={onVolume}
          />
        </main>
      </div>

      {/* Dialogo de confirmacion de borrado (no usa ventana modal del SO) */}
      {confirmDelete && (
        <div className="confirm-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-title">borrar archivo</div>
            <div className="confirm-name">{confirmDelete.name}</div>
            {confirmDelete.error ? (
              <div className="confirm-error">{confirmDelete.error}</div>
            ) : (
              <div className="confirm-hint">se moverá a la papelera de reciclaje</div>
            )}
            <div className="confirm-actions">
              <button className="btn ghost" onClick={() => setConfirmDelete(null)}>
                cancelar
              </button>
              <button className="btn danger" onClick={doDelete}>
                borrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Elemento de audio oculto que ejecuta la reproduccion */}
      <audio ref={audioRef} style={{ display: 'none' }} preload="auto" />
    </div>
  )
}
