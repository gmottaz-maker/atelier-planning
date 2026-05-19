import { useState, useEffect } from 'react'

/**
 * Modal de sélection d'un dossier kDrive sous "02. Projets".
 * Navigation par drilldown (clic = entrer dans le dossier).
 * Bouton "Sélectionner ce dossier" à chaque niveau.
 */
export default function KDriveFolderPicker({ initialFolderId, onSelect, onClose }) {
  const [path, setPath]       = useState([{ id: null, name: '02. Projets' }])
  const [folders, setFolders] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const currentId = path[path.length - 1].id

  async function load(parentId) {
    setLoading(true); setError('')
    try {
      const url = parentId == null ? '/api/kdrive/browse' : `/api/kdrive/browse?parentId=${parentId}`
      const r = await fetch(url)
      const data = await r.json()
      if (data.error) { setError(data.error); setFolders([]); return }
      setFolders(data.folders || [])
    } catch (e) {
      setError('Erreur kDrive')
      setFolders([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(currentId) }, [currentId])

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function enter(folder) {
    setPath(p => [...p, { id: folder.id, name: folder.name }])
  }

  function goTo(index) {
    setPath(p => p.slice(0, index + 1))
  }

  function confirm() {
    if (path.length === 1) {
      // user veut "02. Projets" lui-même — probablement pas voulu
      setError('Descends dans un sous-dossier pour le sélectionner')
      return
    }
    const last = path[path.length - 1]
    onSelect({ id: last.id, name: last.name, path: path.slice(1).map(p => p.name).join(' / ') })
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4" style={{ background: 'rgba(15,23,42,0.45)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl flex flex-col w-full" style={{ maxWidth: 560, maxHeight: '80vh' }}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-900" style={{ fontSize: 16 }}>Choisir un dossier kDrive</h3>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-100" style={{ fontSize: 18 }}>×</button>
          </div>
          {/* Breadcrumb */}
          <nav className="flex items-center flex-wrap gap-1 text-xs">
            {path.map((p, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span className="text-gray-300">/</span>}
                <button onClick={() => goTo(i)}
                  className={`px-1.5 py-0.5 rounded ${i === path.length - 1 ? 'font-semibold text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}>
                  {p.name}
                </button>
              </span>
            ))}
          </nav>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <p className="text-center text-sm text-gray-400 py-8">Chargement…</p>
          ) : error ? (
            <p className="text-center text-sm text-red-500 py-8">{error}</p>
          ) : folders.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8">Dossier vide</p>
          ) : (
            <ul className="space-y-0.5">
              {folders.map(f => (
                <li key={f.id}>
                  <button onClick={() => enter(f)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md hover:bg-gray-50 text-left transition-colors">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
                    </svg>
                    <span className="text-sm text-gray-700 flex-1 truncate">{f.name}</span>
                    <span className="text-xs text-gray-300">›</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-3">
          <p className="text-xs text-gray-400 truncate">
            {path.length > 1 ? <>Sélection : <strong className="text-gray-700">{path[path.length - 1].name}</strong></> : 'Aucune sélection'}
          </p>
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-800">Annuler</button>
            <button onClick={confirm} disabled={path.length === 1}
              className="px-4 py-1.5 rounded-md text-sm font-medium text-white disabled:opacity-40"
              style={{ background: '#111827' }}>
              Sélectionner
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
