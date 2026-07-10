import { useState } from 'react'
import useSWR from 'swr'
import Head from 'next/head'
import { C, FONT, MONO, initials } from '../lib/theme'

function Flag({ active, on, off, label, onClick }) {
  return (
    <button onClick={onClick}
      style={{ font: `10px ${MONO}`, letterSpacing: '.06em', padding: '2px 9px', borderRadius: 99, cursor: 'pointer',
        color: active ? on.fg : C.faint, background: active ? on.bg : 'transparent',
        border: `1px solid ${active ? 'transparent' : C.border}` }}>
      {label}
    </button>
  )
}

export default function Clients() {
  const { data: contacts = [], isLoading, mutate } = useSWR('/api/contacts')
  const list = Array.isArray(contacts) ? contacts : []
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all') // all | customer | supplier
  const [open, setOpen] = useState({})

  const companies = list.filter(c => c.kind === 'company')
  const persons   = list.filter(c => c.kind !== 'company')
  const personsByParent = {}
  const standalone = []
  for (const p of persons) {
    if (p.parent_id) (personsByParent[p.parent_id] ||= []).push(p)
    else standalone.push(p)
  }

  const CUST = { fg: C.success, bg: C.successBg }
  const SUP  = { fg: C.warning, bg: C.warningBg }

  async function toggle(c, field) {
    const next = !c[field]
    mutate(list.map(x => x.id === c.id ? { ...x, [field]: next } : x), false)
    try {
      await fetch(`/api/contacts?id=${c.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [field]: next }) })
    } finally { mutate() }
  }

  const needle = q.trim().toLowerCase()
  function matchText(c) {
    if (!needle) return true
    return (c.name || '').toLowerCase().includes(needle) || (c.email || '').toLowerCase().includes(needle) || (c.city || '').toLowerCase().includes(needle)
  }
  function matchFilter(c) {
    if (filter === 'customer') return c.is_customer
    if (filter === 'supplier') return c.is_supplier
    return true
  }

  const visibleCompanies = companies.filter(c => {
    if (!matchFilter(c) && !(personsByParent[c.id] || []).some(matchFilter)) return false
    if (needle) return matchText(c) || (personsByParent[c.id] || []).some(matchText)
    return true
  }).sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  const visibleStandalone = standalone.filter(p => matchFilter(p) && matchText(p)).sort((a, b) => (a.name || '').localeCompare(b.name || ''))

  const nCust = list.filter(c => c.is_customer).length
  const nSup  = list.filter(c => c.is_supplier).length

  const tab = (k, label, n) => (
    <button onClick={() => setFilter(k)} key={k}
      style={{ padding: '6px 14px', cursor: 'pointer', border: 'none', font: `${filter === k ? 600 : 400} 12px ${FONT}`,
        background: filter === k ? C.ink : C.surface, color: filter === k ? '#fff' : C.inkSecondary, borderLeft: k !== 'all' ? `1px solid ${C.border}` : 'none' }}>
      {label}{n != null ? ` · ${n}` : ''}
    </button>
  )

  return (
    <div className="min-h-screen" style={{ background: C.pageBg, fontFamily: FONT, color: C.ink }}>
      <Head><title>Clients — Maze Project</title></Head>

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
        </div>

        {isLoading ? (
          <p style={{ color: C.muted, fontSize: 13, padding: '40px 0', textAlign: 'center' }}>Chargement…</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {visibleCompanies.map(c => {
              const people = (personsByParent[c.id] || []).filter(p => !needle || matchText(p) || matchText(c))
              const isOpen = open[c.id]
              return (
                <div key={c.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: C.ink, color: C.accentOnDark, display: 'flex', alignItems: 'center', justifyContent: 'center', font: `10px ${MONO}`, fontWeight: 700, flex: 'none' }}>{initials(c.name)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                      <div style={{ font: `10.5px ${MONO}`, color: C.muted }}>
                        {[c.city, (personsByParent[c.id] || []).length ? `${(personsByParent[c.id] || []).length} PERS.` : null].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </div>
                    <Flag active={c.is_customer} on={CUST} label="CLIENT" onClick={() => toggle(c, 'is_customer')} />
                    <Flag active={c.is_supplier} on={SUP} label="FOURNISSEUR" onClick={() => toggle(c, 'is_supplier')} />
                    {(personsByParent[c.id] || []).length > 0 && (
                      <button onClick={() => setOpen(o => ({ ...o, [c.id]: !o[c.id] }))}
                        style={{ background: 'none', border: 'none', color: C.faintChevron, cursor: 'pointer', fontSize: 12, transform: isOpen ? 'rotate(90deg)' : 'none', flex: 'none' }}>▸</button>
                    )}
                  </div>
                  {isOpen && people.map(p => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px 10px 46px', borderTop: `1px solid ${C.divider}` }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
                        <div style={{ font: `10.5px ${MONO}`, color: C.muted }}>{[p.email, p.phone].filter(Boolean).join(' · ') || '—'}</div>
                      </div>
                      <Flag active={p.is_customer} on={CUST} label="CLIENT" onClick={() => toggle(p, 'is_customer')} />
                      <Flag active={p.is_supplier} on={SUP} label="FOURNISSEUR" onClick={() => toggle(p, 'is_supplier')} />
                    </div>
                  ))}
                </div>
              )
            })}

            {visibleStandalone.length > 0 && (
              <>
                <div style={{ font: `500 10px ${MONO}`, letterSpacing: '.12em', color: C.muted, marginTop: 12, padding: '0 2px' }}>SANS SOCIÉTÉ</div>
                {visibleStandalone.map(p => (
                  <div key={p.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</div>
                      <div style={{ font: `10.5px ${MONO}`, color: C.muted }}>{[p.email, p.phone, p.city].filter(Boolean).join(' · ') || '—'}</div>
                    </div>
                    <Flag active={p.is_customer} on={CUST} label="CLIENT" onClick={() => toggle(p, 'is_customer')} />
                    <Flag active={p.is_supplier} on={SUP} label="FOURNISSEUR" onClick={() => toggle(p, 'is_supplier')} />
                  </div>
                ))}
              </>
            )}

            {visibleCompanies.length === 0 && visibleStandalone.length === 0 && (
              <p style={{ color: C.muted, fontSize: 13, padding: '40px 0', textAlign: 'center' }}>Aucun contact. As-tu exécuté <code>seed-contacts.sql</code> dans Supabase ?</p>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
