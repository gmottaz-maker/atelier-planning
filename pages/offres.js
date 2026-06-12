import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import { useAuth } from './_app'
import NavBar from '../components/NavBar'
import useIsAdmin from '../lib/useIsAdmin'
import adminFetch from '../lib/adminFetch'
import { QUOTE_STATUSES, quoteStatusMeta } from '../lib/quoteStatus'
import { computeQuoteTotal } from '../lib/quoteTotals'

const INV_STATUSES = [
  { key: 'pending',   label: 'En attente', color: '#b45309', bg: '#fffbeb' },
  { key: 'paid',      label: 'Payée',      color: '#15803d', bg: '#dcfce7' },
  { key: 'overdue',   label: 'En retard',  color: '#dc2626', bg: '#fee2e2' },
  { key: 'cancelled', label: 'Annulée',    color: '#6b7280', bg: '#f3f4f6' },
]
function invMeta(key) { return INV_STATUSES.find(s => s.key === key) || INV_STATUSES[0] }
function invEffective(inv) {
  if (inv.status === 'paid' || inv.status === 'cancelled') return inv.status
  if (inv.due_date && new Date(inv.due_date) < new Date()) return 'overdue'
  return 'pending'
}
function fmtCHF(n) { return new Intl.NumberFormat('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0) }

export default function Offres() {
  const router = useRouter()
  const { user } = useAuth()
  const isAdmin = useIsAdmin()
  useEffect(() => { if (user && !isAdmin) router.replace('/') }, [user, isAdmin])

  const [projects, setProjects] = useState([])
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState('all')

  async function load() {
    setLoading(true)
    const [p, i] = await Promise.all([
      adminFetch('/api/projects').then(r => r.json()),
      adminFetch(`/api/customer-invoices?year=${new Date().getFullYear()}`).then(r => r.json()),
    ])
    setProjects(Array.isArray(p) ? p : [])
    setInvoices(Array.isArray(i) ? i : [])
    setLoading(false)
  }
  useEffect(() => { if (isAdmin) load() }, [isAdmin])

  if (user && !isAdmin) return null

  function hasQuote(p) {
    const q = p.quote_data
    if (!q) return false
    if (q.status) return true
    const lines = (q.management?.length || 0) + (q.items?.length || 0) + (q.subcontracting?.length || 0) + (q.logistics?.length || 0)
    return lines > 0
  }

  const offers = projects.filter(hasQuote).map(p => ({
    p,
    total:   computeQuoteTotal(p.quote_data),
    status:  p.quote_data.status || 'brouillon',
    number:  p.quote_data.number,
    invoice: invoices.find(inv => String(inv.project_id) === String(p.id)),
  })).sort((a, b) => (a.p.deadline || '').localeCompare(b.p.deadline || ''))

  const shown = filter === 'all' ? offers : offers.filter(o => o.status === filter)

  const byStatus = QUOTE_STATUSES.reduce((m, s) => { m[s.key] = offers.filter(o => o.status === s.key).length; return m }, {})
  const totalAccepted = offers.filter(o => o.status === 'accepte').reduce((s, o) => s + o.total, 0)
  const totalInvoiced = offers.filter(o => o.invoice).reduce((s, o) => s + (o.invoice.amount || 0), 0)
  const totalPaid     = offers.filter(o => o.invoice && o.invoice.status === 'paid').reduce((s, o) => s + (o.invoice.amount || 0), 0)

  async function changeOfferStatus(o, status) {
    setProjects(prev => prev.map(pr => pr.id === o.p.id ? { ...pr, quote_data: { ...pr.quote_data, status } } : pr))
    await adminFetch(`/api/projects/${o.p.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...o.p, quote_data: { ...o.p.quote_data, status } }),
    }).catch(() => load())
  }
  async function changeInvoiceStatus(inv, status) {
    setInvoices(prev => prev.map(x => x.id === inv.id ? { ...x, status } : x))
    await adminFetch(`/api/customer-invoices/${inv.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }).catch(() => load())
  }

  const th = "px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide"

  return (
    <div className="min-h-screen" style={{ background: '#fafafa' }}>
      <Head><title>Offres — Maze Project</title></Head>
      <NavBar title="Offres" />

      <main className="w-full px-4 md:px-10 py-6 md:py-10" style={{ maxWidth: 1400, margin: '0 auto' }}>
        <div className="flex items-baseline gap-3 mb-6">
          <h2 className="font-semibold text-gray-900 tracking-tight" style={{ fontSize: 'clamp(20px, 5vw, 28px)' }}>Suivi des offres</h2>
          <span className="text-gray-400" style={{ fontSize: 15 }}>{offers.length}</span>
        </div>

        {/* Résumé */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Accepté (à facturer)', value: fmtCHF(totalAccepted) + ' CHF', sub: `${byStatus.accepte || 0} offre(s)`, color: '#15803d' },
            { label: 'Facturé',              value: fmtCHF(totalInvoiced) + ' CHF', sub: `${offers.filter(o => o.invoice).length} facture(s)`, color: '#1d4ed8' },
            { label: 'Encaissé',             value: fmtCHF(totalPaid) + ' CHF',     sub: 'payé', color: '#16a34a' },
            { label: 'En cours',             value: `${(byStatus.brouillon || 0) + (byStatus.envoye || 0)}`, sub: 'brouillon + envoyé', color: '#6b7280' },
          ].map((c, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 px-4 py-3.5">
              <div className="text-xs text-gray-500 mb-1">{c.label}</div>
              <div className="font-semibold tabular-nums" style={{ fontSize: 18, color: c.color }}>{c.value}</div>
              <div className="text-xs text-gray-400 mt-0.5">{c.sub}</div>
            </div>
          ))}
        </div>

        {/* Filtre statut */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {[{ key: 'all', label: 'Toutes' }, ...QUOTE_STATUSES].map(s => (
            <button key={s.key} onClick={() => setFilter(s.key)}
              className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
              style={filter === s.key ? { background: '#111827', color: '#fff' } : { background: '#fff', color: '#6b7280', border: '1px solid #e5e7eb' }}>
              {s.label}{s.key !== 'all' && ` · ${byStatus[s.key] || 0}`}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400 text-sm">Chargement…</div>
        ) : shown.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400 text-sm">Aucune offre.</div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full" style={{ minWidth: 900 }}>
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className={th}>Client / Projet</th>
                  <th className={th}>N°</th>
                  <th className={th + ' text-right'}>Montant</th>
                  <th className={th}>Statut offre</th>
                  <th className={th}>Offre</th>
                  <th className={th}>Facture</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {shown.map(o => {
                  const sm = quoteStatusMeta(o.status)
                  const autoRef = `${new Date().getFullYear()}-${String(o.p.id).slice(-4).toUpperCase()}`
                  const inv = o.invoice
                  const im = inv ? invMeta(invEffective(inv)) : null
                  return (
                    <tr key={o.p.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3">
                        <Link href={`/projects/${o.p.id}`} className="block">
                          <div className="font-medium text-gray-900 truncate" style={{ fontSize: 14 }}>{o.p.name}</div>
                          <div className="text-gray-400 truncate" style={{ fontSize: 12 }}>{o.p.client}</div>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-600 tabular-nums" style={{ fontSize: 13 }}>{o.number || autoRef}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums" style={{ fontSize: 14 }}>{fmtCHF(o.total)}</td>
                      <td className="px-4 py-3">
                        <select value={o.status} onChange={e => changeOfferStatus(o, e.target.value)}
                          className="text-xs font-semibold rounded-full pl-2.5 pr-1 py-1 border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-gray-300"
                          style={{ background: sm.bg, color: sm.color }}>
                          {QUOTE_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <a href={`/projects/${o.p.id}/devis`} target="_blank" rel="noopener"
                          className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                          PDF
                        </a>
                      </td>
                      <td className="px-4 py-3">
                        {inv ? (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-gray-500 tabular-nums" style={{ fontSize: 12 }}>{inv.invoice_number}</span>
                            <select value={inv.status} onChange={e => changeInvoiceStatus(inv, e.target.value)}
                              className="text-xs font-semibold rounded-full pl-2.5 pr-1 py-1 border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-gray-300"
                              style={{ background: im.bg, color: im.color }}>
                              {INV_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                            </select>
                            <a href={`/api/customer-invoices/${inv.id}/pdf`} target="_blank" rel="noopener"
                              className="text-gray-400 hover:text-gray-900" title="Télécharger la facture (PDF QR-bill)">
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                            </a>
                          </div>
                        ) : o.status === 'accepte' ? (
                          <Link href={`/factures-emises?from=${o.p.id}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-white"
                            style={{ background: '#111827' }}>
                            Créer la facture
                          </Link>
                        ) : (
                          <span className="text-gray-300 text-sm">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
