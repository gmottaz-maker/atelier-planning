import { useState, useRef } from 'react'
import useSWR from 'swr'
import Head from 'next/head'
import { C, FONT, MONO } from '../lib/theme'

const RATE = 20            // CHF / palette (m²) / mois
const QUARTER_MONTHS = 3
const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n }
const fmt = n => new Intl.NumberFormat('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)

async function api(url, method, body) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  return r.json().catch(() => ({}))
}

export default function Stockage() {
  const { data: groups = [], mutate: mutGroups } = useSWR('/api/storage-groups')
  const { data: items = [], mutate: mutItems } = useSWR('/api/storage-items')
  const gList = Array.isArray(groups) ? groups : []
  const iList = Array.isArray(items) ? items : []
  const [q, setQ] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [draft, setDraft] = useState({})   // { 'g:12':{field:val} , 'i:34':{...} }
  const [billOpen, setBillOpen] = useState(false)

  const clients = [...new Set([...gList.map(g => g.client), ...iList.map(i => i.client)])].sort((a, b) => a.localeCompare(b))
  const needle = q.trim().toLowerCase()
  const matchClient = c => !needle || c.toLowerCase().includes(needle)
    || gList.some(g => g.client === c && (g.brand || '').toLowerCase().includes(needle))
    || iList.some(i => i.client === c && [i.name, i.brand, i.notes].filter(Boolean).join(' ').toLowerCase().includes(needle))
  const shownClients = clients.filter(matchClient)

  // ── édition inline (brouillon + commit) ──
  const val = (kind, row, k) => { const key = `${kind}:${row.id}`; return (draft[key] && k in draft[key]) ? draft[key][k] : (row[k] ?? '') }
  const setD = (kind, id, k, v) => setDraft(d => ({ ...d, [`${kind}:${id}`]: { ...d[`${kind}:${id}`], [k]: v } }))
  function commit(kind, row, k) {
    const key = `${kind}:${row.id}`
    if (!draft[key] || !(k in draft[key])) return
    const v = draft[key][k]
    setDraft(d => { const c = { ...d[key] }; delete c[k]; return { ...d, [key]: c } })
    if (String(v) === String(row[k] ?? '')) return
    if (kind === 'g') patchGroup(row.id, { [k]: v }); else patchItem(row.id, { [k]: v })
  }

  async function patchGroup(id, body) {
    mutGroups(gList.map(g => g.id === id ? { ...g, ...body } : g), false)
    await api(`/api/storage-groups?id=${id}`, 'PATCH', body); mutGroups()
  }
  async function patchItem(id, body) {
    mutItems(iList.map(i => i.id === id ? { ...i, ...body } : i), false)
    await api(`/api/storage-items?id=${id}`, 'PATCH', body); mutItems()
  }
  async function addGroup(client) { await api('/api/storage-groups', 'POST', { client, brand: 'Nouvelle marque', pallets: 0 }); mutGroups() }
  async function addItem(client, brand) { await api('/api/storage-items', 'POST', { client, brand: brand || '', name: '' }); mutItems() }
  async function delGroup(g) { if (!confirm(`Supprimer le groupe « ${g.brand} » ?`)) return; mutGroups(gList.filter(x => x.id !== g.id), false); await api(`/api/storage-groups?id=${g.id}`, 'DELETE'); mutGroups() }
  async function delItem(it) { if (!confirm(`Supprimer « ${it.name || 'article'} » ?`)) return; mutItems(iList.filter(x => x.id !== it.id), false); await api(`/api/storage-items?id=${it.id}`, 'DELETE'); mutItems() }

  async function uploadPhoto(it, file) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      const d = await api('/api/storage-photo', 'POST', { image: reader.result, ext: (file.name.split('.').pop() || 'jpg') })
      if (d.path) patchItem(it.id, { photo_path: d.path })
    }
    reader.readAsDataURL(file)
  }

  const CUR_YEAR = new Date().getFullYear()
  // Palettes facturables au trimestre : surplus au-delà de l'annuel si mode annuel (année courante).
  const groupSurplus = g => (g.billing_mode === 'annual' && Number(g.annual_year) === CUR_YEAR)
    ? Math.max(0, num(g.pallets) - num(g.annual_billed_pallets)) : num(g.pallets)
  function setMode(g, mode) {
    if (mode === 'annual') patchGroup(g.id, { billing_mode: 'annual', annual_billed_pallets: num(g.pallets), annual_year: CUR_YEAR })
    else patchGroup(g.id, { billing_mode: 'quarterly', annual_billed_pallets: null, annual_year: null })
  }
  const clientQuarterAmount = c => gList.filter(g => g.client === c && !g.archived).reduce((s, g) => s + groupSurplus(g) * RATE * QUARTER_MONTHS, 0)

  const activeGroups = c => gList.filter(g => g.client === c && (showArchived || !g.archived))
  const activeItems = c => iList.filter(i => i.client === c && (showArchived || !i.archived))
  const clientPallets = c => gList.filter(g => g.client === c && !g.archived).reduce((s, g) => s + num(g.pallets), 0)
  const grandPallets = gList.filter(g => !g.archived).reduce((s, g) => s + num(g.pallets), 0)

  const inp = { width: '100%', padding: '6px 8px', borderRadius: 5, border: '1px solid transparent', background: 'transparent', font: `13px ${FONT}`, color: C.ink }
  const inpR = { ...inp, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
  const th = { font: `500 10px ${MONO}`, letterSpacing: '.05em', color: C.muted, textTransform: 'uppercase', padding: '6px 8px', textAlign: 'left', whiteSpace: 'nowrap' }
  const cell = { padding: '1px 4px', borderTop: `1px solid ${C.divider}` }
  const field = (kind, row, k, style, t = 'text', ph) => (
    <input type={t} step={t === 'number' ? '0.5' : undefined} placeholder={ph} value={val(kind, row, k)}
      onChange={e => setD(kind, row.id, k, e.target.value)}
      onFocus={e => { e.target.style.background = C.surface; e.target.style.borderColor = C.border }}
      onBlur={e => { e.target.style.background = 'transparent'; e.target.style.borderColor = 'transparent'; commit(kind, row, k) }}
      style={style} />
  )

  function TagEditor({ it }) {
    const [t, setT] = useState('')
    const tags = it.tags || []
    const add = v => { const x = v.trim(); if (x && !tags.includes(x)) patchItem(it.id, { tags: [...tags, x] }); setT('') }
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
        {tags.map(tg => (
          <span key={tg} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: C.violet, background: C.violetBg, padding: '1px 4px 1px 7px', borderRadius: 99 }}>
            {tg}<button onClick={() => patchItem(it.id, { tags: tags.filter(x => x !== tg) })} style={{ border: 'none', background: 'none', color: C.violet, cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: 0 }}>×</button>
          </span>
        ))}
        <input value={t} onChange={e => setT(e.target.value)} placeholder="+ tag"
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(t) } }}
          onBlur={() => t && add(t)}
          style={{ width: 54, border: 'none', background: 'transparent', font: `11px ${FONT}`, color: C.ink, outline: 'none' }} />
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: C.pageBg, fontFamily: FONT, color: C.ink }}>
      <Head><title>Stockage — Maze Project</title></Head>
      <main style={{ padding: '26px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ font: `700 22px ${FONT}`, margin: 0 }}>Stockage</h1>
          <span style={{ font: `12px ${MONO}`, color: C.muted }}>{grandPallets} palette{grandPallets > 1 ? 's' : ''} · {fmt(grandPallets * RATE)} CHF/mois</span>
          <div style={{ flex: 1 }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher…"
            style={{ padding: '8px 12px', borderRadius: 6, border: `1px solid ${C.border}`, font: `13px ${FONT}`, background: C.surface, minWidth: 200 }} />
          <button onClick={() => setShowArchived(s => !s)}
            style={{ font: `600 12px ${FONT}`, padding: '8px 12px', borderRadius: 6, cursor: 'pointer', border: `1px solid ${C.border}`, background: showArchived ? C.ink : C.surface, color: showArchived ? '#fff' : C.inkSecondary }}>
            {showArchived ? 'Archivés inclus' : 'Actifs'}
          </button>
          <button onClick={() => setBillOpen(true)}
            style={{ font: `600 12px ${FONT}`, padding: '8px 14px', borderRadius: 6, cursor: 'pointer', border: 'none', background: C.ink, color: C.accentOnDark }}>
            Générer le trimestre
          </button>
        </div>

        {shownClients.map(client => (
          <section key={client} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '14px 18px', borderBottom: `1px solid ${C.divider}` }}>
              <span style={{ font: `700 16px ${FONT}` }}>{client}</span>
              <span style={{ font: `12px ${MONO}`, color: C.muted }}>
                {clientPallets(client)} palette(s) · {fmt(clientQuarterAmount(client))} CHF / trimestre
              </span>
            </div>

            {/* Facturation (groupes) */}
            <div style={{ padding: '10px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ font: `600 11px ${MONO}`, letterSpacing: '.06em', color: C.muted, textTransform: 'uppercase' }}>Facturation — palettes par marque/projet</span>
                <button onClick={() => addGroup(client)} style={{ font: `600 11px ${FONT}`, border: 'none', background: 'transparent', color: C.accent, cursor: 'pointer' }}>+ groupe</button>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={{ ...th, width: '34%' }}>Marque / projet</th><th style={{ ...th, textAlign: 'right', width: '12%' }}>Palettes</th><th style={{ ...th, width: '22%' }}>Mode</th><th style={{ ...th, textAlign: 'right', width: '20%' }}>CHF / trimestre</th><th style={{ ...th, width: '12%' }}></th></tr></thead>
                <tbody>
                  {activeGroups(client).map(g => {
                    const annual = g.billing_mode === 'annual'
                    return (
                    <tr key={g.id} style={{ opacity: g.archived ? 0.5 : 1 }}>
                      <td style={cell}>{field('g', g, 'brand', { ...inp, fontWeight: 600 }, 'text', 'Marque')}</td>
                      <td style={cell}>{field('g', g, 'pallets', inpR, 'number', '0')}</td>
                      <td style={cell}>
                        <select value={g.billing_mode || 'quarterly'} onChange={e => setMode(g, e.target.value)}
                          style={{ font: `12px ${FONT}`, color: C.inkSecondary, border: `1px solid ${C.border}`, borderRadius: 5, padding: '4px 6px', background: '#fff' }}>
                          <option value="quarterly">Trimestriel</option>
                          <option value="annual">Annuel</option>
                        </select>
                        {annual && <span style={{ font: `10px ${MONO}`, color: C.muted, marginLeft: 6 }}>{num(g.annual_billed_pallets)} pal · {g.annual_year}</span>}
                      </td>
                      <td style={{ ...cell, textAlign: 'right', font: `13px ${MONO}`, color: groupSurplus(g) > 0 ? C.ink : C.muted, paddingRight: 12 }}>
                        {annual && groupSurplus(g) === 0 ? '— (annuel)' : fmt(groupSurplus(g) * RATE * QUARTER_MONTHS)}
                      </td>
                      <td style={{ ...cell, textAlign: 'right' }}>
                        <button title={g.archived ? 'Désarchiver' : 'Archiver'} onClick={() => patchGroup(g.id, { archived: !g.archived })} style={{ border: 'none', background: 'transparent', color: C.muted, cursor: 'pointer', padding: 3 }}>⊘</button>
                        <button title="Supprimer" onClick={() => delGroup(g)} style={{ border: 'none', background: 'transparent', color: C.muted, cursor: 'pointer', fontSize: 15, padding: 3 }}>×</button>
                      </td>
                    </tr>
                  )})}
                  {activeGroups(client).length === 0 && <tr><td colSpan={5} style={{ ...cell, color: C.muted, fontSize: 12, padding: 10 }}>Aucun groupe.</td></tr>}
                </tbody>
              </table>
            </div>

            {/* Inventaire */}
            <div style={{ padding: '4px 18px 16px', borderTop: `1px solid ${C.divider}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0 4px' }}>
                <span style={{ font: `600 11px ${MONO}`, letterSpacing: '.06em', color: C.muted, textTransform: 'uppercase' }}>Inventaire</span>
                <button onClick={() => addItem(client)} style={{ font: `600 11px ${FONT}`, border: 'none', background: 'transparent', color: C.accent, cursor: 'pointer' }}>+ article</button>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse' }}>
                  <thead><tr>
                    <th style={{ ...th, width: '13%' }}>Marque</th><th style={{ ...th, width: '20%' }}>Nom</th>
                    <th style={{ ...th, textAlign: 'right', width: '6%' }}>Qté</th>
                    <th style={{ ...th, width: '13%' }}>Dim. L×l×h</th><th style={{ ...th, textAlign: 'right', width: '7%' }}>Poids</th>
                    <th style={{ ...th, width: '14%' }}>Tags</th><th style={{ ...th, width: '15%' }}>Commentaire</th>
                    <th style={{ ...th, width: '6%' }}>Photo</th><th style={{ ...th, width: '6%' }}></th>
                  </tr></thead>
                  <tbody>
                    {activeItems(client).map(it => (
                      <tr key={it.id} style={{ opacity: it.archived ? 0.5 : 1 }}>
                        <td style={cell}>{field('i', it, 'brand', inp, 'text', 'Marque/projet')}</td>
                        <td style={cell}>{field('i', it, 'name', { ...inp, fontWeight: 600 }, 'text', 'Nom')}</td>
                        <td style={cell}>{field('i', it, 'quantity', inpR, 'number', '')}</td>
                        <td style={{ ...cell }}>
                          <div style={{ display: 'flex', gap: 2 }}>
                            {['dim_l', 'dim_w', 'dim_h'].map(k => field('i', it, k, { ...inpR, padding: '6px 3px' }, 'number', k === 'dim_l' ? 'L' : k === 'dim_w' ? 'l' : 'h'))}
                          </div>
                        </td>
                        <td style={cell}>{field('i', it, 'weight', inpR, 'number', 'kg')}</td>
                        <td style={cell}><TagEditor it={it} /></td>
                        <td style={cell}>{field('i', it, 'notes', inp, 'text', '—')}</td>
                        <td style={{ ...cell, textAlign: 'center' }}>
                          <PhotoCell it={it} onUpload={uploadPhoto} />
                        </td>
                        <td style={{ ...cell, textAlign: 'right' }}>
                          <button title={it.archived ? 'Désarchiver' : 'Archiver'} onClick={() => patchItem(it.id, { archived: !it.archived })} style={{ border: 'none', background: 'transparent', color: C.muted, cursor: 'pointer', padding: 3 }}>⊘</button>
                          <button title="Supprimer" onClick={() => delItem(it)} style={{ border: 'none', background: 'transparent', color: C.muted, cursor: 'pointer', fontSize: 15, padding: 3 }}>×</button>
                        </td>
                      </tr>
                    ))}
                    {activeItems(client).length === 0 && <tr><td colSpan={9} style={{ ...cell, color: C.muted, fontSize: 12, padding: 10 }}>Aucun article.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ))}
        {shownClients.length === 0 && <p style={{ color: C.muted, fontSize: 13, padding: '40px 0', textAlign: 'center' }}>Aucun client en stock.</p>}
      </main>

      {billOpen && <BillingModal onClose={() => setBillOpen(false)} />}
    </div>
  )
}

function BillingModal({ onClose }) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [quarter, setQuarter] = useState(Math.floor(now.getMonth() / 3) + 1)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function run(dry) {
    setBusy(true); setMsg('')
    try {
      const d = await api('/api/storage-invoices/generate', 'POST', { year: Number(year), quarter: Number(quarter), dry })
      if (d.error) { setMsg('Erreur : ' + d.error); return }
      if (dry) setPreview(d)
      else { setMsg(`✅ ${d.created.length} facture(s) créée(s)${d.skipped.length ? `, ${d.skipped.length} déjà existante(s)` : ''}.`); setPreview(null) }
    } finally { setBusy(false) }
  }

  const sel = { padding: '8px 10px', borderRadius: 6, border: `1px solid ${C.border}`, font: `14px ${FONT}`, background: '#fff' }
  return (
    <div onMouseDown={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,.45)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '8vh 16px', overflowY: 'auto' }}>
      <div onMouseDown={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, maxWidth: 480, width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,.25)', fontFamily: FONT }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 22px', borderBottom: `1px solid ${C.divider}` }}>
          <h3 style={{ font: `700 16px ${FONT}`, margin: 0 }}>Générer les factures de stockage</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, color: C.muted, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <label style={{ font: `12px ${FONT}`, color: C.muted }}>Trimestre<br />
              <select value={quarter} onChange={e => { setQuarter(e.target.value); setPreview(null) }} style={{ ...sel, marginTop: 4 }}>
                {[1, 2, 3, 4].map(n => <option key={n} value={n}>T{n}</option>)}
              </select>
            </label>
            <label style={{ font: `12px ${FONT}`, color: C.muted }}>Année<br />
              <input type="number" value={year} onChange={e => { setYear(e.target.value); setPreview(null) }} style={{ ...sel, marginTop: 4, width: 100 }} />
            </label>
            <button onClick={() => run(true)} disabled={busy} style={{ marginLeft: 'auto', font: `600 12px ${FONT}`, padding: '9px 14px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: C.inkSecondary, cursor: 'pointer' }}>Prévisualiser</button>
          </div>
          <p style={{ font: `11px ${MONO}`, color: C.muted, margin: 0 }}>Facture au dernier jour du trimestre, échéance +30j, statut « Créée ». Contact/adresse à assigner ensuite.</p>

          {preview && (
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ padding: '8px 12px', font: `600 11px ${MONO}`, color: C.muted, background: C.pageBg, textTransform: 'uppercase' }}>{preview.object} — {preview.created.length} facture(s)</div>
              {preview.created.map((c, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', fontSize: 13, borderTop: `1px solid ${C.divider}` }}>
                  <span>{c.client}</span><span style={{ font: `13px ${MONO}` }}>{fmt(c.amount)} CHF</span>
                </div>
              ))}
              {preview.skipped.length > 0 && <div style={{ padding: '7px 12px', fontSize: 12, color: C.muted, borderTop: `1px solid ${C.divider}` }}>Déjà facturés : {preview.skipped.join(', ')}</div>}
              {preview.created.length === 0 && <div style={{ padding: '7px 12px', fontSize: 12, color: C.muted, borderTop: `1px solid ${C.divider}` }}>Rien à générer (déjà fait ou aucun groupe facturable).</div>}
            </div>
          )}
          {msg && <div style={{ fontSize: 13, color: msg.startsWith('✅') ? C.success : C.danger }}>{msg}</div>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 22px', borderTop: `1px solid ${C.divider}` }}>
          <button onClick={onClose} style={{ padding: '9px 16px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: C.inkSecondary, font: `600 13px ${FONT}`, cursor: 'pointer' }}>Fermer</button>
          <button onClick={() => run(false)} disabled={busy} style={{ padding: '9px 18px', borderRadius: 6, border: 'none', background: C.ink, color: '#fff', font: `600 13px ${FONT}`, cursor: 'pointer', opacity: busy ? 0.5 : 1 }}>Générer</button>
        </div>
      </div>
    </div>
  )
}

function PhotoCell({ it, onUpload }) {
  const ref = useRef(null)
  return (
    <>
      <input ref={ref} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { onUpload(it, e.target.files?.[0]); e.target.value = '' }} />
      {it.photo_url
        ? <img src={it.photo_url} alt="" onClick={() => ref.current?.click()} style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 5, cursor: 'pointer', border: `1px solid ${C.border}` }} />
        : <button onClick={() => ref.current?.click()} style={{ border: `1px dashed ${C.border}`, background: 'transparent', color: C.muted, borderRadius: 5, width: 34, height: 34, cursor: 'pointer', fontSize: 15 }}>+</button>}
    </>
  )
}
