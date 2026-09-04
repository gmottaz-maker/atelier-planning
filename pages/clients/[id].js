// Fiche société — et fiche personne, la même page servant les deux.
//
// Reprend la mise en page de la fiche prospect : ce qu'on lit à gauche, ce
// qu'on consulte à droite. L'ancienne version était un formulaire de quinze
// champs empilés, où le nom de la société avait le même poids visuel que son
// numéro de TVA.
//
// Une société convertie depuis un prospect affiche le JOURNAL de son
// démarchage. C'est ce qui explique pourquoi ce client existe — par quel canal
// il est arrivé, en combien de relances, sur quelle recommandation.
import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Head from 'next/head'
import useSWR from 'swr'
import { useAuth } from '../_app'
import useIsAdmin from '../../lib/useIsAdmin'
import NavBar from '../../components/NavBar'
import { AL, C, FONT, MONO, R, initials } from '../../lib/theme'
import { canal, source } from '../../lib/prospects'
import { jourLocal } from '../../lib/aujourdhui'

const fmtJour = s => { const [y, m, d] = String(s || '').slice(0, 10).split('-'); return d ? `${d}.${m}` : '' }
const fmtDate = s => { const [y, m, d] = String(s || '').slice(0, 10).split('-'); return d ? `${d}.${m}.${y}` : '—' }
const tonTag = t => t === 'Client' ? { fg: C.success, bg: C.successBg }
  : t === 'Fournisseur' ? { fg: C.warning, bg: C.warningBg }
  : { fg: C.violet, bg: C.violetBg }

