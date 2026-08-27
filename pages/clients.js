import { useState, useEffect } from 'react'
import { useAuth } from './_app'
import useIsAdmin from '../lib/useIsAdmin'
import { useRouter } from 'next/router'
import useSWR from 'swr'
import Head from 'next/head'
import Link from 'next/link'
import { AL, C, FONT, MONO, R, initials } from '../lib/theme'
import ButtonPill from '../components/ButtonPill'

const Icon = ({ d, ...p }) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>{d}</svg>
const EditIcon = <Icon d={<><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></>} />
const TagIcon  = <Icon d={<><path d="M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L3 13V3h10l7.59 7.59a2 2 0 0 1 0 2.82z" /><circle cx="7.5" cy="7.5" r="1" /></>} />
const TrashIcon = <Icon d={<><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></>} />
const ArchiveIcon = <Icon d={<><path d="M21 8v13H3V8" /><path d="M1 3h22v5H1z" /><path d="M10 12h4" /></>} />

function ActionBtn({ children, title, onClick, danger }) {
  return (
    <button title={title} onClick={onClick}
      style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: R.pill, border: 'none', background: 'transparent', color: C.muted, cursor: 'pointer', flex: 'none' }}
      onMouseEnter={e => { e.currentTarget.style.background = danger ? C.dangerBg : C.hover; e.currentTarget.style.color = danger ? C.danger : AL.black }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.muted }}>
      {children}
    </button>
  )
}

const ROLE_TAGS = ['Client', 'Fournisseur']
const catColor = t => t === 'Client' ? C.success : t === 'Fournisseur' ? C.warning : C.violet
const catBg    = t => t === 'Client' ? C.successBg : t === 'Fournisseur' ? C.warningBg : C.violetBg

