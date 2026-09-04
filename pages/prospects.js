// Prospection commerciale — la liste.
//
// Volontairement des LIGNES et non des cartes : l'annuaire de contacts en
// cartes était illisible passé la douzaine d'entrées, et une ligne permet des
// colonnes comparables — c'est ce qu'on veut d'une liste de travail.
//
// L'ordre n'est pas alphabétique mais celui du TRAVAIL À FAIRE : relances en
// retard d'abord, du plus ancien au plus récent (cf. lib/prospects.js).
import { useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Head from 'next/head'
import useSWR from 'swr'
import { useAuth } from './_app'
import useIsAdmin from '../lib/useIsAdmin'
import NavBar from '../components/NavBar'
import { AL, C, FONT, MONO, R } from '../lib/theme'
import {
  ETAPES, ETAPES_ACTIVES, etape, canal, source,
  prochaineRelance, dernierEchange, retardJours, enRetard,
  trierProspects, resumeProspects,
} from '../lib/prospects'

const fmtDate = s => { const [y, m, d] = String(s || '').slice(0, 10).split('-'); return d ? `${d}.${m}` : '' }
const echangesDe = p => p?.prospect_interactions || []

export default function ProspectsPage() {
  const router = useRouter()
  const { user } = useAuth()
  const isAdmin = useIsAdmin()
  const { data, isLoading, mutate } = useSWR(isAdmin ? '/api/prospects' : null)
  const [filtre, setFiltre] = useState('actifs')
  const [q, setQ] = useState('')
  const [creation, setCreation] = useState(false)

  if (user && !isAdmin) { router.replace('/'); return null }

  const tous = (Array.isArray(data) ? data : []).filter(p => !p.converted_to_contact_id)
  const resume = resumeProspects(tous, echangesDe)

  const cherche = q.trim().toLowerCase()
  const filtres = tous
    .filter(p => filtre === 'tous' ? true : filtre === 'actifs' ? ETAPES_ACTIVES.includes(p.stage) : p.stage === filtre)
    .filter(p => !cherche || [p.name, p.city, p.sector, p.source_detail, p.owner]
      .filter(Boolean).join(' ').toLowerCase().includes(cherche))
  const visibles = trierProspects(filtres, echangesDe)

  async function creer(nom) {
    const r = await fetch('/api/prospects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nom, stage: 'a_contacter', owner: user?.name || null }),
    })
    const d = await r.json()
    setCreation(false)
    if (d?.id) router.push(`/prospects/${d.id}`)
    else mutate()
  }

  const th = { fontSize: 10.5, fontWeight: 500, letterSpacing: '.1em', textTransform: 'uppercase',
    color: C.muted, textAlign: 'left', padding: '0 12px 10px', borderBottom: `1.5px solid ${C.outline}` }
  const td = { padding: '15px 12px', borderTop: `1px solid ${C.border}`, verticalAlign: 'middle' }

  return (
    <div style={{ minHeight: '100vh', background: C.pageBg, fontFamily: FONT, color: C.ink }}>
      <Head><title>Prospects — Maze Project</title></Head>
      <NavBar title="Prospects">
        <button onClick={() => setCreation(true)}
          style={{ padding: '8px 16px', borderRadius: R.pill, background: AL.black, color: AL.white,
            border: 'none', font: `500 13px ${FONT}`, cursor: 'pointer' }}>
          + prospect
        </button>
      </NavBar>

      <main style={{ padding: '32px 40px 104px', maxWidth: 1600, margin: '0 auto' }}>
        <h1 style={{ font: `500 34px ${FONT}`, letterSpacing: '-.02em', margin: '0 0 4px' }}>
          nos <span style={{ color: C.accent }}>prospects</span>
        </h1>
        <p style={{ fontSize: 13, color: C.muted, margin: '0 0 22px' }}>
          {resume.actifs} prospect{resume.actifs > 1 ? 's' : ''} actif{resume.actifs > 1 ? 's' : ''}
          {resume.retard > 0 && <> · <span style={{ color: C.danger, fontWeight: 500 }}>{resume.retard} relance{resume.retard > 1 ? 's' : ''} en retard</span></>}
          {resume.aVenir > 0 && <> · {resume.aVenir} à venir</>}
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
          {[{ cle: 'actifs', label: 'Actifs' }, ...ETAPES.map(e => ({ cle: e.cle, label: e.label })), { cle: 'tous', label: 'Tous' }]
            .map(f => (
              <button key={f.cle} onClick={() => setFiltre(f.cle)}
                style={{ padding: '6px 13px', borderRadius: R.pill, border: 'none', cursor: 'pointer',
                  font: `500 12px ${FONT}`,
                  ...(filtre === f.cle ? { background: AL.black, color: AL.white } : { background: C.neutralBg, color: C.muted }) }}>
                {f.label}
              </button>
            ))}
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="rechercher…"
            style={{ flex: 1, minWidth: 180, maxWidth: 280, padding: '7px 14px', borderRadius: R.pill,
              border: `1px solid ${C.border}`, font: `13px ${FONT}`, outline: 'none' }} />
        </div>

        {isLoading ? <p style={{ fontSize: 13, color: C.muted }}>Chargement…</p>
          : visibles.length === 0 ? (
            <p style={{ fontSize: 13, color: C.muted }}>
              Aucun prospect{filtre !== 'tous' && filtre !== 'actifs' ? ` — filtre : ${etape(filtre).label}` : ''}.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
                <thead><tr>
                  <th style={{ ...th, width: '23%' }}>société</th>
                  <th style={{ ...th, width: '15%' }}>étape</th>
                  <th style={{ ...th, width: '19%' }}>source</th>
                  <th style={{ ...th, width: '19%' }}>dernier contact</th>
                  <th style={{ ...th, width: '15%' }}>relance</th>
                  <th style={{ ...th, width: '9%', textAlign: 'right' }}>contacts</th>
                </tr></thead>
                <tbody>
                  {visibles.map(p => {
                    const e = etape(p.stage)
                    const dernier = dernierEchange(echangesDe(p))
                    const relance = prochaineRelance(echangesDe(p))
                    const retard = relance && enRetard(relance.follow_up_on)
                    const src = source(p.source)
                    return (
                      <tr key={p.id} style={{ background: retard ? C.dangerBg : 'transparent' }}>
                        <td style={td}>
                          <Link href={`/prospects/${p.id}`} style={{ textDecoration: 'none', color: AL.black }}>
                            <div style={{ fontSize: 16, fontWeight: 500 }}>{p.name}</div>
                            <div style={{ fontSize: 12.5, color: C.muted }}>
                              {[p.city, p.owner && `suivi par ${p.owner}`].filter(Boolean).join(' · ') || '—'}
                            </div>
                          </Link>
                        </td>
                        <td style={td}>
                          <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: R.pill,
                            fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap', color: e.fg, background: e.bg }}>
                            {e.label}
                          </span>
                        </td>
                        <td style={td}>
                          {src ? <>
                            <div style={{ fontSize: 13 }}>{src.label}</div>
                            {p.source_detail && <div style={{ fontSize: 12.5, color: C.muted }}>{p.source_detail}</div>}
                          </> : <span style={{ color: C.muted }}>—</span>}
                        </td>
                        <td style={td}>
                          {dernier ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: C.muted, whiteSpace: 'nowrap' }}>
                              <span style={{ width: 7, height: 7, borderRadius: R.pill, flex: 'none', background: canal(dernier.channel).couleur }} />
                              {canal(dernier.channel).label.toLowerCase()} · {fmtDate(dernier.occurred_on)}
                            </span>
                          ) : <span style={{ fontSize: 12.5, color: C.muted, opacity: .6 }}>jamais contacté</span>}
                        </td>
                        <td style={td}>
                          {relance ? (
                            <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums',
                              ...(retard ? { color: C.danger, fontWeight: 500 } : {}) }}>
                              {fmtDate(relance.follow_up_on)}
                              {retard && ` · ${retardJours(relance.follow_up_on)} j`}
                            </span>
                          ) : <span style={{ color: C.muted }}>—</span>}
                        </td>
                        <td style={{ ...td, textAlign: 'right', fontSize: 12.5, color: C.muted, font: `12.5px ${MONO}` }}>
                          {(p.prospect_people || []).length}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
      </main>

      {creation && <ModaleNouveau onAnnuler={() => setCreation(false)} onCreer={creer} />}
    </div>
  )
}

// Création réduite au strict nécessaire : le nom. Tout le reste se remplit sur
// la fiche, où l'on voit ce qu'on saisit. Un formulaire de dix champs à la
// création est un formulaire qu'on abandonne.
function ModaleNouveau({ onAnnuler, onCreer }) {
  const [nom, setNom] = useState('')
  return (
    <div onMouseDown={e => { if (e.target === e.currentTarget) onAnnuler() }}
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(12,12,12,.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: C.surface, borderRadius: R.panel, border: `1.5px solid ${C.outline}`,
        padding: 24, width: '100%', maxWidth: 420 }}>
        <h2 style={{ font: `500 18px ${FONT}`, margin: '0 0 6px' }}>Nouveau prospect</h2>
        <p style={{ fontSize: 12.5, color: C.muted, margin: '0 0 16px' }}>
          Le nom suffit pour commencer — le reste se complète sur la fiche.
        </p>
        <input autoFocus value={nom} onChange={e => setNom(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && nom.trim()) onCreer(nom.trim()) }}
          placeholder="Nom de la société"
          style={{ width: '100%', padding: '10px 14px', borderRadius: R.panel,
            border: `1px solid ${C.border}`, font: `14px ${FONT}`, outline: 'none' }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <button onClick={onAnnuler}
            style={{ background: 'none', border: 'none', cursor: 'pointer', font: `13px ${FONT}`, color: C.muted }}>
            annuler
          </button>
          <button onClick={() => nom.trim() && onCreer(nom.trim())} disabled={!nom.trim()}
            style={{ padding: '8px 16px', borderRadius: R.pill, background: AL.black, color: AL.white,
              border: 'none', font: `500 13px ${FONT}`, cursor: 'pointer', opacity: nom.trim() ? 1 : .4 }}>
            Créer
          </button>
        </div>
      </div>
    </div>
  )
}
