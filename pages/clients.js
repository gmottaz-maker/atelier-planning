// Annuaire des sociétés.
//
// La page listait une carte PAR PERSONNE : trente contacts donnaient trente
// cartes, sans colonnes comparables, et on ne voyait pas les sociétés. Elle
// liste maintenant des SOCIÉTÉS en lignes, avec ce qu'on veut savoir d'elles —
// combien de personnes, combien de projets, le dernier en date.
//
// Les personnes n'ont pas disparu : elles sont sur la fiche de leur société, et
// celles qui n'en ont aucune ont leur propre section en bas.
import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Head from 'next/head'
import useSWR from 'swr'
import { useAuth } from './_app'
import useIsAdmin from '../lib/useIsAdmin'
import NavBar from '../components/NavBar'
import { AL, C, FONT, MONO, R, initials } from '../lib/theme'

const ROLE_TAGS = ['Client', 'Fournisseur']
const tonTag = t => t === 'Client' ? { fg: C.success, bg: C.successBg }
  : t === 'Fournisseur' ? { fg: C.warning, bg: C.warningBg }
  : { fg: C.violet, bg: C.violetBg }

const moisAnnee = s => { const [y, m] = String(s || '').slice(0, 10).split('-'); return m ? `${m}.${y}` : '' }

export default function Clients() {
  const router = useRouter()
  const { user } = useAuth()
  const isAdmin = useIsAdmin()
  useEffect(() => { if (user && !isAdmin) router.replace('/') }, [user, isAdmin, router])

  const { data: contacts, isLoading, mutate } = useSWR('/api/contacts')
  // `?light=1` : on ne veut que le nom, la date et le lien vers le contact —
  // pas les devis, qui pèsent 60 % de la réponse et portent les marges.
  const { data: projets } = useSWR('/api/projects?light=1')

  const [q, setQ] = useState('')
  const [filtre, setFiltre] = useState('toutes')

  if (user && !isAdmin) return null

  const liste = Array.isArray(contacts) ? contacts : []
  const societes = liste.filter(c => c.kind === 'company')
  const personnes = liste.filter(c => c.kind !== 'company')

  const parSociete = {}
  const sansSociete = []
  const idsSocietes = new Set(societes.map(c => String(c.id)))
  for (const p of personnes) {
    if (p.parent_id && idsSocietes.has(String(p.parent_id))) (parSociete[p.parent_id] ||= []).push(p)
    else sansSociete.push(p)
  }

  // Un projet appartient à une société par son contact de facturation, ou à
  // défaut par le nom saisi à la main — les projets d'avant les contacts n'ont
  // que ça.
  const projetsDe = (soc) => {
    const tous = Array.isArray(projets) ? projets : []
    const ids = new Set([String(soc.id), ...(parSociete[soc.id] || []).map(p => String(p.id))])
    return tous.filter(pr => (pr.client_contact_id && ids.has(String(pr.client_contact_id)))
      || (pr.client && soc.name && pr.client.trim().toLowerCase() === soc.name.trim().toLowerCase()))
  }

  const cherche = q.trim().toLowerCase()
  const correspond = (c) => {
    if (filtre === 'archivees') return !!c.archived
    if (c.archived) return false
    if (filtre === 'toutes') return true
    return (c.tags || []).includes(filtre)
  }
  const visibles = societes
    .filter(correspond)
    .filter(c => !cherche || [c.name, c.city, ...(c.tags || []),
      ...(parSociete[c.id] || []).map(p => p.name)].filter(Boolean).join(' ').toLowerCase().includes(cherche))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))

  async function creerSociete() {
    const r = await fetch('/api/contacts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'company', name: 'Nouvelle société' }),
    })
    const d = await r.json()
    if (d?.id) router.push(`/clients/${d.id}`)
    else mutate()
  }

  const th = { fontSize: 10.5, fontWeight: 500, letterSpacing: '.1em', textTransform: 'uppercase',
    color: C.muted, textAlign: 'left', padding: '0 12px 10px', borderBottom: `1.5px solid ${C.outline}` }
  const td = { padding: '15px 12px', borderTop: `1px solid ${C.border}`, verticalAlign: 'middle' }

  return (
    <div style={{ minHeight: '100vh', background: C.pageBg, fontFamily: FONT, color: C.ink }}>
      <Head><title>Contacts — Maze Project</title></Head>
      <NavBar title="Contacts">
        <button onClick={creerSociete}
          style={{ padding: '8px 16px', borderRadius: R.pill, background: AL.black, color: AL.white,
            border: 'none', font: `500 13px ${FONT}`, cursor: 'pointer' }}>
          + société
        </button>
      </NavBar>

      <main style={{ padding: '32px 40px 104px', maxWidth: 1600, margin: '0 auto' }}>
        <h1 style={{ font: `500 34px ${FONT}`, letterSpacing: '-.02em', margin: '0 0 4px' }}>
          nos <span style={{ color: C.accent }}>contacts</span>
        </h1>
        <p style={{ fontSize: 13, color: C.muted, margin: '0 0 22px' }}>
          {societes.length} société{societes.length > 1 ? 's' : ''} · {personnes.length} personne{personnes.length > 1 ? 's' : ''}
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
          {[{ c: 'toutes', l: 'Toutes' }, ...ROLE_TAGS.map(t => ({ c: t, l: t + 's' })), { c: 'archivees', l: 'Archivées' }]
            .map(f => (
              <button key={f.c} onClick={() => setFiltre(f.c)}
                style={{ padding: '6px 13px', borderRadius: R.pill, border: 'none', cursor: 'pointer', font: `500 12px ${FONT}`,
                  ...(filtre === f.c ? { background: AL.black, color: AL.white } : { background: C.neutralBg, color: C.muted }) }}>
                {f.l}
              </button>
            ))}
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="rechercher une société ou une personne…"
            style={{ flex: 1, minWidth: 200, maxWidth: 320, padding: '7px 14px', borderRadius: R.pill,
              border: `1px solid ${C.border}`, font: `13px ${FONT}`, outline: 'none' }} />
        </div>

        {isLoading ? <p style={{ fontSize: 13, color: C.muted }}>Chargement…</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
              <thead><tr>
                <th style={{ ...th, width: '30%' }}>société</th>
                <th style={{ ...th, width: '18%' }}>tags</th>
                <th style={{ ...th, width: '16%' }}>contacts</th>
                <th style={{ ...th, width: '18%' }}>projets</th>
                <th style={{ ...th, width: '18%' }}>dernier projet</th>
              </tr></thead>
              <tbody>
                {visibles.map(soc => {
                  const gens = parSociete[soc.id] || []
                  const prj = projetsDe(soc)
                  const enCours = prj.filter(p => p.status === 'active').length
                  const dernier = [...prj].sort((a, b) => String(b.deadline || '').localeCompare(String(a.deadline || '')))[0]
                  return (
                    <tr key={soc.id}>
                      <td style={td}>
                        <Link href={`/clients/${soc.id}`} style={{ textDecoration: 'none', color: AL.black }}>
                          <div style={{ fontSize: 16, fontWeight: 500 }}>{soc.name}</div>
                          <div style={{ fontSize: 12.5, color: C.muted }}>{soc.city || '—'}</div>
                        </Link>
                      </td>
                      <td style={td}>
                        <span style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          {(soc.tags || []).length === 0 && <span style={{ color: C.muted }}>—</span>}
                          {(soc.tags || []).map(t => {
                            const ton = tonTag(t)
                            return (
                              <span key={t} style={{ padding: '3px 10px', borderRadius: R.pill, fontSize: 11,
                                fontWeight: 500, color: ton.fg, background: ton.bg, whiteSpace: 'nowrap' }}>{t}</span>
                            )
                          })}
                        </span>
                      </td>
                      <td style={{ ...td, fontSize: 12.5, color: C.muted }}>
                        {gens.length ? `${gens.length} personne${gens.length > 1 ? 's' : ''}` : '—'}
                      </td>
                      <td style={{ ...td, fontSize: 12.5, color: C.muted }}>
                        {prj.length ? `${prj.length} projet${prj.length > 1 ? 's' : ''}${enCours ? ` · ${enCours} en cours` : ''}` : '—'}
                      </td>
                      <td style={{ ...td, fontSize: 13 }}>
                        {dernier ? <>{dernier.name} <span style={{ color: C.muted, font: `12px ${MONO}` }}>{moisAnnee(dernier.deadline)}</span></>
                          : <span style={{ color: C.muted }}>—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {visibles.length === 0 && <p style={{ fontSize: 13, color: C.muted, paddingTop: 18 }}>Aucune société.</p>}
          </div>
        )}

        {/* Les personnes sans société ne doivent pas disparaître de l'annuaire
            sous prétexte qu'il est désormais organisé par société. */}
        {sansSociete.length > 0 && filtre !== 'archivees' && (
          <div style={{ marginTop: 40 }}>
            <h2 style={{ font: `500 10.5px ${MONO}`, letterSpacing: '.1em', textTransform: 'uppercase',
              color: C.muted, margin: '0 0 12px' }}>
              Personnes sans société ({sansSociete.length})
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {sansSociete.filter(p => !p.archived).map(p => (
                <Link key={p.id} href={`/clients/${p.id}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 14px 8px 8px',
                    borderRadius: R.pill, border: `1px solid ${C.border}`, textDecoration: 'none', color: AL.black }}>
                  <span style={{ width: 26, height: 26, borderRadius: R.pill, background: AL.black, color: AL.white,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', font: `500 10px ${FONT}` }}>
                    {initials(p.name)}
                  </span>
                  <span style={{ fontSize: 13 }}>{p.name}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