export default function FicheContact() {
  const router = useRouter()
  const { id } = router.query
  const { user } = useAuth()
  const isAdmin = useIsAdmin()
  useEffect(() => { if (user && !isAdmin) router.replace('/') }, [user, isAdmin, router])

  const { data: contacts, mutate } = useSWR('/api/contacts')
  const { data: projets } = useSWR('/api/projects?light=1')
  // Le journal du démarchage, s'il y en a eu un. Filtré côté serveur : sans ça
  // la fiche chargerait tous les prospects pour en garder un seul.
  const { data: prospectsLies } = useSWR(id ? `/api/prospects?converted_to=${id}` : null)

  const [tagSaisie, setTagSaisie] = useState('')

  if (user && !isAdmin) return null

  const liste = Array.isArray(contacts) ? contacts : []
  const c = liste.find(x => String(x.id) === String(id))
  if (!c) {
    return (
      <div style={{ minHeight: '100vh', background: C.pageBg, fontFamily: FONT }}>
        <NavBar title="Contact" />
        <main style={{ padding: 40 }}><p style={{ fontSize: 13, color: C.muted }}>Chargement…</p></main>
      </div>
    )
  }

  const estSociete = c.kind === 'company'
  const societe = !estSociete && c.parent_id ? liste.find(x => String(x.id) === String(c.parent_id)) : null
  const gens = estSociete
    ? liste.filter(x => String(x.parent_id) === String(id)).sort((a, b) => String(a.name).localeCompare(String(b.name)))
    : []
  const societes = liste.filter(x => x.kind === 'company').sort((a, b) => String(a.name).localeCompare(String(b.name)))
  const demarchage = (Array.isArray(prospectsLies) ? prospectsLies : [])[0] || null

  const idsRattaches = new Set([String(c.id), ...gens.map(p => String(p.id))])
  const projetsLies = (Array.isArray(projets) ? projets : []).filter(pr =>
    (pr.client_contact_id && idsRattaches.has(String(pr.client_contact_id)))
    || (pr.client && c.name && pr.client.trim().toLowerCase() === c.name.trim().toLowerCase()))
    .sort((a, b) => String(b.deadline || '').localeCompare(String(a.deadline || '')))

  async function patch(champs) {
    mutate(liste.map(x => x.id === c.id ? { ...x, ...champs } : x), false)
    await fetch(`/api/contacts?id=${c.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(champs),
    })
    mutate()
  }

  async function ajouterPersonne() {
    const r = await fetch('/api/contacts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'person', name: 'Nouveau contact', parent_id: Number(id) }),
    })
    const d = await r.json()
    mutate()
    if (d?.id) router.push(`/clients/${d.id}`)
  }

  const echanges = [...(demarchage?.prospect_interactions || [])]
    .sort((a, b) => String(b.occurred_on).localeCompare(String(a.occurred_on)))

  return (
    <div style={{ minHeight: '100vh', background: C.pageBg, fontFamily: FONT, color: C.ink }}>
      <Head><title>{c.name} — Contacts</title></Head>
      <NavBar title={estSociete ? 'Société' : 'Contact'}>
        <button onClick={() => patch({ archived: !c.archived })}
          style={{ padding: '8px 16px', borderRadius: R.pill, background: 'none', cursor: 'pointer',
            border: `1px solid ${C.border}`, color: C.muted, font: `500 13px ${FONT}` }}>
          {c.archived ? 'Désarchiver' : 'Archiver'}
        </button>
      </NavBar>

      <main style={{ padding: '32px 40px 104px', maxWidth: 1400, margin: '0 auto' }}>
        <Link href="/clients" style={{ fontSize: 12.5, color: C.muted, textDecoration: 'none' }}>← tous les contacts</Link>

        <div style={{ margin: '14px 0 22px' }}>
          <ChampTitre valeur={c.name} onValider={v => patch({ name: v })} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            {!estSociete && (
              <span style={{ fontSize: 13, color: C.muted }}>
                {societe ? <>chez <Link href={`/clients/${societe.id}`} style={{ color: AL.black }}>{societe.name}</Link></> : 'sans société'}
              </span>
            )}
            {estSociete && c.city && <span style={{ fontSize: 13, color: C.muted }}>{c.city}</span>}
            {(c.tags || []).map(t => {
              const ton = tonTag(t)
              return (
                <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px',
                  borderRadius: R.pill, fontSize: 11, fontWeight: 500, color: ton.fg, background: ton.bg }}>
                  {t}
                  <button onClick={() => patch({ tags: (c.tags || []).filter(x => x !== t) })}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: ton.fg, padding: 0, fontSize: 11 }}>✕</button>
                </span>
              )
            })}
            <input value={tagSaisie} onChange={e => setTagSaisie(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && tagSaisie.trim()) {
                  patch({ tags: [...new Set([...(c.tags || []), tagSaisie.trim()])] }); setTagSaisie('')
                }
              }}
              placeholder="+ tag"
              style={{ width: 80, padding: '3px 10px', borderRadius: R.pill, border: `1px dashed ${C.border}`,
                font: `11px ${FONT}`, outline: 'none', color: C.muted }} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 28, alignItems: 'start' }}>
          <div>
            <Bloc titre={`Projets (${projetsLies.length})`}>
              {projetsLies.length === 0
                ? <p style={{ fontSize: 13, color: C.muted, padding: '14px 0' }}>Aucun projet rattaché.</p>
                : projetsLies.map(pr => (
                  <Link key={pr.id} href={`/projects/${pr.id}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0',
                      borderTop: `1px solid ${C.border}`, textDecoration: 'none', color: AL.black }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 500 }}>{pr.name}</span>
                    <span style={{ font: `12px ${MONO}`, color: C.muted }}>{fmtDate(pr.deadline)}</span>
                    <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: R.pill,
                      background: pr.status === 'active' ? C.neutralBg : 'transparent',
                      color: pr.status === 'active' ? AL.black : C.muted }}>
                      {pr.status === 'active' ? 'actif' : 'archivé'}
                    </span>
                  </Link>
                ))}
            </Bloc>

            {demarchage && (
              <div style={{ marginTop: 24 }}>
                <Bloc titre="Comment ce client est arrivé">
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline',
                    padding: '12px 0', borderTop: `1px solid ${C.border}` }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{source(demarchage.source)?.label || 'Source inconnue'}</span>
                    {demarchage.source_detail && <span style={{ fontSize: 13, color: C.muted }}>{demarchage.source_detail}</span>}
                    <span style={{ marginLeft: 'auto', fontSize: 12.5, color: C.muted }}>
                      {echanges.length} échange{echanges.length > 1 ? 's' : ''} · converti le {fmtDate(jourLocal(demarchage.converted_at))}
                    </span>
                  </div>
                  {echanges.map(x => (
                    <div key={x.id} style={{ display: 'flex', gap: 14, padding: '12px 0', borderTop: `1px solid ${C.border}` }}>
                      <div style={{ width: 52, flex: 'none', font: `12px ${MONO}`, color: C.muted }}>{fmtJour(x.occurred_on)}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 7, height: 7, borderRadius: R.pill, background: canal(x.channel).couleur, flex: 'none' }} />
                          <b style={{ fontSize: 13, fontWeight: 500 }}>{canal(x.channel).label}</b>
                          {x.author && <span style={{ fontSize: 12, color: C.muted }}>· par {x.author}</span>}
                        </span>
                        {x.notes && <div style={{ fontSize: 13.5, lineHeight: 1.45, marginTop: 4 }}>{x.notes}</div>}
                      </div>
                    </div>
                  ))}
                </Bloc>
              </div>
            )}
          </div>

          <div>
            {estSociete && (
              <Panneau titre={`Personnes (${gens.length})`}>
                {gens.map(p => (
                  <Link key={p.id} href={`/clients/${p.id}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0',
                      borderTop: `1px solid ${C.border}`, textDecoration: 'none', color: AL.black }}>
                    <span style={{ width: 28, height: 28, borderRadius: R.pill, background: AL.black, color: AL.white,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', font: `500 10px ${FONT}`, flex: 'none' }}>
                      {initials(p.name)}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 500 }}>{p.name}</span>
                      <span style={{ display: 'block', fontSize: 11.5, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {[p.email, p.phone].filter(Boolean).join(' · ') || '—'}
                      </span>
                    </span>
                  </Link>
                ))}
                {gens.length === 0 && <p style={{ fontSize: 12.5, color: C.muted }}>Aucune personne rattachée.</p>}
                <button onClick={ajouterPersonne}
                  style={{ marginTop: 10, background: 'none', border: 'none', cursor: 'pointer',
                    font: `500 12px ${FONT}`, color: C.violet }}>
                  + ajouter une personne
                </button>
              </Panneau>
            )}

            {!estSociete && (
              <Panneau titre="Société">
                <select value={c.parent_id || ''} onChange={e => patch({ parent_id: e.target.value ? Number(e.target.value) : null })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: R.panel, border: `1px solid ${C.border}`,
                    font: `14px ${FONT}`, outline: 'none', background: C.surface }}>
                  <option value="">— sans société —</option>
                  {societes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Panneau>
            )}

            <Panneau titre="Coordonnées">
              {[['E-mail', 'email'], ['Téléphone', 'phone'], ['Site', 'website'],
                ['Adresse', 'street'], ['NPA', 'zip'], ['Ville', 'city'], ['Pays', 'country'],
                ...(estSociete ? [['N° TVA', 'vat_number']] : [])]
                .map(([label, cle]) => (
                  <LigneEditable key={cle} label={label} valeur={c[cle]} onValider={v => patch({ [cle]: v })} />
                ))}
            </Panneau>

            <Panneau titre="Notes">
              <ZoneNotes valeur={c.notes} onValider={v => patch({ notes: v })} />
            </Panneau>
          </div>
        </div>
      </main>
    </div>
  )
}

// ─── Sous-composants ────────────────────────────────────────────────────────

function Bloc({ titre, children }) {
  return (
    <div style={{ border: `1.5px solid ${C.outline}`, borderRadius: R.panel, overflow: 'hidden' }}>
      <div style={{ padding: '13px 18px', borderBottom: `1px solid ${C.border}` }}>
        <h3 style={{ margin: 0, font: `500 15px ${FONT}` }}>{titre}</h3>
      </div>
      <div style={{ padding: '2px 18px 14px' }}>{children}</div>
    </div>
  )
}

function Panneau({ titre, children }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: R.panel, padding: '16px 18px', marginBottom: 18 }}>
      <h4 style={{ margin: '0 0 12px', font: `500 10.5px ${MONO}`, letterSpacing: '.1em',
        textTransform: 'uppercase', color: C.muted }}>{titre}</h4>
      {children}
    </div>
  )
}

// Édition sur place, comme sur la fiche prospect : on clique, on tape, on
// quitte le champ. L'ancienne fiche demandait un bouton « enregistrer » pour
// corriger une faute dans un numéro de téléphone.
function LigneEditable({ label, valeur, onValider }) {
  const [v, setV] = useState(null)
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', fontSize: 13 }}>
      <span style={{ color: C.muted, flex: 'none' }}>{label}</span>
      <input value={v ?? (valeur || '')} onChange={e => setV(e.target.value)}
        onBlur={() => { if (v !== null && v !== (valeur || '')) onValider(v); setV(null) }}
        onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
        placeholder="—"
        style={{ flex: 1, minWidth: 0, textAlign: 'right', border: 'none', background: 'none',
          font: `13px ${FONT}`, color: AL.black, outline: 'none' }} />
    </div>
  )
}

function ZoneNotes({ valeur, onValider }) {
  const [v, setV] = useState(null)
  return (
    <textarea rows={4} value={v ?? (valeur || '')} onChange={e => setV(e.target.value)}
      onBlur={() => { if (v !== null && v !== (valeur || '')) onValider(v); setV(null) }}
      placeholder="Contexte, historique, ce qu'il ne faut pas oublier…"
      style={{ width: '100%', padding: '9px 12px', borderRadius: R.panel, border: `1px solid ${C.border}`,
        font: `13px ${FONT}`, outline: 'none', resize: 'vertical', lineHeight: 1.45 }} />
  )
}

function ChampTitre({ valeur, onValider }) {
  const [v, setV] = useState(null)
  return (
    <input value={v ?? (valeur || '')} onChange={e => setV(e.target.value)}
      onBlur={() => { if (v !== null && v.trim() && v !== valeur) onValider(v.trim()); setV(null) }}
      onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
      style={{ width: '100%', border: 'none', background: 'none', outline: 'none',
        font: `500 28px ${FONT}`, letterSpacing: '-.02em', color: AL.black, padding: 0 }} />
  )
}
