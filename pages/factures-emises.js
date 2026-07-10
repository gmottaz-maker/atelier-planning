import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { useAuth } from './_app'
import NavBar from '../components/NavBar'
import useIsAdmin from '../lib/useIsAdmin'
import adminFetch from '../lib/adminFetch'
import ContactPicker from '../components/ContactPicker'

const PINK = '#111827'
const STATUS_LABELS = { pending: 'En attente', paid: 'Payée', overdue: 'En retard', cancelled: 'Annulée' }
const STATUS_COLORS = { pending: '#f59e0b', paid: '#22c55e', overdue: '#dc2626', cancelled: '#9ca3af' }

function fmtCHF(n) {
  if (n == null) return '—'
  return new Intl.NumberFormat('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}
function fmtDate(s) {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}.${m}.${y}`
}

function effectiveStatus(inv) {
  if (inv.status === 'paid' || inv.status === 'cancelled') return inv.status
  if (inv.due_date && new Date(inv.due_date) < new Date()) return 'overdue'
  return 'pending'
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
                  <th className="px-4 py-3 w-8"></th>
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
                      </td>
                      <td className="px-4 py-3 text-right text-gray-300">›</td>
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
    status:         invoice?.status || 'pending',
  })
  const [lines, setLines]   = useState({
    purchases: invoice?.quote_snapshot?.purchases || [],
    labor:     invoice?.quote_snapshot?.labor || [],
    logistics: invoice?.quote_snapshot?.logistics || [],
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  // Recompute total when lines change (les positions sont HT, on applique la TVA globale)
  const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n }
  const linesNet =
    lines.purchases.reduce((s, r) => s + num(r.unit_price) * num(r.quantity) * (1 + num(r.margin)/100), 0) +
    lines.labor.reduce((s, r) => s + num(r.rate) * num(r.quantity), 0) +
    lines.logistics.reduce((s, r) => s + num(r.rate) * num(r.quantity), 0)
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
    setLines(L => ({ ...L, [t]: [...L[t], empty] }))
  }
  function updLine(t, i, k, v) {
    setLines(L => ({ ...L, [t]: L[t].map((r, ix) => ix === i ? { ...r, [k]: v } : r) }))
  }
  function rmLine(t, i) {
    setLines(L => ({ ...L, [t]: L[t].filter((_, ix) => ix !== i) }))
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  // Auto-pré-remplir si on arrive depuis un projet
  useEffect(() => {
    if (!isEdit && initialProjectId && projects.length > 0) {
      pickProject(initialProjectId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialProjectId, projects.length])

  // Pré-remplir depuis le projet — on aplatit la structure { management, items, logistics }
  // (ou l'ancien { purchases, labor, logistics }) en lignes plates pour la facture
  function pickProject(pid) {
    const p = projects.find(x => x.id === pid)
    if (!p) { set('project_id', pid); return }
    const q = p.quote_data || {}

    // Marge effective pour une ligne: spécifique sinon marge générale du devis
    const gm = q.general_margin ?? ''
    const effMargin = r => {
      if (r?.margin !== '' && r?.margin != null) return num(r.margin)
      return num(gm)
    }

    // Nouveau format : { management, items, subcontracting, logistics, general_margin }
    let flatPurchases = []
    let flatLabor     = []
    let flatLogistics = []
    if (Array.isArray(q.items) || Array.isArray(q.management)) {
      // Gestion → labor (pas de marge, c'est de la main d'œuvre)
      flatLabor = (q.management || []).map(r => ({
        ...r,
        item: r.item || 'Gestion de projet / visuel',
        _uid: r._uid || genUid(),
      }))
      for (const it of (q.items || [])) {
        const itemName = it.name || 'Item'
        // Achats : la marge effective est résolue en row.margin pour que la facture la calcule comme avant
        for (const r of (it.purchases || [])) {
          flatPurchases.push({
            ...r,
            item: itemName,
            margin: r.margin !== '' && r.margin != null ? r.margin : gm,
            _uid: r._uid || genUid(),
          })
        }
        for (const r of (it.labor || [])) {
          flatLabor.push({ ...r, item: itemName, _uid: r._uid || genUid() })
        }
      }
      // Sous-traitance → labor avec marge intégrée dans le tarif (la facture n'applique pas de marge sur le labor)
      for (const r of (q.subcontracting || [])) {
        const billedRate = num(r.rate) * (1 + effMargin(r) / 100)
        flatLabor.push({
          ...r,
          item: r.item ? `Sous-traitance · ${r.item}` : 'Sous-traitance',
          rate: billedRate.toFixed(2),
          _uid: r._uid || genUid(),
        })
      }
      // Logistique → idem (marge intégrée dans le tarif)
      flatLogistics = (q.logistics || []).map(r => {
        const billedRate = num(r.rate) * (1 + effMargin(r) / 100)
        return { ...r, rate: billedRate.toFixed(2), _uid: r._uid || genUid() }
      })
    } else {
      // Ancien format
      flatPurchases = (q.purchases || []).map(r => ({ ...r, _uid: r._uid || genUid() }))
      flatLabor     = (q.labor     || []).map(r => ({ ...r, _uid: r._uid || genUid() }))
      flatLogistics = (q.logistics || []).map(r => ({ ...r, _uid: r._uid || genUid() }))
    }

    const total =
      flatPurchases.reduce((s, r) => s + num(r.unit_price) * num(r.quantity) * (1 + num(r.margin)/100), 0) +
      flatLabor    .reduce((s, r) => s + num(r.rate) * num(r.quantity), 0) +
      flatLogistics.reduce((s, r) => s + num(r.rate) * num(r.quantity), 0)
    setForm(f => ({
      ...f,
      project_id: pid,
      client_name: p.client || f.client_name,
      amount: total > 0 ? total.toFixed(2) : f.amount,
    }))
    setLines({ purchases: flatPurchases, labor: flatLabor, logistics: flatLogistics })
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
      const snapshotToSave = hasLines ? lines : null
      const baseBody = {
        ...form,
        amount: gross.toFixed(2),
        amount_net: net.toFixed(2),
        vat_amount: vat.toFixed(2),
      }
      if (isEdit) {
        const body = { ...baseBody, quote_snapshot: snapshotToSave }
        const r = await adminFetch(`/api/customer-invoices/${invoice.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const d = await r.json()
        if (d.error) { setError(d.error); return }
      } else {
        const p = projects.find(x => x.id === form.project_id)
        const fallbackSnap = hasLines ? lines : (p?.quote_data || null)
        const body = { ...baseBody, quote_snapshot: fallbackSnap }
        const r = await adminFetch('/api/customer-invoices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const d = await r.json()
        if (d.error) { setError(d.error); return }
      }
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
              <LinesEditor lines={lines} addLine={addLine} updLine={updLine} rmLine={rmLine} />
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

function LinesEditor({ lines, addLine, updLine, rmLine }) {
  const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n }
  const sec = 'mb-4'
  const inputSm = 'w-full px-2 py-1 border border-gray-200 rounded text-xs bg-white focus:border-gray-400 focus:outline-none'

  function Section({ title, type, columns, rows, computeRowTotal }) {
    return (
      <div className={sec}>
        <div className='flex items-center justify-between mb-1.5'>
          <span className='text-xs font-semibold text-gray-700 uppercase tracking-wider'>{title}</span>
          <button type='button' onClick={() => addLine(type)}
            className='text-xs font-medium text-gray-500 hover:text-gray-900'>+ Ligne</button>
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
          { k: 'item',        w: '1.3fr', placeholder: 'Item' },
          { k: 'description', w: '2fr',   placeholder: 'Description' },
          { k: 'unit_price',  w: '0.8fr', type: 'number', align: 'right', placeholder: 'P.U.' },
          { k: 'quantity',    w: '0.5fr', type: 'number', align: 'right', placeholder: 'Qté' },
          { k: 'margin',      w: '0.6fr', type: 'number', align: 'right', placeholder: 'Marge %' },
        ]}
        rows={lines.purchases}
        computeRowTotal={r => num(r.unit_price) * num(r.quantity) * (1 + num(r.margin)/100)}
      />
      <Section title="Main d'œuvre" type='labor'
        columns={[
          { k: 'item',        w: '1.3fr', placeholder: 'Item' },
          { k: 'description', w: '2fr',   placeholder: 'Description' },
          { k: 'rate',        w: '0.8fr', type: 'number', align: 'right', placeholder: 'Tarif' },
          { k: 'quantity',    w: '0.5fr', type: 'number', align: 'right', placeholder: 'Qté' },
        ]}
        rows={lines.labor}
        computeRowTotal={r => num(r.rate) * num(r.quantity)}
      />
      <Section title='Logistique' type='logistics'
        columns={[
          { k: 'trajet',      w: '1.3fr', placeholder: 'Trajet' },
          { k: 'description', w: '2fr',   placeholder: 'Description' },
          { k: 'rate',        w: '0.8fr', type: 'number', align: 'right', placeholder: 'Tarif' },
          { k: 'quantity',    w: '0.5fr', type: 'number', align: 'right', placeholder: 'Qté' },
        ]}
        rows={lines.logistics}
        computeRowTotal={r => num(r.rate) * num(r.quantity)}
      />
    </div>
  )
}

