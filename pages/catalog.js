import { useState, useRef } from 'react'
import useSWR from 'swr'
import Head from 'next/head'
import { C, FONT, MONO } from '../lib/theme'

const UNITS = ['heure(s)', 'jour(s)', 'ml', 'm²', 'm³', 'km', 'PAN', 'pce', 'forfait', 'kg', 'l']
const CSV_COLS = ['id', 'type', 'name', 'unit', 'vat_rate', 'purchase_price', 'margin', 'sale_price', 'vendor', 'notes']

const numOr = (v, d = 0) => { const n = parseFloat(v); return isNaN(n) ? d : n }
const round2 = n => Math.round(n * 100) / 100
const computeSale = (purchase, margin) => round2(numOr(purchase) * (1 + numOr(margin) / 100))

// ── CSV ──────────────────────────────────────────────────────────
function toCSV(rows) {
  const esc = v => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [CSV_COLS.join(',')]
  for (const r of rows) lines.push(CSV_COLS.map(c => esc(r[c])).join(','))
  return lines.join('\n')
}
function parseCSV(text) {
  const rows = []
  let field = '', row = [], inQ = false
  const pushF = () => { row.push(field); field = '' }
  const pushR = () => { pushF(); rows.push(row); row = [] }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else inQ = false }
      else field += c
    } else if (c === '"') inQ = true
    else if (c === ',') pushF()
    else if (c === '\n') pushR()
    else if (c === '\r') { /* skip */ }
    else field += c
  }
  if (field !== '' || row.length) pushR()
  if (!rows.length) return []
  const header = rows[0].map(h => h.trim())
  return rows.slice(1).filter(r => r.some(v => v.trim() !== '')).map(r => {
    const o = {}
    header.forEach((h, i) => { o[h] = r[i] ?? '' })
    return o
  })
}

