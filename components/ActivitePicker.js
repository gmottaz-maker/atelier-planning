// Choisir une activité pour une ligne de main-d'œuvre de l'offre.
//
// Deux gestes, un seul endroit :
//   — `ActivitePicker` (« + Activité ») ajoute une ligne remplie : libellé,
//     tarif de vente et code ;
//   — `CodeActivite` pose ou change le code d'une ligne DÉJÀ écrite, sans
//     toucher à son libellé ni à son prix — ce qu'on a rédigé pour le client
//     reste à lui.
//
// La liste vient de `/api/activites`, la même que la feuille d'heures : c'est
// ce qui rend les deux comparables (lib/heures.js, `ligneOffreActivite`).
import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { AL, C, FONT, MONO, R } from '../lib/theme'
import { activitesParFamille, ligneOffreActivite, libelleSuitActivite } from '../lib/heures'
import { fmtCHF } from '../lib/money'

function useActivites() {
  const { data } = useSWR('/api/activites')
  return Array.isArray(data) ? data : []
}

export default function ActivitePicker({ onPick, familles = null, label = '+ Activité' }) {
  const activites = useActivites()
  const [ouvert, setOuvert] = useState(false)
  const boite = useRef(null)

  useEffect(() => {
    const dehors = e => { if (boite.current && !boite.current.contains(e.target)) setOuvert(false) }
    document.addEventListener('mousedown', dehors)
    return () => document.removeEventListener('mousedown', dehors)
  }, [])

  // Les familles de la section d'abord (Gestion dans « Gestion projet »), les
  // autres ensuite : on ne cache rien, on range.
  const groupes = activitesParFamille(activites)
  const tries = familles
    ? [...groupes.filter(g => familles.includes(g.famille)), ...groupes.filter(g => !familles.includes(g.famille))]
    : groupes

  return (
    <div ref={boite} style={{ position: 'relative', display: 'inline-block' }}>
      <button type="button" onClick={() => setOuvert(o => !o)}
        style={{ font: `500 11px ${FONT}`, padding: '3px 8px', borderRadius: R.pill, cursor: 'pointer',
          border: `1px solid ${C.muted}`, background: AL.white, color: AL.black }}>
        {label}
      </button>
      {ouvert && (
        <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, width: 320, maxHeight: 380, overflowY: 'auto',
          background: AL.white, border: `1px solid ${C.border}`, borderRadius: R.panel, zIndex: 60,
          boxShadow: '0 8px 24px rgba(0,0,0,.12)' }}>
          {tries.length === 0 && <div style={{ padding: 12, fontSize: 13, color: C.muted }}>Aucune activité.</div>}
          {tries.map(g => (
            <div key={g.famille}>
              <div style={{ padding: '10px 12px 4px', font: `500 10.5px ${MONO}`, letterSpacing: '.08em',
                textTransform: 'uppercase', color: C.muted }}>{g.libelle}</div>
              {g.activites.map(a => (
                <button key={a.code} type="button"
                  onClick={() => { onPick(ligneOffreActivite(a)); setOuvert(false) }}
                  style={{ display: 'flex', width: '100%', gap: 10, alignItems: 'baseline', padding: '7px 12px',
                    border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
                  onMouseEnter={e => { e.currentTarget.style.background = C.hover }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                  <span style={{ font: `500 12px ${MONO}`, color: C.accent, width: 20 }}>{a.code}</span>
                  <span style={{ flex: 1, fontSize: 13, color: AL.black }}>{a.libelle}</span>
                  {/* Un tarif manquant se dit : la ligne arrivera sans prix. */}
                  <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: a.tarif_vente == null ? C.danger : C.muted }}>
                    {a.tarif_vente == null ? 'sans tarif' : `${fmtCHF(a.tarif_vente)}/h`}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Le code d'une ligne existante, en tête de sa description.
 * Vide, il s'affiche en tiret : la ligne compte alors dans « non ventilé ».
 */
export function CodeActivite({ valeur, onChange, texte, onTexte }) {
  const activites = useActivites()
  const groupes = activitesParFamille(activites)
  const vide = valeur === null || valeur === undefined || valeur === ''
  const trouver = code => activites.find(a => Number(a.code) === Number(code))

  function choisir(e) {
    const code = e.target.value === '' ? null : Number(e.target.value)
    onChange(code)
    // Le nom de l'activité remplit le libellé — sauf si on y a écrit autre
    // chose (lib/heures.js, `libelleSuitActivite`). Revenir à « — » ne vide
    // rien : on retire un code, pas un texte.
    const nouvelle = code == null ? null : trouver(code)
    if (onTexte && nouvelle && libelleSuitActivite(texte, trouver(valeur)?.libelle)) onTexte(nouvelle.libelle)
  }

  return (
    <select
      value={vide ? '' : String(valeur)}
      onChange={choisir}
      title={vide ? 'Aucune activité : cette ligne ne se comparera pas aux heures passées' : 'Activité de la feuille d\'heures'}
      style={{ width: 44, flex: 'none', font: `500 12px ${MONO}`, padding: '2px 0', border: 'none',
        background: 'transparent', color: vide ? C.faint : C.accent, cursor: 'pointer', outline: 'none' }}>
      <option value="">—</option>
      {groupes.map(g => (
        <optgroup key={g.famille} label={g.libelle}>
          {g.activites.map(a => <option key={a.code} value={a.code}>{a.code} · {a.libelle}</option>)}
        </optgroup>
      ))}
    </select>
  )
}
