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
      <NavBar title="Justificatifs de dépense" />

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
                  <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
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
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold inline-block"
                        style={{ background: (PAYMENT_COLORS[r.payment_method || 'personal']) + '18',
                                 color: PAYMENT_COLORS[r.payment_method || 'personal'] }}>
                        {PAYMENT_LABELS[r.payment_method || 'personal']}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">
                      {fmtCHF(r.amount)} <span className="text-xs font-normal text-gray-400">{r.currency || 'CHF'}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {r.receipt_url ? (
                        <a href={r.receipt_url} target="_blank" rel="noopener"
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
    </div>
  )
}