export default function Catalog() {
  const { data: items = [], isLoading, mutate } = useSWR('/api/catalog')
  const list = Array.isArray(items) ? items : []
  const [q, setQ] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')   // all | article | heure
  const [showArchived, setShowArchived] = useState(false)
  const [draft, setDraft] = useState({})                // { [id]: {field: value} } édition en cours
  const [importMsg, setImportMsg] = useState('')
  const fileRef = useRef(null)

  const needle = q.trim().toLowerCase()
  const filtered = list
    .filter(it => showArchived ? true : !it.archived)
    .filter(it => typeFilter === 'all' ? true : it.type === typeFilter)
    .filter(it => !needle || [it.name, it.vendor, it.notes, it.unit].filter(Boolean).join(' ').toLowerCase().includes(needle))

  const articles = filtered.filter(it => it.type !== 'heure')
  const heures = filtered.filter(it => it.type === 'heure')

  // Valeur affichée : brouillon en cours sinon valeur serveur
  const val = (it, k) => (draft[it.id] && k in draft[it.id]) ? draft[it.id][k] : (it[k] ?? '')
  const setD = (id, k, v) => setDraft(d => ({ ...d, [id]: { ...d[id], [k]: v } }))

  async function patch(id, body) {
    mutate(list.map(x => x.id === id ? { ...x, ...body } : x), false)
    try { await fetch(`/api/catalog?id=${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }
    finally { mutate() }
  }
  // onBlur d'un champ : persiste si modifié. Sur un article, éditer prix d'achat
  // ou marge recalcule le prix de vente — sauf s'il a été saisi manuellement
  // (i.e. il diffère de l'ancien calcul → on ne l'écrase pas).
  function commit(it, k) {
    if (!draft[it.id] || !(k in draft[it.id])) return
    const v = draft[it.id][k]
    setDraft(d => { const c = { ...d[it.id] }; delete c[k]; return { ...d, [it.id]: c } })
    if (String(v) === String(it[k] ?? '')) return
    const body = { [k]: v }
    if ((k === 'purchase_price' || k === 'margin') && it.type !== 'heure') {
      const oldComputed = computeSale(it.purchase_price, it.margin)
      const saleAuto = it.sale_price == null || it.sale_price === '' || round2(numOr(it.sale_price)) === oldComputed
      const newPurchase = k === 'purchase_price' ? v : it.purchase_price
      const newMargin = k === 'margin' ? v : it.margin
      if (saleAuto && numOr(newPurchase) > 0) body.sale_price = computeSale(newPurchase, newMargin)
    }
    patch(it.id, body)
  }
  function commitNow(it, k, v) {   // selects/toggles : persiste direct
    patch(it.id, { [k]: v })
  }

  async function addItem(type) {
    const body = { type, name: '', unit: type === 'heure' ? 'heure(s)' : '', vat_rate: 8.1 }
    const r = await fetch('/api/catalog', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    await r.json(); mutate()
  }
  async function remove(it) {
    if (!confirm(`Supprimer « ${it.name || 'sans nom'} » ?`)) return
    mutate(list.filter(x => x.id !== it.id), false)
    try { await fetch(`/api/catalog?id=${it.id}`, { method: 'DELETE' }) } finally { mutate() }
  }

  function exportCSV() {
    const rows = filtered.length ? filtered : list
    const blob = new Blob([toCSV(rows)], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `catalogue-${new Date().toISOString().slice(0, 10)}.csv`
    a.click(); URL.revokeObjectURL(a.href)
  }
  async function onImportFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImportMsg('Import en cours…')
    try {
      const text = await file.text()
      const parsed = parseCSV(text)
      const clean = parsed.map(r => {
        const o = {}
        for (const c of CSV_COLS) if (r[c] !== undefined && r[c] !== '') o[c] = r[c]
        if (o.type && o.type !== 'heure') o.type = 'article'
        return o
      }).filter(o => o.name)
      if (!clean.length) { setImportMsg('Aucune ligne valide (colonne « name » requise).'); return }
      const r = await fetch('/api/catalog?bulk=1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: clean }) })
      const d = await r.json()
      if (d.error) { setImportMsg('Erreur : ' + d.error); return }
      setImportMsg(`✅ ${d.inserted} ajouté(s), ${d.updated} mis à jour.`)
      mutate()
    } catch (err) { setImportMsg('Erreur : ' + err.message) }
  }

  return (
    <div className="min-h-screen" style={{ background: C.pageBg, fontFamily: FONT, color: C.ink }}>
      <Head><title>Catalogue — Maze Project</title></Head>
      <main style={{ padding: '26px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ font: `700 22px ${FONT}`, margin: 0 }}>Catalogue</h1>
          <span style={{ font: `12px ${MONO}`, color: C.muted }}>{filtered.length} article{filtered.length > 1 ? 's' : ''}</span>
          <div style={{ flex: 1 }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher…"
            style={{ padding: '8px 12px', borderRadius: 6, border: `1px solid ${C.border}`, font: `13px ${FONT}`, background: C.surface, minWidth: 200 }} />
          <button onClick={() => fileRef.current?.click()}
            style={{ font: `600 12px ${FONT}`, padding: '8px 12px', borderRadius: 6, cursor: 'pointer', border: `1px solid ${C.border}`, background: C.surface, color: C.inkSecondary }}>Importer CSV</button>
          <button onClick={exportCSV}
            style={{ font: `600 12px ${FONT}`, padding: '8px 12px', borderRadius: 6, cursor: 'pointer', border: `1px solid ${C.border}`, background: C.surface, color: C.inkSecondary }}>Exporter CSV</button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onImportFile} style={{ display: 'none' }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {[['all', 'Tous'], ['article', 'Articles'], ['heure', 'Heures']].map(([k, lbl]) => (
            <button key={k} onClick={() => setTypeFilter(k)}
              style={{ font: `600 12px ${FONT}`, padding: '6px 14px', borderRadius: 99, cursor: 'pointer',
                border: `1px solid ${typeFilter === k ? 'transparent' : C.border}`,
                background: typeFilter === k ? C.ink : C.surface, color: typeFilter === k ? '#fff' : C.inkSecondary }}>{lbl}</button>
          ))}
          <button onClick={() => setShowArchived(s => !s)}
            style={{ font: `600 12px ${FONT}`, padding: '6px 14px', borderRadius: 99, cursor: 'pointer', border: `1px solid ${C.border}`,
              background: showArchived ? C.ink : C.surface, color: showArchived ? '#fff' : C.inkSecondary }}>
            {showArchived ? 'Archivés inclus' : 'Actifs'}
          </button>
          {importMsg && <span style={{ font: `12px ${MONO}`, color: C.muted }}>{importMsg}</span>}
        </div>

        {isLoading ? (
          <p style={{ color: C.muted, fontSize: 13, padding: '40px 0', textAlign: 'center' }}>Chargement…</p>
        ) : (
          <>
            {(typeFilter === 'all' || typeFilter === 'article') && (
              <CatalogTable title="Articles" type="article" rows={articles}
                val={val} setD={setD} commit={commit} commitNow={commitNow} remove={remove} addItem={addItem} />
            )}
            {(typeFilter === 'all' || typeFilter === 'heure') && (
              <CatalogTable title="Heures" type="heure" rows={heures}
                val={val} setD={setD} commit={commit} commitNow={commitNow} remove={remove} addItem={addItem} />
            )}
          </>
        )}
      </main>
    </div>
  )
}

function CatalogTable({ title, type, rows, val, setD, commit, commitNow, remove, addItem }) {
  const th = { font: `500 10px ${MONO}`, letterSpacing: '.06em', color: C.muted, textTransform: 'uppercase', padding: '8px 8px', textAlign: 'left', whiteSpace: 'nowrap' }
  const thR = { ...th, textAlign: 'right' }
  const cell = { padding: '2px 4px', borderTop: `1px solid ${C.divider}` }
  const inp = { width: '100%', padding: '6px 8px', borderRadius: 5, border: `1px solid transparent`, background: 'transparent', font: `13px ${FONT}`, color: C.ink }
  const inpR = { ...inp, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
  const isHeure = type === 'heure'

  // Fonction (pas un composant) pour éviter le remount des inputs à chaque frappe.
  const field = (it, k, style, t = 'text', ph) => (
    <input type={t} step={t === 'number' ? '0.01' : undefined} placeholder={ph}
      value={val(it, k)} onChange={e => setD(it.id, k, e.target.value)}
      onFocus={e => { e.target.style.background = C.surface; e.target.style.borderColor = C.border }}
      onBlur={e => { e.target.style.background = 'transparent'; e.target.style.borderColor = 'transparent'; commit(it, k) }}
      style={style} />
  )

  return (
    <section style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${C.divider}` }}>
        <span style={{ font: `700 14px ${FONT}` }}>{title} <span style={{ color: C.muted, fontWeight: 400 }}>· {rows.length}</span></span>
        <button onClick={() => addItem(type)}
          style={{ font: `600 12px ${FONT}`, padding: '6px 12px', borderRadius: 5, cursor: 'pointer', border: 'none', background: C.ink, color: C.accentOnDark }}>+ {isHeure ? 'Heure' : 'Article'}</button>
      </div>
      {rows.length === 0 ? (
        <p style={{ color: C.muted, fontSize: 13, padding: '24px', textAlign: 'center' }}>Aucun {isHeure ? 'poste horaire' : 'article'}.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 880, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, width: '22%' }}>Nom</th>
                <th style={{ ...th, width: '10%' }}>Unité</th>
                {!isHeure && <th style={{ ...thR, width: '9%' }}>Prix achat</th>}
                {!isHeure && <th style={{ ...thR, width: '7%' }}>Marge %</th>}
                <th style={{ ...thR, width: '9%' }}>{isHeure ? 'Tarif' : 'Prix vente'}</th>
                <th style={{ ...thR, width: '6%' }}>TVA %</th>
                <th style={{ ...th, width: '13%' }}>Vendeur</th>
                <th style={{ ...th, width: '16%' }}>Infos</th>
                <th style={{ ...th, width: '4%' }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(it => (
                <tr key={it.id} className="group" style={{ opacity: it.archived ? 0.5 : 1 }}>
                  <td style={{ ...cell, width: '22%' }}>{field(it, 'name', { ...inp, fontWeight: 600 }, 'text', 'Nom')}</td>
                  <td style={cell}>
                    <input list="catalog-units" value={val(it, 'unit')} placeholder="unité"
                      onChange={e => setD(it.id, 'unit', e.target.value)} onBlur={() => commit(it, 'unit')} style={inp} />
                  </td>
                  {!isHeure && <td style={cell}>{field(it, 'purchase_price', inpR, 'number', '0.00')}</td>}
                  {!isHeure && <td style={cell}>{field(it, 'margin', inpR, 'number', '—')}</td>}
                  <td style={cell}>{field(it, 'sale_price', inpR, 'number', '0.00')}</td>
                  <td style={cell}>{field(it, 'vat_rate', inpR, 'number', '8.1')}</td>
                  <td style={cell}>{field(it, 'vendor', inp, 'text', '—')}</td>
                  <td style={cell}>{field(it, 'notes', inp, 'text', '—')}</td>
                  <td style={{ ...cell, textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                      <button title={it.archived ? 'Désarchiver' : 'Archiver'} onClick={() => commitNow(it, 'archived', !it.archived)}
                        style={{ border: 'none', background: 'transparent', color: C.muted, cursor: 'pointer', fontSize: 13, padding: 2 }}>⊘</button>
                      <button title="Supprimer" onClick={() => remove(it)}
                        style={{ border: 'none', background: 'transparent', color: C.muted, cursor: 'pointer', fontSize: 15, padding: 2 }}
                        onMouseEnter={e => e.currentTarget.style.color = C.danger}
                        onMouseLeave={e => e.currentTarget.style.color = C.muted}>×</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <datalist id="catalog-units">{UNITS.map(u => <option key={u} value={u} />)}</datalist>
    </section>
  )
}
