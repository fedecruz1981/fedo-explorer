// ============================================================
//  fedo~explorer — sidebar con arbol de directorios
//  Accesos rapidos, discos y carpetas expandibles con conteo
//  Firmado: fedo soft
// ============================================================
import { ChevronDown, ChevronRight, Folder, FolderOpen } from 'lucide-react'

// Barra lateral: marca, accesos rapidos y discos como raices del arbol
export default function Sidebar({ roots, nodes, expanded, selectedPath, onToggle, onSelect }) {
  return (
    <aside className="sidebar">
      {/* Cabecera con la marca de la aplicacion */}
      <div className="sidebar-head">
        <div className="brand">
          fedo<span className="tilde">~</span>
          <span className="explorer">explorer</span>
        </div>
        <div className="sidebar-hint">biblioteca de audio</div>
      </div>

      <div className="sidebar-scroll">
        {/* Carpetas de acceso rapido del usuario */}
        {roots && roots.quick && (
          <>
            <div className="sidebar-section">accesos</div>
            {roots.quick.map((r) => (
              <TreeNode
                key={r.path}
                path={r.path}
                name={r.name}
                node={nodes[r.path]}
                nodes={nodes}
                expanded={expanded}
                selected={selectedPath === r.path}
                onToggle={onToggle}
                onSelect={onSelect}
              />
            ))}
          </>
        )}

        {/* Unidades de disco disponibles */}
        {roots && roots.drives && roots.drives.length > 0 && (
          <>
            <div className="sidebar-section">discos</div>
            {roots.drives.map((r) => (
              <TreeNode
                key={r.path}
                path={r.path}
                name={r.name}
                node={nodes[r.path]}
                nodes={nodes}
                expanded={expanded}
                selected={selectedPath === r.path}
                onToggle={onToggle}
                onSelect={onSelect}
              />
            ))}
          </>
        )}

        {/* Estado inicial mientras se resuelven las raices */}
        {!roots && (
          <div className="sidebar-section">cargando…</div>
        )}
      </div>
    </aside>
  )
}

// Nodo recursivo del arbol: fila + hijos colapsables
// `count` llega como prop desde el nodo padre (total de audio de esta carpeta)
function TreeNode({ path, name, node, nodes, expanded, selected, onToggle, onSelect, count }) {
  const isOpen = expanded.has(path)

  return (
    <div>
      {/* Fila de la carpeta: click selecciona, chevron expande/colapsa */}
      <div
        className={`tree-row ${selected ? 'selected' : ''}`}
        onClick={() => onSelect(path)}
        title={path}
      >
        {/* Chevron de expandir/colapsar (detiene la propagacion del click) */}
        <span
          className="tree-chevron"
          onClick={(e) => {
            e.stopPropagation()
            onToggle(path)
          }}
        >
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        {/* Icono de carpeta abierta/cerrada */}
        <span className="tree-folder-icon">
          {isOpen ? <FolderOpen size={14} /> : <Folder size={14} />}
        </span>
        <span className="tree-label">{name}</span>
        {/* Conteo de archivos de audio; "…" mientras se calcula */}
        {count !== undefined && (
          <span className={`tree-count ${count === 'pending' ? 'loading' : ''}`}>
            {count === 'pending' ? '…' : count > 0 ? count : ''}
          </span>
        )}
      </div>

      {/* Hijos visibles solo cuando el nodo esta expandido */}
      {isOpen && (
        <div className="tree-children">
          {node && node.loading && (
            <div className="tree-row" style={{ color: 'var(--text-faint)', fontSize: 11 }}>
              cargando…
            </div>
          )}
          {node && node.error && (
            <div className="tree-row" style={{ color: 'var(--magenta)', fontSize: 11 }}>
              sin acceso
            </div>
          )}
          {node &&
            node.dirs &&
            node.dirs.map((d) => (
              <TreeNode
                key={d.path}
                path={d.path}
                name={d.name}
                node={nodes[d.path]}
                nodes={nodes}
                expanded={expanded}
                selected={selected === d.path}
                onToggle={onToggle}
                onSelect={onSelect}
              />
            ))}
        </div>
      )}
    </div>
  )
}
