// La recherche ⌘K : aller n'importe où au clavier — une page ou un projet,
// par son numéro, son nom ou son client. Le calcul vit dans lib/navigation.js.
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { chercher } from '../../lib/navigation'
import Icone from './icones'

export default function Recherche({ projets, isAdmin, onFerme }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const champ = useRef(null)
  const resultats = chercher(q, { projets, isAdmin })
  useEffect(() => { champ.current?.focus() }, [])
  useEffect(() => { setI(0) }, [q])

  function aller(r) {
    if (!r) return
    onFerme()
    if (r.externe) window.open(r.href, '_blank', 'noopener')
    else router.push(r.href)
  }
  function touche(e) {
    if (e.key === 'Escape') onFerme()
    else if (e.key === 'ArrowDown') { e.preventDefault(); setI(x => Math.min(x + 1, resultats.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setI(x => Math.max(x - 1, 0)) }
    else if (e.key === 'Enter') aller(resultats[i])
  }

  return (
    <div className="nv-palette-voile" onClick={onFerme}>
      <div className="nv-palette" role="dialog" aria-modal="true" aria-label="Aller à" onClick={e => e.stopPropagation()}>
        <label className="nv-palette-champ">
          <Icone nom="chercher" />
          <input ref={champ} value={q} onChange={e => setQ(e.target.value)} onKeyDown={touche}
            placeholder="Aller à une page ou un projet : 147, Red Bull, factures…" aria-label="Aller à" />
          <kbd>Échap</kbd>
        </label>
        {q && resultats.length === 0 && <p className="nv-palette-vide">Rien ne répond à « {q} ».</p>}
        {resultats.length > 0 && (
          <ul role="listbox">
            {resultats.map((r, k) => (
              <li key={r.cle} role="option" aria-selected={k === i}>
                <button onMouseEnter={() => setI(k)} onClick={() => aller(r)}>
                  <span className="genre">{r.genre === 'projet' ? 'Projet' : 'Page'}</span>
                  <span className="nom">{r.numero != null && <span className="no">{r.numero} </span>}{r.nom}</span>
                  <span className="detail">{r.detail}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {!q && <p className="nv-palette-vide">Tape un numéro de projet, un nom, un client ou une page. ↑ ↓ pour choisir, Entrée pour ouvrir.</p>}
      </div>
    </div>
  )
}
