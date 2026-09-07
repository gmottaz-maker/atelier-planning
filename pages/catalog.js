import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from './_app'
import useIsAdmin from '../lib/useIsAdmin'
import useSWR from 'swr'
import Head from 'next/head'
import { AL, C, FONT, MONO, R } from '../lib/theme'
import {
  SANS_CATEGORIE, construireArbre, nbSansCategorie, articlesDe, impactSuppression,
} from '../lib/catalogCategories'

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
  // Réservé à l'admin : la barre latérale masque déjà l'entrée, mais la page
  // restait atteignable par URL.
  const { user } = useAuth()
  const isAdmin = useIsAdmin()
  const gateRouter = useRouter()
  useEffect(() => { if (user && !isAdmin) gateRouter.replace('/') }, [user, isAdmin])
  if (user && !isAdmin) return null
  const { data: items = [], isLoading, mutate } = useSWR('/api/catalog')
  const { data: cats = [], mutate: mutateCats } = useSWR('/api/catalog-categories')
  const list = Array.isArray(items) ? items : []
  const categories = Array.isArray(cats) ? cats : []
  const [selection, setSelection] = useState(null)   // null | id de catégorie | SANS_CATEGORIE
  const [q, setQ] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')   // all | article | heure
  const [showArchived, setShowArchived] = useState(false)
  const [draft, setDraft] = useState({})                // { [id]: {field: value} } édition en cours
  const [importMsg, setImportMsg] = useState('')
  const fileRef = useRef(null)

  async function creerCategorie(parent_id = null) {
    const nom = prompt(parent_id ? 'Nom de la sous-catégorie' : 'Nom de la catégorie')
    if (!nom || !nom.trim()) return
    const r = await fetch('/api/catalog-categories', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nom.trim(), parent_id }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) return alert(d.error || `Erreur ${r.status}`)
    mutateCats()
  }

  async function renommerCategorie(cat) {
    const nom = prompt('Renommer la catégorie', cat.name)
    if (!nom || !nom.trim() || nom.trim() === cat.name) return
    const r = await fetch(`/api/catalog-categories?id=${cat.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nom.trim() }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) return alert(d.error || `Erreur ${r.status}`)
    mutateCats()
  }

  // La suppression emporte les sous-catégories ET les articles. C'est le
  // comportement choisi, et rien ne le restaure : la confirmation NOMME donc
  // ce qui va disparaître. « Êtes-vous sûr ? » ne renseigne personne.
  async function supprimerCategorie(cat) {
    const impact = impactSuppression(cat.id, categories, list)
    const perdu = [
      impact.sousCategories && `${impact.sousCategories} sous-catégorie${impact.sousCategories > 1 ? 's' : ''}`,
      impact.articles && `${impact.articles} article${impact.articles > 1 ? 's' : ''}`,
    ].filter(Boolean).join(' et ')
    const message = perdu
      ? `Supprimer « ${cat.name} » ?\n\nCela supprimera aussi ${perdu}. Cette action est DÉFINITIVE — rien ne les restaure.`
      : `Supprimer « ${cat.name} » ? Elle est vide.`
    if (!confirm(message)) return
    const r = await fetch(`/api/catalog-categories?id=${cat.id}`, { method: 'DELETE' })
    if (!r.ok) { const d = await r.json().catch(() => ({})); return alert(d.error || `Erreur ${r.status}`) }
    if (String(selection) === String(cat.id)) setSelection(null)
    mutateCats(); mutate()
  }

  const needle = q.trim().toLowerCase()

  // L'arbre se construit sur les articles filtrés par TYPE et archivage, mais
  // pas par la sélection de catégorie ni la recherche : sinon les compteurs
  // changeraient à chaque frappe, et une catégorie disparaîtrait au moment
  // précis où on la sélectionne.
  const pourArbre = list
    .filter(it => showArchived ? true : !it.archived)
    .filter(it => typeFilter === 'all' ? true : it.type === typeFilter)
  const arbre = construireArbre(categories, pourArbre)
  const orphelins = nbSansCategorie(pourArbre)

  const filtered = articlesDe(selection, pourArbre, categories)
    .filter(it => !needle || [it.name, it.vendor, it.notes, it.unit].filter(Boolean).join(' ').toLowerCase().includes(needle))

  // Une ligne sans nom vient d'être créée : elle passe en tête. Le serveur trie
  // par nom et PostgREST range les NULL en dernier — la nouvelle ligne
  // atterrissait donc en bas d'un catalogue de cinquante articles, et le bouton
  // avait l'air de ne rien faire.
  const sansNomDabord = (a, b) => (a.name ? 1 : 0) - (b.name ? 1 : 0)
  const articles = filtered.filter(it => it.type !== 'heure').sort(sansNomDabord)
  const heures = filtered.filter(it => it.type === 'heure').sort(sansNomDabord)

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
    // Créé DANS la catégorie sélectionnée : ajouter un article depuis
    // « Bois › Panneaux » puis devoir le ranger serait absurde.
    const dansCategorie = selection && selection !== SANS_CATEGORIE ? Number(selection) : null
    const body = { type, name: '', unit: type === 'heure' ? 'heure(s)' : '', vat_rate: 8.1, category_id: dansCategorie }
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
              style={{ font: `600 12px ${FONT}`, padding: '6px 14px', borderRadius: R.pill, cursor: 'pointer',
                border: `1px solid ${typeFilter === k ? 'transparent' : C.border}`,
                background: typeFilter === k ? C.ink : C.surface, color: typeFilter === k ? AL.white : C.inkSecondary }}>{lbl}</button>
          ))}
          <button onClick={() => setShowArchived(s => !s)}
            style={{ font: `600 12px ${FONT}`, padding: '6px 14px', borderRadius: R.pill, cursor: 'pointer', border: `1px solid ${C.border}`,
              background: showArchived ? C.ink : C.surface, color: showArchived ? AL.white : C.inkSecondary }}>
            {showArchived ? 'Archivés inclus' : 'Actifs'}
          </button>
          {importMsg && <span style={{ font: `12px ${MONO}`, color: C.muted }}>{importMsg}</span>}
        </div>

        {isLoading ? (
          <p style={{ color: C.muted, fontSize: 13, padding: '40px 0', textAlign: 'center' }}>Chargement…</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '236px minmax(0,1fr)', gap: 22, alignItems: 'start' }}>
            <ArbreCategories
              arbre={arbre} orphelins={orphelins} total={pourArbre.length}
              selection={selection} onSelect={setSelection}
              onCreer={creerCategorie} onRenommer={renommerCategorie} onSupprimer={supprimerCategorie} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
              {(typeFilter === 'all' || typeFilter === 'article') && (
                <CatalogTable title="Articles" type="article" rows={articles}
                  val={val} setD={setD} commit={commit} commitNow={commitNow} remove={remove} addItem={addItem}
                  categories={categories} montrerCategorie={selection === null} />
              )}
              {(typeFilter === 'all' || typeFilter === 'heure') && (
                <CatalogTable title="Heures" type="heure" rows={heures}
                  val={val} setD={setD} commit={commit} commitNow={commitNow} remove={remove} addItem={addItem}
                  categories={categories} montrerCategorie={selection === null} />
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

// L'arbre sert de FILTRE et ne se déplie pas : avec une dizaine de catégories,
// un accordéon ajoute un clic à chaque consultation sans rien économiser.
//
// Une catégorie vide sous le filtre courant a déjà été retirée par
// `construireArbre` — c'est ce qui évite d'avoir à typer les catégories
// (« Bois » n'a rien à faire dans l'arbre quand on regarde les heures).
function ArbreCategories({ arbre, orphelins, total, selection, onSelect, onCreer, onRenommer, onSupprimer }) {
  const ligne = (actif, decale) => ({
    display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
    padding: decale ? '6px 9px 6px 25px' : '6px 9px', borderRadius: R.pill, cursor: 'pointer',
    border: 'none', font: `${decale ? 400 : 500} ${decale ? 13 : 13.5}px ${FONT}`,
    background: actif ? C.ink : 'transparent', color: actif ? AL.white : C.ink,
  })
  const compte = (actif) => ({ marginLeft: 'auto', font: `11.5px ${MONO}`,
    color: actif ? 'rgba(255,255,255,.7)' : C.muted })

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: R.panel, padding: '12px 8px' }}>
      <h4 style={{ margin: '2px 8px 10px', font: `500 10.5px ${MONO}`, letterSpacing: '.1em',
        textTransform: 'uppercase', color: C.muted }}>Catégories</h4>

      <button onClick={() => onSelect(null)} style={ligne(selection === null, false)}>
        Tout le catalogue <span style={compte(selection === null)}>{total}</span>
      </button>

      <div style={{ height: 1, background: C.divider, margin: '9px 8px' }} />

      {arbre.map(cat => {
        const actif = String(selection) === String(cat.id)
        return (
          <div key={cat.id} className="group">
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <button onClick={() => onSelect(cat.id)} style={ligne(actif, false)}>
                {cat.name} <span style={compte(actif)}>{cat.nb}</span>
              </button>
              <span style={{ display: 'flex', gap: 2, opacity: 0, flex: 'none' }} className="group-hover:opacity-100">
                <BoutonMini titre="Ajouter une sous-catégorie" onClick={() => onCreer(cat.id)}>+</BoutonMini>
                <BoutonMini titre="Renommer" onClick={() => onRenommer(cat)}>✎</BoutonMini>
                <BoutonMini titre="Supprimer" danger onClick={() => onSupprimer(cat)}>×</BoutonMini>
              </span>
            </div>
            {cat.enfants.map(e => {
              const actifE = String(selection) === String(e.id)
              return (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center' }} className="group/e">
                  <button onClick={() => onSelect(e.id)} style={ligne(actifE, true)}>
                    {e.name} <span style={compte(actifE)}>{e.nb}</span>
                  </button>
                  <span style={{ display: 'flex', gap: 2, opacity: 0, flex: 'none' }} className="group-hover/e:opacity-100">
                    <BoutonMini titre="Renommer" onClick={() => onRenommer(e)}>✎</BoutonMini>
                    <BoutonMini titre="Supprimer" danger onClick={() => onSupprimer(e)}>×</BoutonMini>
                  </span>
                </div>
              )
            })}
          </div>
        )
      })}

      {/* Les articles non rangés restent VISIBLES : sans cette entrée, ils
          n'apparaîtraient que dans « Tout le catalogue » et on oublierait de
          les classer. */}
      {orphelins > 0 && (
        <button onClick={() => onSelect(SANS_CATEGORIE)}
          style={{ ...ligne(selection === SANS_CATEGORIE, false),
            color: selection === SANS_CATEGORIE ? AL.white : C.muted }}>
          Sans catégorie <span style={compte(selection === SANS_CATEGORIE)}>{orphelins}</span>
        </button>
      )}

      <div style={{ height: 1, background: C.divider, margin: '9px 8px' }} />
      <button onClick={() => onCreer(null)}
        style={{ padding: '6px 9px', background: 'none', border: 'none', cursor: 'pointer',
          font: `500 12px ${FONT}`, color: C.violet }}>
        + catégorie
      </button>
    </div>
  )
}

function BoutonMini({ children, titre, onClick, danger }) {
  return (
    <button title={titre} onClick={onClick}
      style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: R.pill, border: 'none', background: 'transparent', color: C.muted,
        cursor: 'pointer', fontSize: 12, flex: 'none' }}
      onMouseEnter={e => { e.currentTarget.style.color = danger ? C.danger : AL.black }}
      onMouseLeave={e => { e.currentTarget.style.color = C.muted }}>
      {children}
    </button>
  )
}

function CatalogTable({ title, type, rows, val, setD, commit, commitNow, remove, addItem, categories, montrerCategorie }) {
  const th = { font: `500 10px ${MONO}`, letterSpacing: '.06em', color: C.muted, textTransform: 'uppercase', padding: '8px 8px', textAlign: 'left', whiteSpace: 'nowrap' }
  const thR = { ...th, textAlign: 'right' }
  const cell = { padding: '2px 4px', borderTop: `1px solid ${C.divider}` }
  const inp = { width: '100%', padding: '6px 8px', borderRadius: R.pill, border: `1px solid transparent`, background: 'transparent', font: `13px ${FONT}`, color: C.ink }
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
    <section style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.panel, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${C.divider}` }}>
        <span style={{ font: `700 14px ${FONT}` }}>{title} <span style={{ color: C.muted, fontWeight: 400 }}>· {rows.length}</span></span>
        <button onClick={() => addItem(type)}
          style={{ font: `600 12px ${FONT}`, padding: '6px 12px', borderRadius: R.pill, cursor: 'pointer', border: 'none', background: C.ink, color: C.accentOnDark }}>+ {isHeure ? 'Heure' : 'Article'}</button>
      </div>
      {rows.length === 0 ? (
        <p style={{ color: C.muted, fontSize: 13, padding: '24px', textAlign: 'center' }}>Aucun {isHeure ? 'poste horaire' : 'article'}.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 880, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, width: montrerCategorie ? '20%' : '24%' }}>Nom</th>
                {montrerCategorie && <th style={{ ...th, width: '14%' }}>Catégorie</th>}
                <th style={{ ...th, width: '9%' }}>Unité</th>
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
                  <td style={cell}>{field(it, 'name', { ...inp, fontWeight: 600 }, 'text', 'Nom')}</td>
                  {/* La colonne n'apparaît que sur « Tout le catalogue » : dans
                      « Bois › Panneaux », la répéter sur chaque ligne ne dit
                      rien. Un select plutôt qu'un champ libre — c'est tout
                      l'intérêt d'avoir une table de catégories. */}
                  {montrerCategorie && (
                    <td style={cell}>
                      <select value={it.category_id || ''} style={{ ...inp, cursor: 'pointer' }}
                        onChange={e => commitNow(it, 'category_id', e.target.value ? Number(e.target.value) : null)}>
                        <option value="">— sans catégorie —</option>
                        {(categories || []).filter(c => !c.parent_id).map(parent => (
                          <optgroup key={parent.id} label={parent.name}>
                            <option value={parent.id}>{parent.name}</option>
                            {(categories || []).filter(c => String(c.parent_id) === String(parent.id))
                              .map(e => <option key={e.id} value={e.id}>{`  ${e.name}`}</option>)}
                          </optgroup>
                        ))}
                      </select>
                    </td>
                  )}
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
