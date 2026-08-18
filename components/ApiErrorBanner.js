import { useEffect, useState } from 'react'
import { surErreurApi } from '../lib/api'

// Bandeau d'erreur des mutations API.
//
// Jusqu'ici, une action qui échouait ne laissait aucune trace visible : le
// bouton « Envoyée » d'une facture répondait 405 et l'écran ne bougeait pas.
// Ce bandeau écoute le bus d'erreurs alimenté par lib/api.js et par
// l'intercepteur de _app.js, et affiche l'échec là où l'utilisateur regarde.
//
// Il affiche l'identifiant de requête : c'est ce qui permet de retrouver la
// ligne de log correspondante à partir de ce que l'utilisateur a vu.
export default function ApiErrorBanner() {
  const [erreurs, setErreurs] = useState([])

  useEffect(() => surErreurApi(err => {
    const item = {
      cle: `${Date.now()}-${Math.random()}`,
      message: err?.message || 'Erreur inconnue',
      requestId: err?.requestId || null,
      status: err?.status || null,
    }
    setErreurs(l => [...l.slice(-2), item])   // au plus trois à l'écran
    // Assez long pour être lu, assez court pour ne pas gêner.
    setTimeout(() => setErreurs(l => l.filter(e => e.cle !== item.cle)), 8000)
  }), [])

  if (erreurs.length === 0) return null

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
        zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8,
        width: 'min(560px, calc(100vw - 32px))', fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      {erreurs.map(e => (
        <div key={e.cle} style={{
          background: '#7f1d1d', color: '#fff', borderRadius: 10, padding: '12px 14px',
          boxShadow: '0 8px 24px rgba(0,0,0,.28)', display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1.2 }}>⚠</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>L’action n’a pas abouti</div>
            <div style={{ fontSize: 12.5, opacity: .92, marginTop: 2, wordBreak: 'break-word' }}>{e.message}</div>
            {e.requestId && (
              <div style={{ fontSize: 11, opacity: .7, marginTop: 4, fontFamily: 'ui-monospace, monospace' }}>
                réf. {e.requestId}
              </div>
            )}
          </div>
          <button
            onClick={() => setErreurs(l => l.filter(x => x.cle !== e.cle))}
            aria-label="Fermer l’alerte"
            style={{ background: 'none', border: 'none', color: '#fff', opacity: .7, cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 2 }}
          >×</button>
        </div>
      ))}
    </div>
  )
}