export default function Clients() {
  // Réservé à l'admin : la barre latérale masque déjà l'entrée, mais la page
  // restait atteignable par URL.
  const { user } = useAuth()
  const isAdmin = useIsAdmin()
  useEffect(() => { if (user && !isAdmin) router.replace('/') }, [user, isAdmin])
  if (user && !isAdmin) return null
  const router = useRouter()
  const { data: contacts = [], isLoading, mutate } = useSWR('/api/contacts')
  const list = Array.isArray(contacts) ? contacts : []
  const [q, setQ] = useState('')
  const [cat, setCat] = useState(null)          // null = toutes catégories | nom de tag
  const [tagEditId, setTagEditId] = useState(null)
  const [tagInput, setTagInput] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  const companies = list.filter(c => c.kind === 'company')
  const persons   = list.filter(c => c.kind !== 'company')
  const byId = Object.fromEntries(list.map(c => [String(c.id), c]))
  const personsByParent = {}
  const standalone = []
  for (const p of persons) {
    if (p.parent_id && byId[String(p.parent_id)]) (personsByParent[p.parent_id] ||= []).push(p)
    else standalone.push(p)
  }
  const hasTag = (c, t) => !!c && (c.tags || []).includes(t)

  async function patch(c, body) {
    mutate(list.map(x => x.id === c.id ? { ...x, ...body } : x), false)
    try { await fetch(`/api/contacts?id=${c.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }
    finally { mutate() }
  }
  function toggleTag(e, c, t) { e.preventDefault(); e.stopPropagation(); patch(c, { tags: hasTag(c, t) ? (c.tags || []).filter(x => x !== t) : [...(c.tags || []), t] }) }
  function archive(e, c) { e.preventDefault(); e.stopPropagation(); patch(c, { archived: !c.archived }) }
  function openTag(e, c) { e.preventDefault(); e.stopPropagation(); setTagEditId(tagEditId === c.id ? null : c.id); setTagInput('') }
  function addTag(c, t) { const tag = (t || '').trim(); if (tag && !(c.tags || []).includes(tag)) patch(c, { tags: [...(c.tags || []), tag] }); setTagInput('') }
  function removeTag(c, t) { patch(c, { tags: (c.tags || []).filter(x => x !== t) }) }
  async function del(e, c) {
    e.preventDefault(); e.stopPropagation()
    if (!confirm(`Supprimer « ${c.name} » ?`)) return
    mutate(list.filter(x => x.id !== c.id), false)
    try { await fetch(`/api/contacts?id=${c.id}`, { method: 'DELETE' }) } finally { mutate() }
  }
  async function nouveau() {
    const res = await fetch('/api/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'company', name: 'Nouvelle société' }) })
    const created = await res.json()
    if (created?.id) router.push(`/clients/${created.id}`)
  }

  // Cartes : 1 par personne si la société a des contacts, sinon 1 par société
  const wanted = c => showArchived ? c.archived : !c.archived
  const items = []
  for (const co of companies) {
    const kids = (personsByParent[co.id] || []).filter(wanted)
    if (kids.length) kids.forEach(p => items.push({ c: p, company: co }))
    else if (wanted(co)) items.push({ c: co, company: null })
  }
  standalone.filter(wanted).forEach(p => items.push({ c: p, company: null }))

  const needle = q.trim().toLowerCase()
  function matchItem(it) {
    const c = it.c, co = it.company
    if (cat && !(hasTag(c, cat) || hasTag(co, cat))) return false
    if (needle) {
      const hay = [c.name, c.email, c.city, co?.name].filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(needle)) return false
    }
    return true
  }
  const visible = items.filter(matchItem).sort((a, b) => {
    const ka = (a.company?.name || a.c.name || '').toLowerCase()
    const kb = (b.company?.name || b.c.name || '').toLowerCase()
    return ka < kb ? -1 : ka > kb ? 1 : (a.c.name || '').localeCompare(b.c.name || '')
  })

  // Catégories (rail) : Client, Fournisseur, puis tags perso — avec compteurs sur contacts actifs
  const activeContacts = list.filter(c => !c.archived)
  const tagCount = t => activeContacts.filter(c => hasTag(c, t)).length
  const customTags = [...new Set(activeContacts.flatMap(c => c.tags || []))].filter(t => !ROLE_TAGS.includes(t)).sort()
  const categories = [...ROLE_TAGS, ...customTags]
  const nArchived = list.filter(c => c.archived).length

  function Ligne({ it }) {
    const c = it.c, co = it.company
    const isPerson = c.kind !== 'company'
    const sub = isPerson ? (co?.name || 'Sans société') : (c.city || '—')
    const nPersons = isPerson ? 0 : (personsByParent[String(c.id)] || []).length
    const editing = tagEditId === c.id
    return (
      <div className="group" style={{ display: 'flex', flexDirection: 'column', borderTop: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 4px' }}>
          <Link href={`/clients/${c.id}`} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none', color: AL.black }}>
            {/* Rond pour une personne, carré adouci pour une société : la forme
                dit le type, sans avoir à l'écrire. */}
            <div style={{ width: 28, height: 28, borderRadius: isPerson ? '50%' : 6, background: C.neutralBg, color: C.muted,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flex: 'none' }}>{initials(c.name)}</div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ fontSize: 15, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
              <span style={{ fontSize: 12.5, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</span>
            </div>
          </Link>

          <div style={{ display: 'flex', gap: 6, flex: 'none', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {/* Un rôle attribué est toujours visible ; un rôle NON attribué
                n'apparaît qu'au survol de la ligne. Sinon chaque ligne porte
                deux chips dont une inutile, et la colonne devient du bruit —
                le prototype ne montre que les catégories réellement posées. */}
            {ROLE_TAGS.map(rt => {
              const active = hasTag(c, rt)
              return (
                <button key={rt} onClick={e => toggleTag(e, c, rt)}
                  className={active ? undefined : 'opacity-0 group-hover:opacity-100 transition-opacity'}
                  style={{ fontSize: 11, fontWeight: 500, letterSpacing: '.04em', padding: '3px 10px', borderRadius: R.pill, cursor: 'pointer', flex: 'none',
                    fontFamily: FONT,
                    color: active ? catColor(rt) : C.muted, background: active ? catBg(rt) : 'transparent',
                    border: `1px solid ${active ? 'transparent' : C.border}` }}>{rt}</button>
              )
            })}
            {(c.tags || []).filter(t => !ROLE_TAGS.includes(t)).map(t => (
              <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 500, letterSpacing: '.04em',
                color: C.violet, background: C.violetBg, padding: '3px 6px 3px 10px', borderRadius: R.pill }}>
                {t}<button onClick={() => removeTag(c, t)} style={{ border: 'none', background: 'none', color: C.violet, cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
              </span>
            ))}
          </div>

          <span style={{ font: `11px ${MONO}`, color: C.muted, width: 32, textAlign: 'right', flex: 'none' }}>
            {nPersons > 0 ? nPersons : ''}
          </span>

          <div style={{ display: 'flex', gap: 2, flex: 'none' }} className="opacity-0 group-hover:opacity-100 transition-opacity">
            <ActionBtn title="Tagguer" onClick={e => openTag(e, c)}>{TagIcon}</ActionBtn>
            <ActionBtn title="Modifier" onClick={() => router.push(`/clients/${c.id}`)}>{EditIcon}</ActionBtn>
            <ActionBtn title={c.archived ? 'Désarchiver' : 'Archiver'} onClick={e => archive(e, c)}>{ArchiveIcon}</ActionBtn>
            <ActionBtn title="Supprimer" danger onClick={e => del(e, c)}>{TrashIcon}</ActionBtn>
          </div>
        </div>

        {editing && (
          <div style={{ padding: '0 4px 12px' }}>
            <input autoFocus list="tag-suggestions" value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addTag(c, tagInput); if (e.key === 'Escape') setTagEditId(null) }}
              placeholder="Ajouter une catégorie (Entrée)…"
              style={{ width: 280, padding: '6px 14px', borderRadius: R.pill, border: `1.5px dashed ${C.outline}`, font: `12px ${FONT}`, background: C.surface, outline: 'none' }} />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: C.pageBg, fontFamily: FONT, color: C.ink }}>
      <Head><title>Contacts — Maze Project</title></Head>
      <datalist id="tag-suggestions">{[...new Set(list.flatMap(c => c.tags || []))].sort().map(t => <option key={t} value={t} />)}</datalist>

      <main style={{ padding: '32px 40px 104px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <h1 style={{ fontSize: 38, fontWeight: 500, lineHeight: 1.05, letterSpacing: '-.01em', margin: 0, color: AL.black }}>Contacts</h1>
          <p style={{ fontSize: 18, color: C.muted, margin: '12px 0 0' }}>
            {companies.length} société{companies.length > 1 ? 's' : ''} · {persons.length} personne{persons.length > 1 ? 's' : ''}
            {cat ? ` · ${cat.toLowerCase()}` : ''}
          </p>
        </div>

        {/* Recherche + catégories.
            Le rail de 190px de la v1 disparaît : le prototype v2 met les
            catégories en chips, ce qui rend la largeur au contenu. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher…"
              style={{ width: 220, padding: '9px 16px', borderRadius: R.pill, border: `1.5px solid ${C.outline}`,
                fontFamily: FONT, fontSize: 13.5, background: C.surface, color: AL.black, outline: 'none' }} />

            {[{ t: null, label: 'toutes', n: activeContacts.length }, ...categories.map(t => ({ t, label: t, n: tagCount(t) }))].map(item => {
              const actif = cat === item.t
              return (
                <button key={item.label} onClick={() => setCat(actif && item.t ? null : item.t)}
                  style={{ fontFamily: FONT, fontSize: 12, fontWeight: actif ? 500 : 400, padding: '6px 13px', borderRadius: R.pill,
                    border: 'none', cursor: 'pointer',
                    background: actif ? AL.black : C.neutralBg, color: actif ? AL.white : C.muted }}>
                  {item.label}{item.n ? ` ${item.n}` : ''}
                </button>
              )
            })}

            <button onClick={() => setShowArchived(v => !v)}
              style={{ fontFamily: FONT, fontSize: 12, padding: '6px 13px', borderRadius: R.pill, cursor: 'pointer',
                border: `1.5px dashed ${C.outline}`, background: 'transparent',
                color: showArchived ? AL.black : C.muted }}>
              {showArchived ? '← actifs' : `archivés${nArchived ? ` ${nArchived}` : ''}`}
            </button>
          </div>

          <ButtonPill onClick={nouveau}>+ nouveau contact</ButtonPill>
        </div>

        {isLoading ? (
          <p style={{ color: C.muted, fontSize: 13, padding: '40px 0', textAlign: 'center' }}>Chargement…</p>
        ) : visible.length === 0 ? (
          <p style={{ color: C.muted, fontSize: 13, padding: '40px 0', textAlign: 'center' }}>Aucun contact.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {visible.map(it => <Ligne key={it.c.id} it={it} />)}
          </div>
        )}
      </main>
    </div>
  )
}
