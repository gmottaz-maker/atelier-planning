import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { useAuth } from './_app'
import NavBar from '../components/NavBar'
import useIsAdmin from '../lib/useIsAdmin'
import adminFetch from '../lib/adminFetch'

const PINK = '#111827'
const PERSON_COLORS = { Arnaud: '#3b82f6', Gabin: '#8b5cf6', Guillaume: '#111827' }
const PAYMENT_LABELS  = { personal: 'Perso (à rembourser)', company: 'Société (carte)' }
const PAYMENT_COLORS  = { personal: '#f59e0b', company: '#0ea5e9' }

function fmtCHF(n) {
  if (n == null) return '—'
  return new Intl.NumberFormat('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}
function fmtDate(s) {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}.${m}.${y}`
}

export default function Justificatifs() {
  const router = useRouter()
  const { user } = useAuth()
  const isAdmin = useIsAdmin()
  useEffect(() => { if (user && !isAdmin) router.replace('/') }, [user, isAdmin])
  if (user && !isAdmin) return null

  const [rows, setRows]     = useState([])
  const [loading, setLoading] = useState(true)
  const [year, setYear]     = useState(new Date().getFullYear())
  const [filter, setFilter] = useState('all') // all | personal | company
  const [person, setPerson] = useState('all')
  const [dragging, setDragging] = useState(false)
  const [processing, setProcessing] = useState([])
  const [editing, setEditing] = useState(null)
  const [dropMode, setDropMode] = useState('company') // mode appliqué aux prochains imports

  async function load() {
    setLoading(true)
    const params = new URLSearchParams({ year: String(year) })
    if (filter !== 'all') params.set('payment_method', filter)
    const r = await adminFetch(`/api/expenses/all?${params}`)
    const data = await r.json()
    setRows(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [year, filter])

  // ── Drop global sur la page ────────────────────────────────────────────────
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
      setProcessing(p => p.map(x => x.id === id ? { ...x, status: 'scanning' } : x))
      const scanRes = await adminFetch('/api/expenses/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mimeType: file.type }),
      })
      const scan = await scanRes.json()
      const body = {
        userName:        user?.name || 'Guillaume',
        date:            scan.date || new Date().toISOString().slice(0, 10),
        amount:          scan.amount ?? null,
        amount_net:      scan.amount_net ?? null,
        vat_rate:        scan.vat_rate ?? null,
        vat_amount:      scan.vat_amount ?? null,
        currency:        scan.currency || 'CHF',
        category:        scan.category || 'Autre',
        merchant:        scan.merchant || null,
        description:     scan.description || null,
        receiptBase64:   base64,
        receiptMimeType: file.type,
        payment_method:  dropMode,
      }
      setProcessing(p => p.map(x => x.id === id ? { ...x, status: 'uploading' } : x))
      const r = await adminFetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (r.status === 409) {
        const dup = d.duplicate_of
        setProcessing(p => p.map(x => x.id === id ? {
          ...x, status: 'duplicate',
          duplicate: dup,
          retry: async () => {
            setProcessing(pp => pp.map(xx => xx.id === id ? { ...xx, status: 'uploading' } : xx))
            const r2 = await adminFetch('/api/expenses', {
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
      setProcessing(p => p.map(x => x.id === id ? { ...x, status: 'done' } : x))
      load()
      setTimeout(() => setProcessing(p => p.filter(x => x.id !== id)), 3000)
    } catch (e) {
      setProcessing(p => p.map(x => x.id === id ? { ...x, status: 'error', error: e.message } : x))
      setTimeout(() => setProcessing(p => p.filter(x => x.id !== id)), 6000)
    }
  }

  async function togglePaymentMethod(row) {
    const next = row.payment_method === 'company' ? 'personal' : 'company'
    setRows(rs => rs.map(r => r.id === row.id ? { ...r, payment_method: next } : r))
    await adminFetch(`/api/expenses?id=${row.id}&userName=${encodeURIComponent(row.user_name)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment_method: next }),
    })
  }

  const visible = rows.filter(r => person === 'all' || r.user_name === person)
  const totals = visible.reduce((acc, r) => {
    const amt = parseFloat(r.amount || 0)
    acc.total += amt
    if (r.payment_method === 'personal') acc.toReimburse += amt
    if (r.payment_method === 'company')  acc.company += amt
    return acc
  }, { total: 0, toReimburse: 0, company: 0 })

  // Par personne (uniquement perso pour le récap des remboursements)
  const reimbursementsByPerson = rows
    .filter(r => r.payment_method === 'personal')
    .reduce((acc, r) => {
      acc[r.user_name] = (acc[r.user_name] || 0) + parseFloat(r.amount || 0)
      return acc
    }, {})

  const allPeople = Array.from(new Set(rows.map(r => r.user_name))).sort()

  return (
    <div className="min-h-screen" style={{ background: '#fafafa' }}>
      <Head><title>Maze Project — Justificatifs</title></Head>
      <NavBar title="Justificatifs de dépense">
        <div className="flex items-center gap-1.5 bg-gray-100 rounded-md p-0.5 mr-2">
          <button onClick={() => setDropMode('personal')}
            className="px-2.5 py-1 rounded text-xs font-semibold transition-colors"
            style={dropMode === 'personal'
              ? { background: 'white', color: '#92400e', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }
              : { background: 'transparent', color: '#6b7280' }}>
            💳 Perso
          </button>
          <button onClick={() => setDropMode('company')}
            className="px-2.5 py-1 rounded text-xs font-semibold transition-colors"
            style={dropMode === 'company'
              ? { background: 'white', color: '#075985', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }
              : { background: 'transparent', color: '#6b7280' }}>
            🏢 Société
          </button>
        </div>
        <label className="px-4 py-2 text-sm font-medium rounded-md text-white cursor-pointer" style={{ background: PINK }}>
          📁 Importer
          <input type="file" multiple accept="image/*,application/pdf" className="hidden"
            onChange={e => { Array.from(e.target.files || []).forEach(processDroppedFile); e.target.value = '' }} />
        </label>
      </NavBar>

      {/* Overlay drop fullscreen */}
      {dragging && (
        <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none"
          style={{ background: 'rgba(17, 24, 39, 0.55)' }}>
          <div className="bg-white rounded-2xl px-10 py-8 text-center shadow-2xl border-2 border-dashed" style={{ borderColor: '#111827' }}>
            <div className="text-5xl mb-3">📥</div>
            <p className="font-semibold text-gray-900" style={{ fontSize: 18 }}>
              Déposez votre justificatif ici
            </p>
            <p className="text-sm mt-1" style={{ color: dropMode === 'personal' ? '#92400e' : '#075985' }}>
              Mode : {dropMode === 'personal' ? '💳 Perso (à rembourser)' : '🏢 Société (carte)'}
            </p>
            <p className="text-xs text-gray-400 mt-2">JPG · PNG · PDF — l'IA va l'analyser</p>
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
                  {p.status === 'uploading' && 'Sauvegarde…'}
                  {p.status === 'done'      && 'Importé ✓'}
                  {p.status === 'error'     && `Erreur : ${p.error}`}
                  {p.status === 'duplicate' && (
                    <>
                      Doublon détecté ({p.duplicate?.amount} CHF, {p.duplicate?.date}){' '}
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

        {/* Stats globales */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
            <div className="text-xs text-gray-500 mb-1">Total année</div>
            <div className="font-semibold tabular-nums" style={{ fontSize: 22, color: '#111827', letterSpacing: '-0.02em' }}>
              {fmtCHF(totals.total)} <span className="text-xs font-normal text-gray-400">CHF</span>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-amber-200 px-4 py-3">
            <div className="text-xs text-amber-700 mb-1">À rembourser (perso)</div>
            <div className="font-semibold tabular-nums" style={{ fontSize: 22, color: '#92400e', letterSpacing: '-0.02em' }}>
              {fmtCHF(totals.toReimburse)} <span className="text-xs font-normal text-gray-400">CHF</span>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-sky-200 px-4 py-3">
            <div className="text-xs text-sky-700 mb-1">Carte société</div>
            <div className="font-semibold tabular-nums" style={{ fontSize: 22, color: '#075985', letterSpacing: '-0.02em' }}>
              {fmtCHF(totals.company)} <span className="text-xs font-normal text-gray-400">CHF</span>
            </div>
          </div>
        </div>

        {/* Récap remboursements par personne */}
        {Object.keys(reimbursementsByPerson).length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Remboursements dûs ({year})</div>
            <div className="flex flex-wrap gap-3">
              {Object.entries(reimbursementsByPerson).map(([name, amt]) => (
                <div key={name} className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-md">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-semibold"
                    style={{ background: PERSON_COLORS[name] || '#9ca3af' }}>
                    {name?.[0]}
                  </div>
                  <span className="text-sm font-medium text-gray-900">{name}</span>
                  <span className="text-sm font-bold tabular-nums" style={{ color: '#92400e' }}>{fmtCHF(amt)} CHF</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filtres */}
        <div className="flex items-center gap-2 flex-wrap">
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="px-3 py-1.5 border border-gray-200 rounded-md text-sm bg-white">
            {[2026, 2025, 2024, 2023].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {[
            { k: 'all',      label: 'Tous' },
            { k: 'personal', label: 'Perso (à rembourser)' },
            { k: 'company',  label: 'Carte société' },
          ].map(f => (
            <button key={f.k} onClick={() => setFilter(f.k)}
              className="px-3 py-1.5 rounded-md text-xs font-medium"
              style={filter === f.k ? { background: '#111827', color: 'white' } : { background: '#f3f4f6', color: '#6b7280' }}>
              {f.label}
            </button>
          ))}
          {allPeople.length > 1 && (
            <select value={person} onChange={e => setPerson(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-md text-sm bg-white">
              <option value="all">Toutes personnes</option>
              {allPeople.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
        </div>

        {/* Liste */}
        {loading ? (
          <p className="text-sm text-gray-400 py-12 text-center">Chargement…</p>
        ) : visible.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <p className="text-sm text-gray-400">Aucun justificatif.</p>
            <p className="text-xs text-gray-400 mt-1">Les frais sont saisis depuis la page Horaires par chaque utilisateur.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-3 text-left font-semibold text-gray-700" style={{ fontSize: 11 }}>Date</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700" style={{ fontSize: 11 }}>Personne</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700" style={{ fontSize: 11 }}>Commerçant</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700" style={{ fontSize: 11 }}>Catégorie</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700" style={{ fontSize: 11 }}>Mode</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700" style={{ fontSize: 11 }}>Montant</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-700" style={{ fontSize: 11 }}>Reçu</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(r => (
                  <tr key={r.id} onClick={() => setEditing(r)}
                    className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer">
                    <td className="px-4 py-3 text-gray-600 tabular-nums">{fmtDate(r.date)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
                          style={{ background: PERSON_COLORS[r.user_name] || '#9ca3af' }}>
                          {r.user_name?.[0]}
                        </div>
                        <span className="text-sm">{r.user_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{r.merchant || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{r.category}</td>
                    <td className="px-4 py-3">
                      <button onClick={e => { e.stopPropagation(); togglePaymentMethod(r) }}
                        className="px-2 py-0.5 rounded-full text-xs font-semibold inline-block hover:opacity-80 transition-opacity"
                        title="Cliquer pour basculer perso ↔ société"
                        style={{ background: (PAYMENT_COLORS[r.payment_method || 'personal']) + '18',
                                 color: PAYMENT_COLORS[r.payment_method || 'personal'] }}>
                        {PAYMENT_LABELS[r.payment_method || 'personal']}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">
                      {fmtCHF(r.amount)} <span className="text-xs font-normal text-gray-400">{r.currency || 'CHF'}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {r.receipt_url ? (
                        <a href={r.receipt_url} target="_blank" rel="noopener"
                          onClick={e => e.stopPropagation()}
                          className="text-xs text-gray-500 hover:text-gray-900 underline">voir</a>
                      ) : <span className="text-xs text-gray-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {editing && (
        <JustificatifDrawer
          row={editing}
          people={allPeople.length ? allPeople : ['Arnaud', 'Gabin', 'Guillaume']}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}

// ─── Drawer édition justificatif ───────────────────────────────────────────

const CATEGORIES = ['Repas', 'Transport', 'Hébergement', 'Fournitures', 'Matériel', 'Autre']

function JustificatifDrawer({ row, people, onClose, onSaved }) {
  const [form, setForm] = useState({
    date:           row.date,
    amount:         row.amount ?? '',
    amount_net:     row.amount_net ?? '',
    vat_rate:       row.vat_rate ?? '',
    vat_amount:     row.vat_amount ?? '',
    currency:       row.currency || 'CHF',
    category:       row.category || 'Autre',
    merchant:       row.merchant || '',
    description:    row.description || '',
    payment_method: row.payment_method || 'personal',
    user_name:      row.user_name,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  // Auto-calcul HT + TVA quand on change TTC ou taux
  function recomputeFromGross(gross, rate) {
    const g = parseFloat(gross), r = parseFloat(rate)
    if (isNaN(g) || isNaN(r) || r < 0) return
    const net = g / (1 + r / 100)
    setForm(f => ({ ...f, amount_net: net.toFixed(2), vat_amount: (g - net).toFixed(2) }))
  }

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function save() {
    setSaving(true); setError('')
    try {
      const params = new URLSearchParams({ id: String(row.id), userName: row.user_name })
      const r = await adminFetch(`/api/expenses?${params}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: form.date,
          amount:     form.amount     === '' ? null : parseFloat(form.amount),
          amount_net: form.amount_net === '' ? null : parseFloat(form.amount_net),
          vat_rate:   form.vat_rate   === '' ? null : parseFloat(form.vat_rate),
          vat_amount: form.vat_amount === '' ? null : parseFloat(form.vat_amount),
          category: form.category,
          merchant: form.merchant,
          description: form.description,
          payment_method: form.payment_method,
        }),
      })
      const d = await r.json()
      if (d.error) { setError(d.error); return }
      onSaved()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  async function del() {
    if (!confirm('Supprimer ce justificatif et son reçu ?')) return
    const params = new URLSearchParams({ id: String(row.id), userName: row.user_name })
    await adminFetch(`/api/expenses?${params}`, { method: 'DELETE' })
    onSaved()
  }

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
              <p className="text-xs uppercase tracking-wider text-gray-400 mb-0.5">Justificatif · {form.user_name}</p>
              <h2 className="font-semibold text-gray-900" style={{ fontSize: 20 }}>{form.merchant || 'Sans commerçant'}</h2>
            </div>
            <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-100" style={{ fontSize: 22 }}>×</button>
          </div>

          <div className="flex-1 overflow-y-auto px-8 py-6 space-y-4">
            {row.receipt_url && (
              <div className="rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
                <a href={row.receipt_url} target="_blank" rel="noopener" className="block">
                  <img src={row.receipt_url} alt="reçu" style={{ maxHeight: 280, width: '100%', objectFit: 'contain' }}
                    onError={e => { e.currentTarget.style.display = 'none' }} />
                </a>
                <div className="px-3 py-2 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-xs text-gray-500">Reçu attaché</span>
                  <a href={row.receipt_url} target="_blank" rel="noopener" className="text-xs text-gray-700 underline">Ouvrir en grand</a>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
                <input type="date" className={inputCls} value={form.date} onChange={e => set('date', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Total TTC</label>
                <input type="number" step="0.01" className={inputCls} value={form.amount}
                  onChange={e => {
                    set('amount', e.target.value)
                    if (form.vat_rate) recomputeFromGross(e.target.value, form.vat_rate)
                  }} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">TVA</label>
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
                <label className="block text-xs font-medium text-gray-500 mb-1">Montant HT</label>
                <input type="number" step="0.01" className={inputCls} value={form.amount_net}
                  onChange={e => set('amount_net', e.target.value)}
                  placeholder="auto si TTC + taux" />
              </div>
              <div className="col-span-2 -mt-1">
                <p className="text-xs text-gray-400">
                  TVA : <span className="font-semibold text-gray-700 tabular-nums">{form.vat_amount ? `${form.vat_amount} ${form.currency}` : '—'}</span>
                </p>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Commerçant</label>
                <input className={inputCls} value={form.merchant} onChange={e => set('merchant', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Catégorie</label>
                <select className={inputCls} value={form.category} onChange={e => set('category', e.target.value)}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                <textarea rows={2} className={inputCls} value={form.description} onChange={e => set('description', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-2">Mode de paiement</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button"
                    onClick={() => set('payment_method', 'personal')}
                    className="py-2.5 rounded-md text-sm font-medium border"
                    style={form.payment_method === 'personal'
                      ? { borderColor: '#f59e0b', background: '#fef3c7', color: '#92400e' }
                      : { borderColor: '#e5e7eb', background: 'white', color: '#6b7280' }}>
                    💳 Compte perso
                    <span className="block text-[10px] opacity-75 font-normal">à rembourser</span>
                  </button>
                  <button type="button"
                    onClick={() => set('payment_method', 'company')}
                    className="py-2.5 rounded-md text-sm font-medium border"
                    style={form.payment_method === 'company'
                      ? { borderColor: '#0ea5e9', background: '#e0f2fe', color: '#075985' }
                      : { borderColor: '#e5e7eb', background: 'white', color: '#6b7280' }}>
                    🏢 Carte société
                    <span className="block text-[10px] opacity-75 font-normal">déjà payé</span>
                  </button>
                </div>
              </div>
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>

          <div className="px-8 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
            <button onClick={del} className="text-sm font-medium text-red-500 hover:text-red-700">Supprimer</button>
            <div className="flex gap-2">
              <button onClick={onClose} className="px-4 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100">Annuler</button>
              <button onClick={save} disabled={saving}
                className="px-5 py-2 rounded-md text-white font-medium text-sm disabled:opacity-50"
                style={{ background: '#111827' }}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
