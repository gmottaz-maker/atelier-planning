import { useState } from 'react'
import { useRouter } from 'next/router'
import useSWR from 'swr'
import Head from 'next/head'
import Link from 'next/link'
import { C, FONT, MONO, initials } from '../lib/theme'

// ── Icônes ──
const Icon = ({ d, ...p }) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>{d}</svg>
const EditIcon = <Icon d={<><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></>} />
const TagIcon  = <Icon d={<><path d="M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L3 13V3h10l7.59 7.59a2 2 0 0 1 0 2.82z" /><circle cx="7.5" cy="7.5" r="1" /></>} />
const TrashIcon = <Icon d={<><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></>} />
const ArchiveIcon = <Icon d={<><path d="M21 8v13H3V8" /><path d="M1 3h22v5H1z" /><path d="M10 12h4" /></>} />

function ActionBtn({ children, title, onClick, danger }) {
  return (
    <button title={title} onClick={onClick}
      style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: 'none', background: 'transparent', color: C.muted, cursor: 'pointer', flex: 'none' }}
      onMouseEnter={e => { e.currentTarget.style.background = danger ? C.dangerBg : C.divider; e.currentTarget.style.color = danger ? C.danger : C.ink }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.muted }}>
      {children}
    </button>
  )
}

export default function Clients() {
  const router = useRouter()
  const { data: contacts = [], isLoading, mutate } = useSWR('/api/contacts')
  const list = Array.isArray(contacts) ? contacts : []
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')     // all | customer | supplier
  const [tagFilter, setTagFilter] = useState(null)
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
  const allTags = [...new Set(list.flatMap(c => c.tags || []))].sort()

  const ROLE_TAGS = ['Client', 'Fournisseur']
  const roleStyle = t => t === 'Client' ? { fg: C.success, bg: C.successBg } : { fg: C.warning, bg: C.warningBg }
  const hasTag = (c, t) => !!c && (c.tags || []).includes(t)

  async function patch(c, body) {
    mutate(list.map(x => x.id === c.id ? { ...x, ...body } : x), false)
    try { await fetch(`/api/contacts?id=${c.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }
    finally { mutate() }
  }
  function toggleTag(e, c, t) { e.preventDefault(); e.stopPropagation(); patch(c, { tags: hasTag(c, t) ? (c.tags || []).filter(x => x !== t) : [...(c.tags || []), t] }) }
  async function del(e, c) {
    e.preventDefault(); e.stopPropagation()
    if (!confirm(`Supprimer « ${c.name} » ?`)) return
    mutate(list.filter(x => x.id !== c.id), false)
    try { await fetch(`/api/contacts?id=${c.id}`, { method: 'DELETE' }) } finally { mutate() }
  }
  function archive(e, c) { e.preventDefault(); e.stopPropagation(); patch(c, { archived: !c.archived }) }
  function openTag(e, c) { e.preventDefault(); e.stopPropagation(); setTagEditId(tagEditId === c.id ? null : c.id); setTagInput('') }
  function addTag(c, t) { const tag = (t || '').trim(); if (tag && !(c.tags || []).includes(tag)) patch(c, { tags: [...(c.tags || []), tag] }); setTagInput('') }
  function removeTag(c, t) { patch(c, { tags: (c.tags || []).filter(x => x !== t) }) }
  async function nouveau() {
    const res = await fetch('/api/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'company', name: 'Nouvelle société' }) })
    const created = await res.json()
    if (created?.id) router.push(`/clients/${created.id}`)
  }

  // ── Construire les cartes : 1 par personne si la société a des contacts, sinon 1 par société ──
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
    if (filter === 'customer' && !(hasTag(c, 'Client') || hasTag(co, 'Client'))) return false
    if (filter === 'supplier' && !(hasTag(c, 'Fournisseur') || hasTag(co, 'Fournisseur'))) return false
    if (tagFilter && !((c.tags || []).includes(tagFilter) || (co?.tags || []).includes(tagFilter))) return false
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

  const active = list.filter(c => !c.archived)
  const nCust = active.filter(c => hasTag(c, 'Client')).length
  const nSup  = active.filter(c => hasTag(c, 'Fournisseur')).length
  const nArchived = list.filter(c => c.archived).length
  const tab = (k, label, n) => (
    <button onClick={() => setFilter(k)} key={k}
      style={{ padding: '6px 14px', cursor: 'pointer', border: 'none', font: `${filter === k ? 600 : 400} 12px ${FONT}`,
        background: filter === k ? C.ink : C.surface, color: filter === k ? '#fff' : C.inkSecondary, borderLeft: k !== 'all' ? `1px solid ${C.border}` : 'none' }}>
      {label}{n != null ? ` · ${n}` : ''}
    </button>
  )

  const GRID = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }

  function Card({ it }) {
    const c = it.c, co = it.company
    const isPerson = c.kind !== 'company'
    const sub = isPerson ? (co?.name || 'Sans société') : (c.city || '—')
    const contact = [c.email, c.phone].filter(Boolean).join('  ·  ')
    const editing = tagEditId === c.id
    return (
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 9 }}>
        {/* Ligne 1 : identité + actions */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <Link href={`/clients/${c.id}`} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: C.ink }}>
            <div style={{ width: 34, height: 34, borderRadius: isPerson ? '50%' : 9, background: C.ink, color: C.accentOnDark, display: 'flex', alignItems: 'center', justifyContent: 'center', font: `11px ${MONO}`, fontWeight: 700, flex: 'none' }}>{initials(c.name)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
              <div style={{ font: `10.5px ${MONO}`, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>
            </div>
          </Link>
          <div style={{ display: 'flex', gap: 2, flex: 'none' }}>
            <ActionBtn title="Tagguer" onClick={e => openTag(e, c)}>{TagIcon}</ActionBtn>
            <ActionBtn title="Modifier" onClick={() => router.push(`/clients/${c.id}`)}>{EditIcon}</ActionBtn>
            <ActionBtn title={c.archived ? 'Désarchiver' : 'Archiver'} onClick={e => archive(e, c)}>{ArchiveIcon}</ActionBtn>
            <ActionBtn title="Supprimer" danger onClick={e => del(e, c)}>{TrashIcon}</ActionBtn>
          </div>
        </div>

        {/* Coordonnées */}
        <div style={{ font: `11px ${MONO}`, color: contact ? C.inkTertiary : C.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact || 'pas de coordonnées'}</div>

        {/* Rôles (= tags Client/Fournisseur togglables) + autres tags */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          {ROLE_TAGS.map(rt => {
            const on = roleStyle(rt), active = hasTag(c, rt)
            return (
              <button key={rt} onClick={e => toggleTag(e, c, rt)}
                style={{ font: `9.5px ${MONO}`, padding: '2px 8px', borderRadius: 99, cursor: 'pointer', flex: 'none', textTransform: 'uppercase',
                  color: active ? on.fg : C.faint, background: active ? on.bg : 'transparent', border: `1px solid ${active ? 'transparent' : C.border}` }}>{rt}</button>
            )
          })}
          {(c.tags || []).filter(t => !ROLE_TAGS.includes(t)).map(t => (
            <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, color: C.violet, background: C.violetBg, padding: '2px 4px 2px 8px', borderRadius: 99 }}>
              {t}<button onClick={() => removeTag(c, t)} style={{ border: 'none', background: 'none', color: C.violet, cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: 0 }}>×</button>
            </span>
          ))}
        </div>

        {/* Éditeur de tag inline */}
        {editing && (
          <div style={{ borderTop: `1px solid ${C.divider}`, paddingTop: 8 }}>
            <input autoFocus list="tag-suggestions" value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { addTag(c, tagInput) } if (e.key === 'Escape') setTagEditId(null) }}
              placeholder="Ajouter un tag (Entrée)…"
              style={{ width: '100%', padding: '6px 9px', borderRadius: 6, border: `1px solid ${C.border}`, font: `12px ${FONT}`, background: C.surface }} />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: C.pageBg, fontFamily: FONT, color: C.ink }}>
      <Head><title>Clients — Maze Project</title></Head>
      <datalist id="tag-suggestions">{allTags.map(t => <option key={t} value={t} />)}</datalist>

      <main style={{ padding: '26px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, borderBottom: `1px solid ${C.border}`, paddingBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 23, fontWeight: 700, letterSpacing: '-.4px' }}>Clients & fournisseurs</span>
            <span style={{ font: `11.5px ${MONO}`, color: C.muted }}>{companies.length} SOCIÉTÉS · {persons.length} PERSONNES · {nCust} CLIENTS · {nSup} FOURNISSEURS</span>
          </div>
          <div style={{ flex: 1 }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher…"
            style={{ padding: '8px 12px', borderRadius: 6, border: `1px solid ${C.border}`, font: `13px ${FONT}`, background: C.surface, minWidth: 200 }} />
          <div style={{ display: 'flex', border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden' }}>
            {tab('all', 'Tous')}{tab('customer', 'Clients', nCust)}{tab('supplier', 'Fournisseurs', nSup)}
          </div>
          <button onClick={() => setShowArchived(v => !v)}
            style={{ font: `600 12px ${FONT}`, padding: '8px 12px', borderRadius: 6, cursor: 'pointer', border: `1px solid ${C.border}`,
              background: showArchived ? C.ink : C.surface, color: showArchived ? '#fff' : C.inkSecondary }}>
            {showArchived ? '← Actifs' : `Archivés${nArchived ? ` · ${nArchived}` : ''}`}
          </button>
          <button onClick={nouveau} style={{ border: 'none', background: C.ink, color: C.accentOnDark, font: `600 12.5px ${FONT}`, padding: '9px 16px', borderRadius: 5, cursor: 'pointer' }}>+ NOUVEAU</button>
        </div>

        {/* Filtre par tag (tags utilisés, hors rôles Client/Fournisseur qui ont leurs onglets) */}
        {allTags.filter(t => !ROLE_TAGS.includes(t)).length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ font: `10px ${MONO}`, color: C.muted, marginRight: 2 }}>TAGS</span>
            {allTags.filter(t => !ROLE_TAGS.includes(t)).map(t => (
              <button key={t} onClick={() => setTagFilter(tagFilter === t ? null : t)}
                style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 99, cursor: 'pointer',
                  color: tagFilter === t ? '#fff' : C.violet, background: tagFilter === t ? C.violet : C.violetBg, border: 'none' }}>{t}</button>
            ))}
          </div>
        )}

        {isLoading ? (
          <p style={{ color: C.muted, fontSize: 13, padding: '40px 0', textAlign: 'center' }}>Chargement…</p>
        ) : visible.length === 0 ? (
          <p style={{ color: C.muted, fontSize: 13, padding: '40px 0', textAlign: 'center' }}>Aucun contact.</p>
        ) : (
          <div style={GRID}>{visible.map(it => <Card key={it.c.id} it={it} />)}</div>
        )}
      </main>
    </div>
  )
}
