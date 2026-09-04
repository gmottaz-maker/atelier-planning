import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { useAuth } from './_app'
import NavBar from '../components/NavBar'
import useIsAdmin from '../lib/useIsAdmin'
import adminFetch from '../lib/adminFetch'
import { verifierTailleFichier, lireReponse } from '../lib/uploadLimit'
import ContactPicker from '../components/ContactPicker'
import { DISPLAY_STATUSES, STATUS_ORDER, effectiveStatus } from '../lib/supplierStatus'
import { fmtCHF as fmtMontant } from '../lib/money'
import { AL, C, FONT } from '../lib/theme'

const PINK = AL.black

function fmtCHF(n) {
  if (n == null) return '—'
  return fmtMontant(n)
}

function fmtDate(s) {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}.${m}.${y}`
}

const dueStatus = effectiveStatus

// Valeur de tri d'une colonne. Les nombres se comparent en nombres, les dates en
// chaînes ISO, et le statut suit sa progression plutôt que l'alphabet.
function sortValue(inv, key) {
  switch (key) {
    case 'amount':  return parseFloat(inv.amount || 0)
    case 'status':  return STATUS_ORDER.indexOf(dueStatus(inv))
    case 'payment': return String(inv.paid_at || inv.scheduled_payment_date || '').slice(0, 10)
    default:        return String(inv[key] ?? '').toLowerCase()
  }
}

function sortInvoices(list, { key, dir }) {
  const sign = dir === 'asc' ? 1 : -1
  return [...list].sort((a, b) => {
    const va = sortValue(a, key), vb = sortValue(b, key)
    // Les cases vides restent en bas quel que soit le sens du tri
    const ea = va === '' || va === -1, eb = vb === '' || vb === -1
    if (ea !== eb) return ea ? 1 : -1
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sign
    return String(va).localeCompare(String(vb), 'fr', { numeric: true }) * sign
  })
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
  const [filter, setFilter]     = useState('all')   // all | pending | sent_to_bank | paid | overdue
  const [sort, setSort]         = useState({ key: 'due_date', dir: 'asc' })
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
      // Un 409 (doublon) est une réponse ATTENDUE, et toujours en JSON. Tout
      // autre échec passe par lireReponse, qui sait qu'un refus de l'hébergeur
      // arrive en texte brut et non en JSON.
      const d = r.status === 409 ? await r.json() : await lireReponse(r)
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
            let echec = null
            try { await lireReponse(r2) } catch (e2) { echec = e2.message }
            if (echec) {
              setProcessing(pp => pp.map(xx => xx.id === id ? { ...xx, status: 'error', error: echec } : xx))
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
    // Vérifié AVANT de lire le fichier : encoder 8 Mo en base64 pour se faire
    // refuser ensuite fait patienter pour rien.
    const taille = verifierTailleFichier(file)
    if (!taille.ok) {
      setProcessing(p => [...p, { id, name: file.name, status: 'error', error: taille.message }])
      setTimeout(() => setProcessing(p => p.filter(x => x.id !== id)), 10000)
      return
    }
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
      const scan = await lireReponse(scanRes)
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

  const visible = sortInvoices(
    invoices.filter(inv => filter === 'all' ? true : dueStatus(inv) === filter),
    sort,
  )
  // Un clic bascule le sens, un clic sur une autre colonne repart en ascendant
  const toggleSort = key => setSort(s => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))
  // Trois chiffres seulement : ce qui reste à sortir (en attente, en retard ou
  // déjà transmis à la banque) est regroupé sous « À payer ».
  const totals = invoices.reduce((acc, inv) => {
    const st = dueStatus(inv)
    const amt = parseFloat(inv.amount || 0)
    acc.total += amt
    if (st === 'paid') acc.paid += amt
    else if (st === 'pending' || st === 'overdue' || st === 'sent_to_bank') acc.toPay += amt
    return acc
  }, { total: 0, toPay: 0, paid: 0 })

  return (
    <div className="min-h-screen" style={{ background: AL.white }}>
      <Head><title>Maze Project — Factures fournisseurs</title></Head>

      <NavBar title="Factures fournisseurs">
        <label className="px-4 py-2 text-sm font-medium u-pill text-white cursor-pointer" style={{ background: PINK }}>
          📁 Importer
          <input type="file" multiple accept="image/*,application/pdf" className="hidden"
            onChange={e => { Array.from(e.target.files || []).forEach(processDroppedFile); e.target.value = '' }} />
        </label>
        <button onClick={() => { setEditing(null); setDrawerOpen(true) }}
          className="ml-2 px-4 py-2 text-sm font-medium u-pill border u-line u-ink hover:u-line">
          + Manuel
        </button>
      </NavBar>

      {/* Overlay drop fullscreen */}
      {dragging && (
        <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none"
          style={{ background: 'rgba(17, 24, 39, 0.55)' }}>
          <div className="u-surface u-panel px-10 py-8 text-center shadow-2xl border-2 border-dashed" style={{ borderColor: AL.black }}>
            <div className="text-5xl mb-3">📥</div>
            <p className="font-semibold u-ink" style={{ fontSize: 18 }}>Déposez votre facture ici</p>
            <p className="text-sm u-muted mt-1">JPG · PNG · PDF — l'IA va l'analyser</p>
          </div>
        </div>
      )}

      {/* Toast de progression */}
      {processing.length > 0 && (
        <div className="fixed bottom-5 right-5 z-30 space-y-2 max-w-sm">
          {processing.map(p => (
            <div key={p.id} className="u-surface u-panel shadow-lg border u-line px-4 py-3 flex items-center gap-3">
              {p.status === 'done' ? (
                <span className="u-ok">✓</span>
              ) : p.status === 'error' ? (
                <span className="u-ko">✕</span>
              ) : p.status === 'duplicate' ? (
                <span className="u-warn">⚠</span>
              ) : (
                <div className="w-4 h-4 u-pill border-2 animate-spin" style={{ borderColor: C.border, borderTopColor: AL.black }} />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium u-ink truncate">{p.name}</p>
                <p className="text-xs u-muted">
                  {p.status === 'reading'   && 'Lecture…'}
                  {p.status === 'scanning'  && 'Analyse IA…'}
                  {p.status === 'uploading' && 'Sauvegarde sur kDrive…'}
                  {p.status === 'done' && !p.multiVat && 'Importée ✓'}
                  {p.status === 'done' && p.multiVat && (
                    <span className="u-warn">
                      Importée ✓ — ⚠ Plusieurs taux TVA détectés ({p.vatBreakdown?.map(b => b.rate + '%').join(' + ')})
                    </span>
                  )}
                  {p.status === 'error'     && `Erreur : ${p.error}`}
                  {p.status === 'duplicate' && (
                    <>
                      Doublon ({p.duplicate?.supplier_name}, n° {p.duplicate?.invoice_number || '—'}, {p.duplicate?.amount} CHF){' '}
                      <button onClick={p.retry} className="ml-1 underline u-warn hover:u-warn">Importer quand même</button>
                      {' · '}
                      <button onClick={() => setProcessing(pp => pp.filter(xx => xx.id !== p.id))}
                        className="underline u-muted hover:u-ink">Ignorer</button>
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
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total année', value: totals.total, color: AL.black },
            { label: 'À payer',     value: totals.toPay, color: C.warning },
            { label: 'Payé',        value: totals.paid,  color: C.success },
          ].map(s => (
            <div key={s.label} className="u-surface u-panel border u-line px-4 py-3">
              <div className="text-xs u-muted mb-1">{s.label}</div>
              <div className="font-semibold tabular-nums" style={{ fontSize: 22, color: s.color, letterSpacing: '-0.02em' }}>
                {fmtCHF(s.value)} <span className="text-xs font-normal u-muted">CHF</span>
              </div>
            </div>
          ))}
        </div>

        {/* Filtres */}
        <div className="flex items-center gap-2 flex-wrap">
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="px-3 py-1.5 border u-line u-pill text-sm u-surface">
            {[2026, 2025, 2024, 2023].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <div className="flex gap-1.5">
            {[
              { key: 'all',          label: 'Toutes' },
              { key: 'pending',      label: 'À payer' },
              { key: 'overdue',      label: 'En retard' },
              { key: 'sent_to_bank', label: 'Transmises' },
              { key: 'paid',         label: 'Payées' },
            ].map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className="px-3 py-1.5 u-pill text-xs font-medium"
                style={filter === f.key
                  ? { background: AL.black, color: 'white' }
                  : { background: C.neutralBg, color: C.muted }}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Liste */}
        {loading ? (
          <p className="text-sm u-muted py-12 text-center">Chargement…</p>
        ) : visible.length === 0 ? (
          <div className="u-surface u-panel border u-line p-12 text-center">
            <p className="text-sm u-muted">Aucune facture {filter === 'all' ? '' : ('— filtre : ' + filter)}.</p>
          </div>
        ) : (
          <div className="u-surface u-panel border u-line overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="u-fill border-b u-line">
                  {[
                    { key: 'supplier_name',  label: 'Fournisseur' },
                    { key: 'invoice_number', label: 'N° facture' },
                    { key: 'issue_date',     label: 'Émise le' },
                    { key: 'due_date',       label: 'Échéance' },
                    { key: 'amount',         label: 'Montant', align: 'right' },
                    { key: 'payment',        label: 'Paiement' },
                    { key: 'status',         label: 'Statut' },
                  ].map(c => (
                    <th key={c.key}
                      className={`px-4 py-3 font-semibold u-ink cursor-pointer select-none hover:u-ink ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                      style={{ fontSize: 11 }}
                      onClick={() => toggleSort(c.key)}>
                      {c.label}
                      <span className="ml-1" style={{ color: sort.key === c.key ? AL.black : C.muted }}>
                        {sort.key === c.key ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </th>
                  ))}
                  <th className="px-4 py-3 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {visible.map(inv => {
                  const st = dueStatus(inv)
                  return (
                    <tr key={inv.id} className="border-t u-line hover:u-fill cursor-pointer"
                      onClick={() => { setEditing(inv); setDrawerOpen(true) }}>
                      <td className="px-4 py-3">
                        <div className="font-medium u-ink">{inv.supplier_name}</div>
                        {inv.category && <div className="text-xs u-muted">{inv.category}</div>}
                      </td>
                      <td className="px-4 py-3 u-ink">{inv.invoice_number || '—'}</td>
                      <td className="px-4 py-3 u-ink tabular-nums">{fmtDate(inv.issue_date)}</td>
                      <td className="px-4 py-3 u-ink tabular-nums">{fmtDate(inv.due_date)}</td>
                      <td className="px-4 py-3 text-right font-semibold u-ink tabular-nums">
                        {fmtCHF(inv.amount)} <span className="text-xs font-normal u-muted">{inv.currency || 'CHF'}</span>
                      </td>
                      <td className="px-4 py-3 u-ink tabular-nums">
                        {inv.paid_at ? (
                          fmtDate(String(inv.paid_at).slice(0, 10))
                        ) : inv.scheduled_payment_date ? (
                          <span className="u-info">{fmtDate(inv.scheduled_payment_date)}</span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 u-pill text-xs font-semibold inline-block"
                          style={{ background: DISPLAY_STATUSES[st].color + '18', color: DISPLAY_STATUSES[st].color }}>
                          {DISPLAY_STATUSES[st].label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right u-muted">›</td>
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
    scheduled_payment_date: invoice?.scheduled_payment_date || '',
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

  const inputCls = "w-full px-3 py-2 border u-line u-pill text-sm u-surface focus:u-line focus:outline-none"
  // Rayon panneau (15px) pour les champs multilignes : à 999px les deux coins
  // se rejoignent et le champ devient une ellipse. Dérivé, pour ne pas diverger.
  const textareaCls = inputCls.replace('u-pill', 'u-panel')

  return (
    <>
      <style>{`
        @keyframes drawerSlide { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes drawerFade { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
      <div className="fixed inset-0 z-50" style={{ background: 'rgba(15,23,42,0.35)', animation: 'drawerFade 0.15s ease-out both' }}
        onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="fixed top-0 right-0 bottom-0 u-surface flex flex-col shadow-2xl"
          style={{ width: '100%', maxWidth: 560, animation: 'drawerSlide 0.2s cubic-bezier(0.4,0,0.2,1) both', fontFamily: FONT }}>

          <div className="flex items-center justify-between px-8 py-5 border-b u-line">
            <div>
              <p className="text-xs uppercase tracking-wider u-muted mb-0.5">{isEdit ? 'Modifier' : 'Nouvelle facture fournisseur'}</p>
              <h2 className="font-semibold u-ink" style={{ fontSize: 20 }}>
                {isEdit ? (form.supplier_name || 'Facture') : 'Saisir une facture'}
              </h2>
            </div>
            <button onClick={onClose} className="w-9 h-9 flex items-center justify-center u-pill u-muted hover:u-fill" style={{ fontSize: 22 }}>×</button>
          </div>

          <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5">
            {/* Upload + scan IA */}
            {!isEdit && (
              <div>
                <label className="block text-xs font-medium u-muted mb-1.5">PDF ou image de la facture</label>
                <label
                  className="block w-full u-pill border border-dashed cursor-pointer overflow-hidden"
                  style={{ borderColor: filePreview ? C.successBg : C.border, background: filePreview ? C.successBg : AL.white, minHeight: 96 }}
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
                        <div className="w-16 h-16 flex items-center justify-center u-surface rounded border">📄</div>
                      )}
                      <div className="flex-1">
                        <div className="text-sm font-medium u-ok">Fichier attaché</div>
                        <div className="text-xs u-muted truncate">{filePreview.name}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-6 gap-1">
                      <p className="text-sm u-ink font-medium">Glisser un fichier ou <span className="underline">parcourir</span></p>
                      <p className="text-xs u-muted">PDF / Image · sera stocké sur kDrive</p>
                    </div>
                  )}
                </label>
                {filePreview && filePreview.mime.startsWith('image/') && (
                  <button onClick={scan} disabled={scanLoading}
                    className="mt-3 w-full py-2 u-pill text-sm font-medium border"
                    style={{ borderColor: C.infoBg, color: C.info, background: scanLoading ? C.neutralBg : 'white' }}>
                    {scanLoading ? 'Analyse IA…' : 'Pré-remplir avec l\'IA'}
                  </button>
                )}
                {scanError && <p className="text-xs u-ko mt-2">{scanError}</p>}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-medium u-muted mb-1.5">Fournisseur *</label>
                <div className="mb-2"><ContactPicker placeholder="Choisir dans les contacts…" onSelect={({ name }) => set('supplier_name', name)} /></div>
                <input className={inputCls} value={form.supplier_name} onChange={e => set('supplier_name', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium u-muted mb-1.5">N° facture</label>
                <input className={inputCls} value={form.invoice_number} onChange={e => set('invoice_number', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium u-muted mb-1.5">Catégorie</label>
                <input className={inputCls} value={form.category} onChange={e => set('category', e.target.value)} placeholder="Matériel, services..." />
              </div>
              <div>
                <label className="block text-xs font-medium u-muted mb-1.5">Total TTC *</label>
                <input type="number" step="0.01" className={inputCls} value={form.amount}
                  onChange={e => {
                    set('amount', e.target.value)
                    if (form.vat_rate) recomputeFromGross(e.target.value, form.vat_rate)
                  }} />
              </div>
              <div>
                <label className="block text-xs font-medium u-muted mb-1.5">Devise</label>
                <select className={inputCls} value={form.currency} onChange={e => set('currency', e.target.value)}>
                  <option>CHF</option><option>EUR</option><option>USD</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium u-muted mb-1.5">TVA (%)</label>
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
                <label className="block text-xs font-medium u-muted mb-1.5">Montant HT</label>
                <input type="number" step="0.01" className={inputCls} value={form.amount_net}
                  onChange={e => set('amount_net', e.target.value)}
                  placeholder="auto si TTC + taux" />
              </div>
              <div className="col-span-2 -mt-1">
                <p className="text-xs u-muted">
                  TVA : <span className="font-semibold u-ink tabular-nums">{form.vat_amount ? `${form.vat_amount} ${form.currency}` : '—'}</span>
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium u-muted mb-1.5">Émise le</label>
                <input type="date" className={inputCls} value={form.issue_date} onChange={e => set('issue_date', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium u-muted mb-1.5">Échéance</label>
                <input type="date" className={inputCls} value={form.due_date} onChange={e => set('due_date', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium u-muted mb-1.5">Référence paiement (QR/ESR)</label>
                <input className={inputCls} value={form.payment_reference} onChange={e => set('payment_reference', e.target.value)}
                  placeholder="27 chiffres si QR-bill" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium u-muted mb-1.5">IBAN du fournisseur</label>
                <input className={inputCls} value={form.iban} onChange={e => set('iban', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium u-muted mb-1.5">Notes</label>
                <textarea rows={2} className={textareaCls} value={form.notes} onChange={e => set('notes', e.target.value)} />
              </div>
              {isEdit && (
                <>
                  <div className={form.status === 'sent_to_bank' ? '' : 'col-span-2'}>
                    <label className="block text-xs font-medium u-muted mb-1.5">Statut</label>
                    {/* « En retard » se déduit de l'échéance, il ne se choisit pas */}
                    <select className={inputCls} value={form.status} onChange={e => set('status', e.target.value)}>
                      <option value="pending">À payer</option>
                      <option value="sent_to_bank">Transmis à la banque</option>
                      <option value="paid">Payée</option>
                    </select>
                  </div>
                  {form.status === 'sent_to_bank' && (
                    <div>
                      <label className="block text-xs font-medium u-muted mb-1.5">Date de paiement</label>
                      <input type="date" className={inputCls} value={form.scheduled_payment_date}
                        onChange={e => set('scheduled_payment_date', e.target.value)} />
                      <p className="text-xs u-muted mt-1">
                        Peut être future. Le statut passera à « payée » tout seul au prochain import CAMT.
                      </p>
                    </div>
                  )}
                  {form.status === 'paid' && invoice?.paid_at && (
                    <div className="col-span-2 text-xs u-muted">
                      Payée le {fmtDate(String(invoice.paid_at).slice(0, 10))}
                      {invoice.paid_transaction_id ? ' — rapprochée du relevé bancaire' : ''}
                    </div>
                  )}
                </>
              )}
            </div>

            {saveError && <p className="text-xs u-ko">{saveError}</p>}

            {isEdit && invoice?.kdrive_file_id && (
              <a href={`/api/kdrive/download?fileId=${invoice.kdrive_file_id}`} target="_blank" rel="noopener"
                className="block w-full text-center px-4 py-2 u-pill text-sm font-medium border u-line u-ink hover:u-line">
                📎 Ouvrir le fichier attaché
              </a>
            )}
          </div>

          <div className="px-8 py-4 border-t u-line flex items-center justify-between gap-3">
            {isEdit ? (
              <button onClick={deleteInvoice} className="text-sm font-medium u-ko hover:u-ko">Supprimer</button>
            ) : <span />}
            <div className="flex gap-2">
              <button onClick={onClose} className="px-4 py-2 u-pill text-sm font-medium u-ink hover:u-fill">Annuler</button>
              <button onClick={save} disabled={saving}
                className="px-5 py-2 u-pill text-white font-medium text-sm disabled:opacity-50"
                style={{ background: AL.black }}>
                {saving ? 'Enregistrement…' : isEdit ? 'Mettre à jour' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
