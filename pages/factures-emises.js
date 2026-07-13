import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { useAuth } from './_app'
import NavBar from '../components/NavBar'
import useIsAdmin from '../lib/useIsAdmin'
import adminFetch from '../lib/adminFetch'
import ContactPicker from '../components/ContactPicker'
import CatalogPicker, { toPurchaseRow, toRateRow } from '../components/CatalogPicker'
import SendDocumentModal from '../components/SendDocumentModal'
import { pdfFilename } from '../lib/pdfFilename'

const PINK = '#111827'
const STATUS_LABELS = { created: 'Créée', sent: 'Envoyée', pending: 'En attente', paid: 'Payée', overdue: 'En retard', cancelled: 'Annulée' }
const STATUS_COLORS = { created: '#6b7280', sent: '#1d4ed8', pending: '#f59e0b', paid: '#22c55e', overdue: '#dc2626', cancelled: '#9ca3af' }

function fmtCHF(n) {
  if (n == null) return '—'
  return new Intl.NumberFormat('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}
function fmtDate(s) {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}.${m}.${y}`
}

// ── Snapshot de devis ──────────────────────────────────────────────
// Nouveau format (groupé par item) vs ancien format plat.
const _num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n }
const _uid = () => `r_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
// Escompte par ligne : % puis montant CHF, sur le montant facturé (borné à 0).
const applyDiscount = (amt, r) => Math.max(0, amt * (1 - _num(r.discount) / 100) - _num(r.discount_amount))
function isGroupedQuote(q) {
  return !!q && (Array.isArray(q.items) || Array.isArray(q.management))
}
// Aplatit un devis groupé { management, items, subcontracting, logistics } en
// lignes plates { purchases, labor, logistics } — marges résolues dans les
// montants facturables (pour le total et l'éditeur de lignes).
function flattenQuote(q) {
  q = q || {}
  const gm = q.general_margin ?? ''
  const effMargin = r => (r?.margin !== '' && r?.margin != null ? _num(r.margin) : _num(gm))
  if (!isGroupedQuote(q)) {
    return {
      purchases: (q.purchases || []).map(r => ({ ...r, _uid: r._uid || _uid() })),
      labor:     (q.labor     || []).map(r => ({ ...r, _uid: r._uid || _uid() })),
      logistics: (q.logistics || []).map(r => ({ ...r, _uid: r._uid || _uid() })),
    }
  }
  const purchases = []
  const labor = (q.management || []).map(r => ({
    ...r, item: r.item || 'Gestion de projet / visuel', _uid: r._uid || _uid(),
  }))
  for (const it of (q.items || [])) {
    const itemName = it.name || 'Item'
    for (const r of (it.purchases || [])) {
      purchases.push({
        ...r, item: itemName,
        margin: r.margin !== '' && r.margin != null ? r.margin : gm,
        _uid: r._uid || _uid(),
      })
    }
    for (const r of (it.labor || [])) labor.push({ ...r, item: itemName, _uid: r._uid || _uid() })
  }
  for (const r of (q.subcontracting || [])) {
    labor.push({
      ...r,
      item: r.item ? `Sous-traitance · ${r.item}` : 'Sous-traitance',
      rate: (_num(r.rate) * (1 + effMargin(r) / 100)).toFixed(2),
      _uid: r._uid || _uid(),
    })
  }
  // Logistique : marge propre à la ligne sinon 0 (jamais la marge générale) —
  // cohérent avec buildQuoteSections/l'offre.
  const marginLog = r => (r?.margin !== '' && r?.margin != null ? _num(r.margin) : 0)
  const logistics = (q.logistics || []).map(r => ({
    ...r, rate: (_num(r.rate) * (1 + marginLog(r) / 100)).toFixed(2), _uid: r._uid || _uid(),
  }))
  return { purchases, labor, logistics }
}

function effectiveStatus(inv) {
  if (inv.status === 'paid' || inv.status === 'cancelled') return inv.status
  if (inv.status === 'created') return 'created'
  // envoyée / en attente : passe en retard si échéance dépassée
  if (inv.due_date && new Date(inv.due_date) < new Date()) return 'overdue'
  return inv.status === 'sent' ? 'sent' : 'pending'
}

export default function FacturesEmises() {
  const router = useRouter()
  const { user } = useAuth()
  const isAdmin = useIsAdmin()
  useEffect(() => { if (user && !isAdmin) router.replace('/') }, [user, isAdmin])
  if (user && !isAdmin) return null
  const [invoices, setInvoices] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading]   = useState(true)
  const [year, setYear]         = useState(new Date().getFullYear())
  const [filter, setFilter]     = useState('all')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing]   = useState(null)
  const [createForProject, setCreateForProject] = useState(null)

  // Si on arrive avec ?from=projectId, ouvrir la création pré-remplie
  useEffect(() => {
    if (router.query.from && projects.length > 0 && !drawerOpen) {
      setCreateForProject(String(router.query.from))
      setEditing(null)
      setDrawerOpen(true)
    }
  }, [router.query.from, projects.length])

  async function load() {
    setLoading(true)
    const [r1, r2] = await Promise.all([
      adminFetch(`/api/customer-invoices?year=${year}`).then(r => r.json()),
      adminFetch('/api/projects').then(r => r.json()),
    ])
    setInvoices(Array.isArray(r1) ? r1 : [])
    setProjects(Array.isArray(r2) ? r2.filter(p => p.status === 'active') : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [year])

  async function downloadPdf(inv, mode) {
    try {
      const r = await fetch(`/api/customer-invoices/${inv.id}/pdf?mode=${mode}`)
      if (!r.ok) {
        let msg = `Erreur ${r.status}`
        try { const j = await r.json(); if (j.error) msg = j.error } catch (_) {}
        throw new Error(msg)
      }
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = pdfFilename('facture', inv.projects?.name || inv.client_name)
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (e) { alert('Téléchargement impossible : ' + e.message) }
  }
  async function markSent(inv) {
    const sent_at = new Date().toISOString()
    setInvoices(prev => prev.map(x => x.id === inv.id ? { ...x, status: 'sent', sent_at } : x))
    await adminFetch(`/api/customer-invoices/${inv.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'sent', sent_at }) })
    load()
  }
  const [sendDoc, setSendDoc] = useState(null)
  function openSend(inv) {
    const proj = projects.find(p => String(p.id) === String(inv.project_id))
    setSendDoc({ type: 'facture', docId: inv.id, contactId: proj?.client_contact_id, projectName: proj?.name || inv.client_name, number: inv.invoice_number })
  }

  const visible = invoices.filter(inv => filter === 'all' ? true : effectiveStatus(inv) === filter)
  const totals = invoices.reduce((acc, inv) => {
    const st = effectiveStatus(inv)
    acc.total += parseFloat(inv.amount || 0)
    if (st === 'pending') acc.pending += parseFloat(inv.amount || 0)
    if (st === 'overdue') acc.overdue += parseFloat(inv.amount || 0)
    if (st === 'paid')    acc.paid    += parseFloat(inv.amount || 0)
    return acc
  }, { total: 0, pending: 0, overdue: 0, paid: 0 })

  return (
    <div className="min-h-screen" style={{ background: '#fafafa' }}>
      <Head><title>Maze Project — Factures émises</title></Head>

      <NavBar title="Factures émises">
        <button onClick={() => { setEditing(null); setDrawerOpen(true) }}
          className="px-4 py-2 text-sm font-medium rounded-md text-white"
          style={{ background: PINK }}>+ Nouvelle facture</button>
      </NavBar>

      <main className="w-full px-4 md:px-10 py-6 md:py-10 space-y-6" style={{ maxWidth: 1600, margin: '0 auto' }}>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Total année', value: totals.total,   color: '#111827' },
            { label: 'En attente',  value: totals.pending, color: '#f59e0b' },
            { label: 'En retard',   value: totals.overdue, color: '#dc2626' },
            { label: 'Encaissé',    value: totals.paid,    color: '#22c55e' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
              <div className="text-xs text-gray-500 mb-1">{s.label}</div>
              <div className="font-semibold tabular-nums" style={{ fontSize: 22, color: s.color, letterSpacing: '-0.02em' }}>
                {fmtCHF(s.value)} <span className="text-xs font-normal text-gray-400">CHF</span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="px-3 py-1.5 border border-gray-200 rounded-md text-sm bg-white">
            {[2026, 2025, 2024, 2023].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {['all', 'pending', 'overdue', 'paid', 'cancelled'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className="px-3 py-1.5 rounded-md text-xs font-medium"
              style={filter === f ? { background: '#111827', color: 'white' } : { background: '#f3f4f6', color: '#6b7280' }}>
              {f === 'all' ? 'Toutes' : STATUS_LABELS[f]}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-sm text-gray-400 py-12 text-center">Chargement…</p>
        ) : visible.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <p className="text-sm text-gray-400">Aucune facture.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-3 text-left font-semibold text-gray-700" style={{ fontSize: 11 }}>N°</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700" style={{ fontSize: 11 }}>Client</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700" style={{ fontSize: 11 }}>Projet</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700" style={{ fontSize: 11 }}>Émise le</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700" style={{ fontSize: 11 }}>Échéance</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700" style={{ fontSize: 11 }}>Montant</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700" style={{ fontSize: 11 }}>Statut</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700" style={{ fontSize: 11 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(inv => {
                  const st = effectiveStatus(inv)
                  return (
                    <tr key={inv.id} className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer"
                      onClick={() => { setEditing(inv); setDrawerOpen(true) }}>
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">{inv.invoice_number}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{inv.client_name}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs truncate" style={{ maxWidth: 200 }}>{inv.projects?.name || '—'}</td>
                      <td className="px-4 py-3 text-gray-600 tabular-nums">{fmtDate(inv.issue_date)}</td>
                      <td className="px-4 py-3 text-gray-600 tabular-nums">{fmtDate(inv.due_date)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">
                        {fmtCHF(inv.amount)} <span className="text-xs font-normal text-gray-400">{inv.currency}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold inline-block"
                          style={{ background: STATUS_COLORS[st] + '18', color: STATUS_COLORS[st] }}>
                          {STATUS_LABELS[st]}
                        </span>
                        {inv.sent_at && (st === 'sent' || st === 'paid') && (
                          <span className="ml-2 text-xs text-gray-400">le {fmtDate(inv.sent_at.slice(0, 10))}</span>
                        )}
                      </td>
                      <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5 justify-end whitespace-nowrap">
                          <button title="Télécharger la facture détaillée (PDF + QR)" onClick={() => downloadPdf(inv, 'detailed')}
                            className="text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded px-2 py-1">⤓ Détaillée</button>
                          <button title="Télécharger la facture résumée (PDF + QR)" onClick={() => downloadPdf(inv, 'summary')}
                            className="text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded px-2 py-1">⤓ Résumée</button>
                          <button title="Envoyer la facture par e-mail" onClick={() => openSend(inv)}
                            className="text-xs font-medium text-gray-500 hover:text-gray-900 border border-gray-200 rounded px-2 py-1">✉</button>
                          {(st === 'sent' || st === 'paid' || st === 'cancelled') ? null : (
                            <button title="Marquer comme envoyée (avec date du jour)" onClick={() => markSent(inv)}
                              className="text-xs font-medium border rounded px-2 py-1" style={{ color: '#1d4ed8', borderColor: '#bfdbfe' }}>✓ Envoyée</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {drawerOpen && (
        <CustomerInvoiceDrawer
          invoice={editing}
          projects={projects}
          initialProjectId={createForProject}
          onClose={() => { setDrawerOpen(false); setEditing(null); setCreateForProject(null) }}
          onSaved={() => { setDrawerOpen(false); setEditing(null); setCreateForProject(null); load() }}
        />
      )}

      {sendDoc && (
        <SendDocumentModal
          type={sendDoc.type} docId={sendDoc.docId} mode={sendDoc.mode}
          contactId={sendDoc.contactId} projectName={sendDoc.projectName} number={sendDoc.number}
          onClose={() => setSendDoc(null)} onSent={() => load()} />
      )}
    </div>
  )
}

function CustomerInvoiceDrawer({ invoice, projects, initialProjectId, onClose, onSaved }) {
  const isEdit = !!invoice
  const [form, setForm] = useState({
    project_id:     invoice?.project_id || initialProjectId || '',
    client_name:    invoice?.client_name || '',
    client_address: invoice?.client_address || '',
    amount:         invoice?.amount ?? '',
    vat_rate:       invoice?.vat_rate ?? '8.1',
    currency:       invoice?.currency || 'CHF',
    issue_date:     invoice?.issue_date || new Date().toISOString().slice(0, 10),
    due_date:       invoice?.due_date || '',
    iban_recipient: invoice?.iban_recipient || '',
    notes:          invoice?.notes || '',
    status:         invoice?.status || 'created',
    detail_level:   invoice?.detail_level || 'detailed',
  })
  const [lines, setLines]   = useState(() => flattenQuote(invoice?.quote_snapshot))
  // Devis groupé source à re-sauvegarder tel quel (préserve le découpage par
  // item). null dès que l'utilisateur édite les lignes à la main → on retombe
  // sur le format plat.
  const [pickedQuoteData, setPickedQuoteData] = useState(
    isGroupedQuote(invoice?.quote_snapshot) ? invoice.quote_snapshot : null
  )
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  // Recompute total when lines change (les positions sont HT, on applique la TVA globale)
  const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n }
  const linesNet =
    lines.purchases.reduce((s, r) => s + applyDiscount(num(r.unit_price) * num(r.quantity) * (1 + num(r.margin)/100), r), 0) +
    lines.labor.reduce((s, r) => s + applyDiscount(num(r.rate) * num(r.quantity), r), 0) +
    lines.logistics.reduce((s, r) => s + applyDiscount(num(r.rate) * num(r.quantity), r), 0)
  const vatRate     = num(form.vat_rate)
  const linesVat    = linesNet * (vatRate / 100)
  const linesGross  = linesNet + linesVat
  const recomputedTotal = linesGross

  function genUid() { return `r_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` }
  function addLine(t) {
    const empty = t === 'purchases'
      ? { _uid: genUid(), item:'', description:'', dimension:'', unit_price:'', quantity:'', margin:'' }
      : t === 'logistics'
        ? { _uid: genUid(), trajet:'', description:'', rate:'', quantity:'' }
        : { _uid: genUid(), item:'', description:'', rate:'', quantity:'' }
    setPickedQuoteData(null)
    setLines(L => ({ ...L, [t]: [...L[t], empty] }))
  }
  function updLine(t, i, k, v) {
    setPickedQuoteData(null)
    setLines(L => ({ ...L, [t]: L[t].map((r, ix) => ix === i ? { ...r, [k]: v } : r) }))
  }
  function rmLine(t, i) {
    setPickedQuoteData(null)
    setLines(L => ({ ...L, [t]: L[t].filter((_, ix) => ix !== i) }))
  }
  // Ajout d'une ligne pré-remplie depuis le catalogue
  function addFilled(t, pre) {
    setPickedQuoteData(null)
    setLines(L => ({ ...L, [t]: [...L[t], { _uid: genUid(), ...pre }] }))
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  // Auto-pré-remplir si on arrive depuis un projet
  useEffect(() => {
    if (!isEdit && initialProjectId && projects.length > 0) {
      pickProject(initialProjectId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialProjectId, projects.length])

  // Pré-remplir depuis le projet. On conserve le devis groupé tel quel dans
  // pickedQuoteData (→ snapshot qui préserve le découpage par item pour le PDF),
  // et on l'aplatit en lignes plates pour le total et l'éditeur.
  function pickProject(pid) {
    const p = projects.find(x => x.id === pid)
    if (!p) { set('project_id', pid); return }
    const q = p.quote_data || {}
    const flat = flattenQuote(q)

    setPickedQuoteData(isGroupedQuote(q) ? q : null)

    const total =
      flat.purchases.reduce((s, r) => s + applyDiscount(num(r.unit_price) * num(r.quantity) * (1 + num(r.margin)/100), r), 0) +
      flat.labor    .reduce((s, r) => s + applyDiscount(num(r.rate) * num(r.quantity), r), 0) +
      flat.logistics.reduce((s, r) => s + applyDiscount(num(r.rate) * num(r.quantity), r), 0)
    setForm(f => ({
      ...f,
      project_id: pid,
      client_name: p.client || f.client_name,
      client_address: p.client_address || f.client_address,
      amount: total > 0 ? total.toFixed(2) : f.amount,
    }))
    setLines(flat)
  }

  async function save() {
    if (!form.client_name) { setError('Client requis'); return }
    setSaving(true); setError('')
    try {
      const hasLines = lines.purchases.length + lines.labor.length + lines.logistics.length > 0
      // Si on a des lignes: total HT vient des lignes; sinon: form.amount est déjà TTC saisi à la main
      const gross = hasLines ? linesGross : num(form.amount)
      const net   = hasLines ? linesNet   : (vatRate >= 0 ? gross / (1 + vatRate / 100) : gross)
      const vat   = gross - net
      // On fige le devis groupé tel quel (préserve le découpage par item pour le
      // PDF) si l'utilisateur n'a pas édité les lignes à la main ; sinon le plat.
      const snapshotToSave = pickedQuoteData || (hasLines ? lines : null)
      const baseBody = {
        ...form,
        amount: gross.toFixed(2),
        amount_net: net.toFixed(2),
        vat_amount: vat.toFixed(2),
      }
      const body = { ...baseBody, quote_snapshot: snapshotToSave }
      const r = isEdit
        ? await adminFetch(`/api/customer-invoices/${invoice.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        : await adminFetch('/api/customer-invoices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
      const d = await r.json()
      if (d.error) { setError(d.error); return }
      onSaved()
    } finally { setSaving(false) }
  }

  async function del() {
    if (!confirm('Supprimer cette facture ?')) return
    await adminFetch(`/api/customer-invoices/${invoice.id}`, { method: 'DELETE' })
    onSaved()
  }

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const inputCls = "w-full px-3 py-2 border border-gray-200 rounded-md text-sm bg-white focus:border-gray-400 focus:outline-none"

  return (
    <>
      <style>{`@keyframes drawerSlide { from { transform: translateX(100%);} to { transform: translateX(0);} }`}</style>
      <div className="fixed inset-0 z-50" style={{ background: 'rgba(15,23,42,0.35)' }}
        onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="fixed top-0 right-0 bottom-0 bg-white flex flex-col shadow-2xl"
          style={{ width: '100%', maxWidth: 560, animation: 'drawerSlide 0.2s ease both', fontFamily: 'Inter, sans-serif' }}>

          <div className="flex items-center justify-between px-8 py-5 border-b border-gray-100">
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-400 mb-0.5">
                {isEdit ? `Facture ${invoice.invoice_number}` : 'Nouvelle facture'}
              </p>
              <h2 className="font-semibold text-gray-900" style={{ fontSize: 20 }}>{form.client_name || 'Sans client'}</h2>
            </div>
            <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-100" style={{ fontSize: 22 }}>×</button>
          </div>

          <div className="flex-1 overflow-y-auto px-8 py-6 space-y-4">
            {!isEdit && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Projet (pré-remplit le montant depuis l'offre)</label>
                <select className={inputCls} value={form.project_id} onChange={e => pickProject(e.target.value)}>
                  <option value="">— Aucun —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name} · {p.client}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Depuis la base contacts</label>
              <ContactPicker onSelect={({ name, address }) => setForm(f => ({ ...f, client_name: name, client_address: address || f.client_address }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Client *</label>
              <input className={inputCls} value={form.client_name} onChange={e => set('client_name', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Adresse client</label>
              <textarea rows={3} className={inputCls} value={form.client_address} onChange={e => set('client_address', e.target.value)}
                placeholder="Société Sàrl&#10;Rue X 12&#10;1200 Genève" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Type de facture (PDF)</label>
              <div className="inline-flex rounded-md border border-gray-200 overflow-hidden text-sm">
                {[{ k: 'detailed', l: 'Détaillée' }, { k: 'summary', l: 'Résumée' }].map(o => (
                  <button key={o.k} type="button" onClick={() => set('detail_level', o.k)}
                    className="px-4 py-1.5 font-medium"
                    style={form.detail_level === o.k ? { background: '#111827', color: '#fff' } : { background: '#fff', color: '#6b7280' }}>
                    {o.l}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">Détaillée = lignes du devis ; Résumée = total seul. Modifiable, et disponible aux deux formats au téléchargement.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  Total TTC {(lines.purchases.length + lines.labor.length + lines.logistics.length) > 0 ? '(calculé)' : '*'}
                </label>
                <input type="number" step="0.01" className={inputCls}
                  value={(lines.purchases.length + lines.labor.length + lines.logistics.length) > 0
                    ? linesGross.toFixed(2) : form.amount}
                  readOnly={(lines.purchases.length + lines.labor.length + lines.logistics.length) > 0}
                  onChange={e => set('amount', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Devise</label>
                <select className={inputCls} value={form.currency} onChange={e => set('currency', e.target.value)}>
                  <option>CHF</option><option>EUR</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1.5">TVA</label>
                <select className={inputCls} value={form.vat_rate} onChange={e => set('vat_rate', e.target.value)}>
                  <option value="8.1">8.1% (normal)</option>
                  <option value="2.6">2.6% (réduit)</option>
                  <option value="3.8">3.8% (hébergement)</option>
                  <option value="0">0% (exempt)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Émise le</label>
                <input type="date" className={inputCls} value={form.issue_date} onChange={e => set('issue_date', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Échéance</label>
                <input type="date" className={inputCls} value={form.due_date} onChange={e => set('due_date', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1.5">IBAN bénéficiaire (laissé vide = config par défaut)</label>
                <input className={inputCls} value={form.iban_recipient} onChange={e => set('iban_recipient', e.target.value)} placeholder="CH..." />
              </div>
              {isEdit && (
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Statut</label>
                  <select className={inputCls} value={form.status} onChange={e => set('status', e.target.value)}>
                    <option value="pending">En attente</option>
                    <option value="paid">Payée</option>
                    <option value="overdue">En retard</option>
                    <option value="cancelled">Annulée</option>
                  </select>
                </div>
              )}
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Notes</label>
                <textarea rows={2} className={inputCls} value={form.notes} onChange={e => set('notes', e.target.value)} />
              </div>
            </div>

            {/* ── Positions ── */}
            <div className="border-t border-gray-100 pt-4">
              <h3 className="font-semibold text-gray-900 mb-3" style={{ fontSize: 14 }}>Positions (HT)</h3>
              <LinesEditor lines={lines} addLine={addLine} updLine={updLine} rmLine={rmLine} addFilled={addFilled} />
              <div className="mt-3 pt-3 border-t border-gray-100 space-y-1">
                <div className="flex justify-between items-baseline text-xs text-gray-600">
                  <span>Sous-total HT</span>
                  <span className="font-medium tabular-nums">{linesNet.toFixed(2)} {form.currency}</span>
                </div>
                <div className="flex justify-between items-baseline text-xs text-gray-600">
                  <span>TVA {form.vat_rate}%</span>
                  <span className="font-medium tabular-nums">{linesVat.toFixed(2)} {form.currency}</span>
                </div>
                <div className="flex justify-between items-baseline pt-1 border-t border-gray-100">
                  <span className="text-xs text-gray-500 font-semibold">Total TTC</span>
                  <span className="font-bold tabular-nums text-gray-900" style={{ fontSize: 16 }}>
                    {linesGross.toFixed(2)} {form.currency}
                  </span>
                </div>
              </div>
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}

            {isEdit && (
              <button type="button" onClick={async () => {
                // Fetch authentifié (JWT injecté dans _app.js) puis ouverture en blob :
                // un <a href> direct n'enverrait pas le token et prendrait un 401.
                try {
                  const r = await fetch(`/api/customer-invoices/${invoice.id}/pdf`)
                  if (!r.ok) throw new Error(`Erreur ${r.status}`)
                  const blob = await r.blob()
                  const url = URL.createObjectURL(blob)
                  window.open(url, '_blank', 'noopener')
                  setTimeout(() => URL.revokeObjectURL(url), 60000)
                } catch (e) {
                  alert('Téléchargement du PDF impossible : ' + e.message)
                }
              }}
                className="block w-full text-center px-4 py-2 rounded-md text-sm font-medium border border-gray-300 text-gray-700 hover:border-gray-400">
                📄 Télécharger le PDF avec QR-bill
              </button>
            )}
          </div>

          <div className="px-8 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
            {isEdit ? (
              <button onClick={del} className="text-sm font-medium text-red-500 hover:text-red-700">Supprimer</button>
            ) : <span />}
            <div className="flex gap-2">
              <button onClick={onClose} className="px-4 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100">Annuler</button>
              <button onClick={save} disabled={saving}
                className="px-5 py-2 rounded-md text-white font-medium text-sm disabled:opacity-50"
                style={{ background: '#111827' }}>
                {saving ? 'Enregistrement…' : isEdit ? 'Mettre à jour' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function LinesEditor({ lines, addLine, updLine, rmLine, addFilled }) {
  const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n }
  const sec = 'mb-4'
  const inputSm = 'w-full px-2 py-1 border border-gray-200 rounded text-xs bg-white focus:border-gray-400 focus:outline-none'

  function Section({ title, type, columns, rows, computeRowTotal, catalogKind }) {
    const mapFn = type === 'purchases' ? toPurchaseRow : toRateRow
    return (
      <div className={sec}>
        <div className='flex items-center justify-between mb-1.5'>
          <span className='text-xs font-semibold text-gray-700 uppercase tracking-wider'>{title}</span>
          <span className='flex items-center gap-2'>
            <CatalogPicker kind={catalogKind} onPick={it => addFilled(type, mapFn(it))} />
            <button type='button' onClick={() => addLine(type)}
              className='text-xs font-medium text-gray-500 hover:text-gray-900'>+ Ligne</button>
          </span>
        </div>
        {rows.length === 0 ? (
          <p className='text-xs text-gray-400 italic py-1'>Aucune ligne</p>
        ) : (
          <div className='space-y-1.5'>
            {rows.map((r, i) => (
              <div key={r._uid || i} className='group grid gap-1' style={{ gridTemplateColumns: columns.map(c => c.w).join(' ') }}>
                {columns.map(c => (
                  <input key={c.k} type={c.type || 'text'} className={inputSm} placeholder={c.placeholder || c.label}
                    value={r[c.k] || ''} onChange={e => updLine(type, i, c.k, e.target.value)}
                    style={{ textAlign: c.align || 'left' }} />
                ))}
                <div className='text-xs text-right font-semibold text-gray-900 tabular-nums self-center pr-1'>
                  {computeRowTotal(r).toFixed(2)}
                </div>
                <button type='button' onClick={() => rmLine(type, i)}
                  className='text-gray-300 hover:text-red-500 text-sm opacity-0 group-hover:opacity-100 self-center'>×</button>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <Section title='Achats / matériel' type='purchases'
        columns={[
          { k: 'item',        w: '1.2fr', placeholder: 'Item' },
          { k: 'description', w: '1.8fr', placeholder: 'Description' },
          { k: 'unit_price',  w: '0.7fr', type: 'number', align: 'right', placeholder: 'P.U.' },
          { k: 'quantity',    w: '0.5fr', type: 'number', align: 'right', placeholder: 'Qté' },
          { k: 'margin',      w: '0.6fr', type: 'number', align: 'right', placeholder: 'Marge %' },
          { k: 'discount',        w: '0.6fr', type: 'number', align: 'right', placeholder: 'Esc. %' },
          { k: 'discount_amount', w: '0.6fr', type: 'number', align: 'right', placeholder: 'Esc. CHF' },
        ]}
        rows={lines.purchases}
        catalogKind='article'
        computeRowTotal={r => applyDiscount(num(r.unit_price) * num(r.quantity) * (1 + num(r.margin)/100), r)}
      />
      <Section title="Main d'œuvre" type='labor'
        columns={[
          { k: 'item',        w: '1.2fr', placeholder: 'Item' },
          { k: 'description', w: '1.8fr', placeholder: 'Description' },
          { k: 'rate',        w: '0.7fr', type: 'number', align: 'right', placeholder: 'Tarif' },
          { k: 'quantity',    w: '0.5fr', type: 'number', align: 'right', placeholder: 'Qté' },
          { k: 'discount',        w: '0.6fr', type: 'number', align: 'right', placeholder: 'Esc. %' },
          { k: 'discount_amount', w: '0.6fr', type: 'number', align: 'right', placeholder: 'Esc. CHF' },
        ]}
        rows={lines.labor}
        catalogKind='heure'
        computeRowTotal={r => applyDiscount(num(r.rate) * num(r.quantity), r)}
      />
      <Section title='Logistique' type='logistics'
        columns={[
          { k: 'trajet',      w: '1.2fr', placeholder: 'Trajet' },
          { k: 'description', w: '1.8fr', placeholder: 'Description' },
          { k: 'rate',        w: '0.7fr', type: 'number', align: 'right', placeholder: 'Tarif' },
          { k: 'quantity',    w: '0.5fr', type: 'number', align: 'right', placeholder: 'Qté' },
          { k: 'discount',        w: '0.6fr', type: 'number', align: 'right', placeholder: 'Esc. %' },
          { k: 'discount_amount', w: '0.6fr', type: 'number', align: 'right', placeholder: 'Esc. CHF' },
        ]}
        rows={lines.logistics}
        catalogKind='all'
        computeRowTotal={r => applyDiscount(num(r.rate) * num(r.quantity), r)}
      />
    </div>
  )
}

