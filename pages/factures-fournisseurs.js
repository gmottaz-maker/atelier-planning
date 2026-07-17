import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { useAuth } from './_app'
import NavBar from '../components/NavBar'
import useIsAdmin from '../lib/useIsAdmin'
import adminFetch from '../lib/adminFetch'
import ContactPicker from '../components/ContactPicker'

const PINK = '#111827'
const STATUS_LABELS = { pending: 'À payer', paid: 'Payée', overdue: 'En retard' }
const STATUS_COLORS = { pending: '#f59e0b', paid: '#22c55e', overdue: '#dc2626' }

function fmtCHF(n) {
  if (n == null) return '—'
  return new Intl.NumberFormat('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function fmtDate(s) {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}.${m}.${y}`
}

function dueStatus(inv) {
  if (inv.status === 'paid') return 'paid'
  if (inv.due_date && new Date(inv.due_date) < new Date()) return 'overdue'
  return 'pending'
}

export default function FacturesFournisseurs() {
  const router = useRouter()
  const { user } = useAuth()
  const currentUser = user?.name
  const isAdmin = useIsAdmin()
  useEffect(() => { if (user && !isAdmin) router.replace('/') }, [user, isAdmin])
  if (user && !isAdmin) return null
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading]   = useState(true)
  const [year, setYear]         = useState(new Date().getFullYear())
  const [filter, setFilter]     = useState('all')   // all | pending | paid | overdue
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing]   = useState(null)
  const [dragging, setDragging] = useState(false)
  const [processing, setProcessing] = useState([])  // queue de fichiers en cours

  async function load() {
    setLoading(true)
    const params = new URLSearchParams({ year: String(year) })
    const r = await adminFetch(`/api/supplier-invoices?${params}`)
    const data = await r.json()
    setInvoices(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [year])

  // ── Drag global sur la page ──────────────────────────────────────────────
  useEffect(() => {
    function onDragOver(e) {
      if (e.dataTransfer?.types?.includes('Files')) {
        e.preventDefault()
        setDragging(true)
      }
    }
    function onDragLeave(e) {
      if (e.clientX === 0 && e.clientY === 0) setDragging(false)
    }
    function onDrop(e) {
      e.preventDefault()
      setDragging(false)
      const files = Array.from(e.dataTransfer?.files || [])
      files.forEach(processDroppedFile)
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  // Importe UNE facture détectée. `split` = le document en contient plusieurs,
  // auquel cas on n'archive que les pages de celle-ci.
  async function importScanned(id, inv, base64, file, split) {
    const body = {
      supplier_name:     inv.supplier_name || 'À compléter',
      invoice_number:    inv.invoice_number || null,
      amount:            inv.amount ?? 0,
      amount_net:        inv.amount_net ?? null,
      vat_rate:          inv.vat_rate ?? null,
      vat_amount:        inv.vat_amount ?? null,
      vat_breakdown:     Array.isArray(inv.vat_breakdown) && inv.vat_breakdown.length > 0 ? inv.vat_breakdown : null,
      currency:          inv.currency || 'CHF',
      issue_date:        inv.issue_date || null,
      due_date:          inv.due_date || null,
      payment_reference: inv.payment_reference || null,
      iban:              inv.iban || null,
      file_base64:       base64,
      file_filename:     file.name,
      file_mime_type:    file.type,
      page_from:         split ? inv.page_from ?? null : null,
      page_to:           split ? inv.page_to ?? null : null,
      created_by:        currentUser,
    }
    const multiVat = Array.isArray(inv.vat_breakdown) && inv.vat_breakdown.length > 1
    try {
      const r = await adminFetch('/api/supplier-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (r.status === 409) {
        setProcessing(p => p.map(x => x.id === id ? {
          ...x, status: 'duplicate',
          duplicate: d.duplicate_of,
          retry: async () => {
            setProcessing(pp => pp.map(xx => xx.id === id ? { ...xx, status: 'uploading' } : xx))
            const r2 = await adminFetch('/api/supplier-invoices', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...body, force: true }),
            })
            const d2 = await r2.json()
            if (d2.error) {
              setProcessing(pp => pp.map(xx => xx.id === id ? { ...xx, status: 'error', error: d2.error } : xx))
            } else {
              setProcessing(pp => pp.map(xx => xx.id === id ? { ...xx, status: 'done' } : xx))
              load()
              setTimeout(() => setProcessing(pp => pp.filter(xx => xx.id !== id)), 3000)
            }
          },
        } : x))
        return
      }
      if (d.error) throw new Error(d.error)
      setProcessing(p => p.map(x => x.id === id ? { ...x, status: 'done', multiVat, vatBreakdown: inv.vat_breakdown } : x))
      load()
      setTimeout(() => setProcessing(p => p.filter(x => x.id !== id)), multiVat ? 10000 : 3000)
    } catch (e) {
      setProcessing(p => p.map(x => x.id === id ? { ...x, status: 'error', error: e.message } : x))
      setTimeout(() => setProcessing(p => p.filter(x => x.id !== id)), 6000)
    }
  }

  async function processDroppedFile(file) {
    if (!file) return
    const isImage = file.type.startsWith('image/')
    const isPdf   = file.type === 'application/pdf'
    if (!isImage && !isPdf) return
    const id = `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    setProcessing(p => [...p, { id, name: file.name, status: 'reading' }])
    try {
      const base64 = await new Promise((resolve, reject) => {
        const r = new FileReader()
        r.onload = e => resolve(e.target.result.split(',')[1])
        r.onerror = reject
        r.readAsDataURL(file)
      })
      // Scan IA — un même PDF peut contenir plusieurs factures
      setProcessing(p => p.map(x => x.id === id ? { ...x, status: 'scanning' } : x))
      const scanRes = await adminFetch('/api/supplier-invoices/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mimeType: file.type }),
      })
      const scan = await scanRes.json()
      if (scan.error) throw new Error(scan.error)
      // Si l'OCR n'a rien reconnu, on crée quand même une facture à compléter à la main.
      const found = Array.isArray(scan.invoices) ? scan.invoices : [scan]
      const list  = found.length > 0 ? found : [{}]
      const split = list.length > 1

      // Une ligne de progression par facture, pour gérer doublons et erreurs séparément
      const items = list.map((inv, i) => ({
        id: split ? `${id}_${i}` : id,
        name: split ? `${i + 1}/${list.length} · ${inv.supplier_name || 'À compléter'}` : file.name,
        inv,
      }))
      setProcessing(p => [
        ...p.filter(x => x.id !== id),
        ...items.map(it => ({ id: it.id, name: it.name, status: 'uploading' })),
      ])

      // En série : le POST fait un upload kDrive, et l'anti-doublon doit voir
      // la facture précédente déjà insérée.
      for (const it of items) await importScanned(it.id, it.inv, base64, file, split)
    } catch (e) {
      setProcessing(p => p.map(x => x.id === id ? { ...x, status: 'error', error: e.message } : x))
      setTimeout(() => setProcessing(p => p.filter(x => x.id !== id)), 6000)
    }
  }

  const visible = invoices.filter(inv => filter === 'all' ? true : dueStatus(inv) === filter)
  const totals = invoices.reduce((acc, inv) => {
    const st = dueStatus(inv)
    acc.total += parseFloat(inv.amount || 0)
    if (st === 'pending')  acc.pending += parseFloat(inv.amount || 0)
    if (st === 'overdue')  acc.overdue += parseFloat(inv.amount || 0)
    if (st === 'paid')     acc.paid    += parseFloat(inv.amount || 0)
    return acc
  }, { total: 0, pending: 0, overdue: 0, paid: 0 })

  return (
    <div className="min-h-screen" style={{ background: '#fafafa' }}>
      <Head><title>Maze Project — Factures fournisseurs</title></Head>

      <NavBar title="Factures fournisseurs">
        <label className="px-4 py-2 text-sm font-medium rounded-md text-white cursor-pointer" style={{ background: PINK }}>
          📁 Importer
          <input type="file" multiple accept="image/*,application/pdf" className="hidden"
            onChange={e => { Array.from(e.target.files || []).forEach(processDroppedFile); e.target.value = '' }} />
        </label>
        <button onClick={() => { setEditing(null); setDrawerOpen(true) }}
          className="ml-2 px-4 py-2 text-sm font-medium rounded-md border border-gray-200 text-gray-700 hover:border-gray-400">
          + Manuel
        </button>
      </NavBar>

      {/* Overlay drop fullscreen */}
      {dragging && (
        <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none"
          style={{ background: 'rgba(17, 24, 39, 0.55)' }}>
          <div className="bg-white rounded-2xl px-10 py-8 text-center shadow-2xl border-2 border-dashed" style={{ borderColor: '#111827' }}>
            <div className="text-5xl mb-3">📥</div>
            <p className="font-semibold text-gray-900" style={{ fontSize: 18 }}>Déposez votre facture ici</p>
            <p className="text-sm text-gray-500 mt-1">JPG · PNG · PDF — l'IA va l'analyser</p>
          </div>
        </div>
      )}

      {/* Toast de progression */}
      {processing.length > 0 && (
        <div className="fixed bottom-5 right-5 z-30 space-y-2 max-w-sm">
          {processing.map(p => (
            <div key={p.id} className="bg-white rounded-lg shadow-lg border border-gray-200 px-4 py-3 flex items-center gap-3">
              {p.status === 'done' ? (
                <span className="text-green-600">✓</span>
              ) : p.status === 'error' ? (
                <span className="text-red-500">✕</span>
              ) : p.status === 'duplicate' ? (
                <span className="text-amber-600">⚠</span>
              ) : (
                <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: '#e5e7eb', borderTopColor: '#111827' }} />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                <p className="text-xs text-gray-500">
                  {p.status === 'reading'   && 'Lecture…'}
                  {p.status === 'scanning'  && 'Analyse IA…'}
                  {p.status === 'uploading' && 'Sauvegarde sur kDrive…'}
                  {p.status === 'done' && !p.multiVat && 'Importée ✓'}
                  {p.status === 'done' && p.multiVat && (
                    <span className="text-amber-700">
                      Importée ✓ — ⚠ Plusieurs taux TVA détectés ({p.vatBreakdown?.map(b => b.rate + '%').join(' + ')})
                    </span>
                  )}
                  {p.status === 'error'     && `Erreur : ${p.error}`}
                  {p.status === 'duplicate' && (
                    <>
                      Doublon ({p.duplicate?.supplier_name}, n° {p.duplicate?.invoice_number || '—'}, {p.duplicate?.amount} CHF){' '}
                      <button onClick={p.retry} className="ml-1 underline text-amber-700 hover:text-amber-900">Importer quand même</button>
                      {' · '}
                      <button onClick={() => setProcessing(pp => pp.filter(xx => xx.id !== p.id))}
                        className="underline text-gray-500 hover:text-gray-700">Ignorer</button>
                    </>
                  )}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <main className="w-full px-4 md:px-10 py-6 md:py-10 space-y-6" style={{ maxWidth: 1600, margin: '0 auto' }}>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Total année', value: totals.total,   color: '#111827' },
            { label: 'À payer',     value: totals.pending, color: '#f59e0b' },
            { label: 'En retard',   value: totals.overdue, color: '#dc2626' },
            { label: 'Payé',        value: totals.paid,    color: '#22c55e' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
              <div className="text-xs text-gray-500 mb-1">{s.label}</div>
              <div className="font-semibold tabular-nums" style={{ fontSize: 22, color: s.color, letterSpacing: '-0.02em' }}>
                {fmtCHF(s.value)} <span className="text-xs font-normal text-gray-400">CHF</span>
              </div>
            </div>
          ))}
        </div>

        {/* Filtres */}
        <div className="flex items-center gap-2 flex-wrap">
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="px-3 py-1.5 border border-gray-200 rounded-md text-sm bg-white">
            {[2026, 2025, 2024, 2023].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <div className="flex gap-1.5">
            {[
              { key: 'all',     label: 'Toutes' },
              { key: 'pending', label: 'À payer' },
              { key: 'overdue', label: 'En retard' },
              { key: 'paid',    label: 'Payées' },
            ].map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className="px-3 py-1.5 rounded-md text-xs font-medium"
                style={filter === f.key
                  ? { background: '#111827', color: 'white' }
                  : { background: '#f3f4f6', color: '#6b7280' }}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Liste */}
        {loading ? (
          <p className="text-sm text-gray-400 py-12 text-center">Chargement…</p>
        ) : visible.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <p className="text-sm text-gray-400">Aucune facture {filter === 'all' ? '' : ('— filtre : ' + filter)}.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-3 text-left font-semibold text-gray-700" style={{ fontSize: 11 }}>Fournisseur</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700" style={{ fontSize: 11 }}>N° facture</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700" style={{ fontSize: 11 }}>Émise le</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700" style={{ fontSize: 11 }}>Échéance</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700" style={{ fontSize: 11 }}>Montant</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700" style={{ fontSize: 11 }}>Statut</th>
                  <th className="px-4 py-3 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {visible.map(inv => {
                  const st = dueStatus(inv)
                  return (
                    <tr key={inv.id} className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer"
                      onClick={() => { setEditing(inv); setDrawerOpen(true) }}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{inv.supplier_name}</div>
                        {inv.category && <div className="text-xs text-gray-400">{inv.category}</div>}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{inv.invoice_number || '—'}</td>
                      <td className="px-4 py-3 text-gray-600 tabular-nums">{fmtDate(inv.issue_date)}</td>
                      <td className="px-4 py-3 text-gray-600 tabular-nums">{fmtDate(inv.due_date)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">
                        {fmtCHF(inv.amount)} <span className="text-xs font-normal text-gray-400">{inv.currency || 'CHF'}</span>
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
        <SupplierInvoiceDrawer
          invoice={editing}
          currentUser={currentUser}
          onClose={() => { setDrawerOpen(false); setEditing(null) }}
          onSaved={() => { setDrawerOpen(false); setEditing(null); load() }}
        />
      )}
    </div>
  )
}

// ─── Drawer ────────────────────────────────────────────────────────────────

function SupplierInvoiceDrawer({ invoice, currentUser, onClose, onSaved }) {
  const isEdit = !!invoice
  const [form, setForm] = useState({
    supplier_name:     invoice?.supplier_name || '',
    invoice_number:    invoice?.invoice_number || '',
    amount:            invoice?.amount ?? '',
    amount_net:        invoice?.amount_net ?? '',
    vat_rate:          invoice?.vat_rate ?? '',
    vat_amount:        invoice?.vat_amount ?? '',
    currency:          invoice?.currency || 'CHF',
    issue_date:        invoice?.issue_date || '',
    due_date:          invoice?.due_date || '',
    payment_reference: invoice?.payment_reference || '',
    iban:              invoice?.iban || '',
    category:          invoice?.category || '',
    notes:             invoice?.notes || '',
    status:            invoice?.status || 'pending',
  })
  const [filePreview, setFilePreview] = useState(null) // { name, mime, base64 }
  const [scanLoading, setScanLoading] = useState(false)
  const [scanError, setScanError]     = useState('')
  const [saving, setSaving]           = useState(false)
  const [saveError, setSaveError]     = useState('')

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  // Recalcul TVA automatique : si amount + rate → derive net et vat_amount
  function recomputeFromGross(amount, rate) {
    const a = parseFloat(amount), r = parseFloat(rate)
    if (isNaN(a) || isNaN(r) || r < 0) return
    const net = a / (1 + r / 100)
    setForm(f => ({ ...f, amount_net: net.toFixed(2), vat_amount: (a - net).toFixed(2) }))
  }

  async function onFile(file) {
    if (!file) return
    setScanError('')
    const base64 = await new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = e => resolve(e.target.result.split(',')[1])
      r.onerror = reject
      r.readAsDataURL(file)
    })
    const fp = { name: file.name, mime: file.type, base64 }
    setFilePreview(fp)
    // Auto-OCR si image
    if (fp.mime.startsWith('image/')) {
      await runScan(fp)
    }
  }

  async function runScan(fp) {
    if (!fp || !fp.mime.startsWith('image/')) {
      setScanError('Scan IA disponible uniquement pour les images (JPG/PNG)')
      return
    }
    setScanLoading(true); setScanError('')
    try {
      const r = await adminFetch('/api/supplier-invoices/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: fp.base64, mimeType: fp.mime }),
      })
      const d = await r.json()
      if (d.error) { setScanError(d.error); return }
      setForm(f => ({
        ...f,
        supplier_name:     d.supplier_name || f.supplier_name,
        invoice_number:    d.invoice_number || f.invoice_number,
        amount:            d.amount != null ? String(d.amount) : f.amount,
        amount_net:        d.amount_net != null ? String(d.amount_net) : f.amount_net,
        vat_rate:          d.vat_rate != null ? String(d.vat_rate) : f.vat_rate,
        vat_amount:        d.vat_amount != null ? String(d.vat_amount) : f.vat_amount,
        currency:          d.currency || f.currency,
        issue_date:        d.issue_date || f.issue_date,
        due_date:          d.due_date || f.due_date,
        payment_reference: d.payment_reference || f.payment_reference,
        iban:              d.iban || f.iban,
      }))
      // Si OCR ne donne pas net/vat mais donne gross + rate, calculer
      if (d.amount && d.vat_rate && d.amount_net == null) {
        setTimeout(() => recomputeFromGross(d.amount, d.vat_rate), 0)
      }
    } catch (e) { setScanError('Erreur IA') }
    finally { setScanLoading(false) }
  }

  const scan = () => runScan(filePreview)

  async function save() {
    if (!form.supplier_name.trim() || !form.amount) {
      setSaveError('Fournisseur et montant requis')
      return
    }
    setSaving(true); setSaveError('')
    try {
      if (isEdit) {
        const r = await adminFetch(`/api/supplier-invoices/${invoice.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        const d = await r.json()
        if (d.error) { setSaveError(d.error); return }
      } else {
        const body = {
          ...form,
          created_by: currentUser,
          file_base64: filePreview?.base64,
          file_filename: filePreview?.name,
          file_mime_type: filePreview?.mime,
        }
        const r = await adminFetch('/api/supplier-invoices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const d = await r.json()
        if (d.error) { setSaveError(d.error); return }
      }
      onSaved()
    } catch (e) { setSaveError(e.message) }
    finally { setSaving(false) }
  }

  async function deleteInvoice() {
    if (!confirm('Supprimer cette facture ? Le PDF sur kDrive sera aussi supprimé.')) return
    await adminFetch(`/api/supplier-invoices/${invoice.id}`, { method: 'DELETE' })
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
      <style>{`
        @keyframes drawerSlide { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes drawerFade { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
      <div className="fixed inset-0 z-50" style={{ background: 'rgba(15,23,42,0.35)', animation: 'drawerFade 0.15s ease-out both' }}
        onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="fixed top-0 right-0 bottom-0 bg-white flex flex-col shadow-2xl"
          style={{ width: '100%', maxWidth: 560, animation: 'drawerSlide 0.2s cubic-bezier(0.4,0,0.2,1) both', fontFamily: 'Inter, sans-serif' }}>

          <div className="flex items-center justify-between px-8 py-5 border-b border-gray-100">
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-400 mb-0.5">{isEdit ? 'Modifier' : 'Nouvelle facture fournisseur'}</p>
              <h2 className="font-semibold text-gray-900" style={{ fontSize: 20 }}>
                {isEdit ? (form.supplier_name || 'Facture') : 'Saisir une facture'}
              </h2>
            </div>
            <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-100" style={{ fontSize: 22 }}>×</button>
          </div>

          <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5">
            {/* Upload + scan IA */}
            {!isEdit && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">PDF ou image de la facture</label>
                <label
                  className="block w-full rounded-md border border-dashed cursor-pointer overflow-hidden"
                  style={{ borderColor: filePreview ? '#bbf7d0' : '#e5e7eb', background: filePreview ? '#f0fdf4' : '#fafafa', minHeight: 96 }}
                  onDragOver={e => { e.preventDefault() }}
                  onDrop={e => {
                    e.preventDefault()
                    const f = e.dataTransfer.files?.[0]
                    if (f) onFile(f)
                  }}>
                  <input type="file" accept="image/*,application/pdf" className="hidden"
                    onChange={e => onFile(e.target.files?.[0])} />
                  {filePreview ? (
                    <div className="p-3 flex items-center gap-3">
                      {filePreview.mime.startsWith('image/') ? (
                        <img src={`data:${filePreview.mime};base64,${filePreview.base64}`} alt=""
                          className="w-16 h-16 object-cover rounded" />
                      ) : (
                        <div className="w-16 h-16 flex items-center justify-center bg-white rounded border">📄</div>
                      )}
                      <div className="flex-1">
                        <div className="text-sm font-medium text-green-700">Fichier attaché</div>
                        <div className="text-xs text-gray-500 truncate">{filePreview.name}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-6 gap-1">
                      <p className="text-sm text-gray-600 font-medium">Glisser un fichier ou <span className="underline">parcourir</span></p>
                      <p className="text-xs text-gray-400">PDF / Image · sera stocké sur kDrive</p>
                    </div>
                  )}
                </label>
                {filePreview && filePreview.mime.startsWith('image/') && (
                  <button onClick={scan} disabled={scanLoading}
                    className="mt-3 w-full py-2 rounded-md text-sm font-medium border"
                    style={{ borderColor: '#bfdbfe', color: '#2563eb', background: scanLoading ? '#f3f4f6' : 'white' }}>
                    {scanLoading ? 'Analyse IA…' : 'Pré-remplir avec l\'IA'}
                  </button>
                )}
                {scanError && <p className="text-xs text-red-500 mt-2">{scanError}</p>}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Fournisseur *</label>
                <div className="mb-2"><ContactPicker placeholder="Choisir dans les contacts…" onSelect={({ name }) => set('supplier_name', name)} /></div>
                <input className={inputCls} value={form.supplier_name} onChange={e => set('supplier_name', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">N° facture</label>
                <input className={inputCls} value={form.invoice_number} onChange={e => set('invoice_number', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Catégorie</label>
                <input className={inputCls} value={form.category} onChange={e => set('category', e.target.value)} placeholder="Matériel, services..." />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Total TTC *</label>
                <input type="number" step="0.01" className={inputCls} value={form.amount}
                  onChange={e => {
                    set('amount', e.target.value)
                    if (form.vat_rate) recomputeFromGross(e.target.value, form.vat_rate)
                  }} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Devise</label>
                <select className={inputCls} value={form.currency} onChange={e => set('currency', e.target.value)}>
                  <option>CHF</option><option>EUR</option><option>USD</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">TVA (%)</label>
                <select className={inputCls} value={form.vat_rate}
                  onChange={e => {
                    set('vat_rate', e.target.value)
                    if (form.amount) recomputeFromGross(form.amount, e.target.value)
                  }}>
                  <option value="">—</option>
                  <option value="8.1">8.1% (normal)</option>
                  <option value="2.6">2.6% (réduit)</option>
                  <option value="3.8">3.8% (hébergement)</option>
                  <option value="0">0% (exempt)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Montant HT</label>
                <input type="number" step="0.01" className={inputCls} value={form.amount_net}
                  onChange={e => set('amount_net', e.target.value)}
                  placeholder="auto si TTC + taux" />
              </div>
              <div className="col-span-2 -mt-1">
                <p className="text-xs text-gray-400">
                  TVA : <span className="font-semibold text-gray-700 tabular-nums">{form.vat_amount ? `${form.vat_amount} ${form.currency}` : '—'}</span>
                </p>
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
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Référence paiement (QR/ESR)</label>
                <input className={inputCls} value={form.payment_reference} onChange={e => set('payment_reference', e.target.value)}
                  placeholder="27 chiffres si QR-bill" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1.5">IBAN du fournisseur</label>
                <input className={inputCls} value={form.iban} onChange={e => set('iban', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Notes</label>
                <textarea rows={2} className={inputCls} value={form.notes} onChange={e => set('notes', e.target.value)} />
              </div>
              {isEdit && (
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Statut</label>
                  <select className={inputCls} value={form.status} onChange={e => set('status', e.target.value)}>
                    <option value="pending">À payer</option>
                    <option value="paid">Payée</option>
                    <option value="overdue">En retard</option>
                  </select>
                </div>
              )}
            </div>

            {saveError && <p className="text-xs text-red-500">{saveError}</p>}

            {isEdit && invoice?.kdrive_file_id && (
              <a href={`/api/kdrive/download?fileId=${invoice.kdrive_file_id}`} target="_blank" rel="noopener"
                className="block w-full text-center px-4 py-2 rounded-md text-sm font-medium border border-gray-300 text-gray-700 hover:border-gray-400">
                📎 Ouvrir le fichier attaché
              </a>
            )}
          </div>

          <div className="px-8 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
            {isEdit ? (
              <button onClick={deleteInvoice} className="text-sm font-medium text-red-500 hover:text-red-700">Supprimer</button>
            ) : <span />}
            <div className="flex gap-2">
              <button onClick={onClose} className="px-4 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100">Annuler</button>
              <button onClick={save} disabled={saving}
                className="px-5 py-2 rounded-md text-white font-medium text-sm disabled:opacity-50"
                style={{ background: '#111827' }}>
                {saving ? 'Enregistrement…' : isEdit ? 'Mettre à jour' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
