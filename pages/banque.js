import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { useAuth } from './_app'
import NavBar from '../components/NavBar'
import useIsAdmin from '../lib/useIsAdmin'
import adminFetch from '../lib/adminFetch'

const PINK = '#111827'

function fmtCHF(n) {
  if (n == null) return '—'
  return new Intl.NumberFormat('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}
function fmtDate(s) {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}.${m}.${y}`
}

const TYPE_LABELS = {
  supplier_invoice: 'Facture fournisseur',
  customer_invoice: 'Facture émise',
  expense:          'Dépense',
}

export default function Banque() {
  const router = useRouter()
  const { user } = useAuth()
  const currentUser = user?.name
  const isAdmin = useIsAdmin()
  useEffect(() => { if (user && !isAdmin) router.replace('/') }, [user, isAdmin])
  if (user && !isAdmin) return null
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState('unmatched') // unmatched | matched | all
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [selected, setSelected] = useState(null)

  async function load() {
    setLoading(true)
    const r = await adminFetch(`/api/bank/transactions?status=${filter}&suggestions=1`)
    const data = await r.json()
    setTransactions(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [filter])

  async function importFile(file) {
    if (!file) return
    setImporting(true)
    setImportResult(null)
    try {
      const text = await file.text()
      const isXml = text.trim().startsWith('<')
      const body = isXml ? { xml: text } : { csv: text }
      const r = await adminFetch('/api/bank/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (d.error) { setImportResult({ error: d.error }); return }
      setImportResult(d)
      load()
    } catch (e) {
      setImportResult({ error: e.message })
    } finally {
      setImporting(false)
    }
  }

  async function confirmMatch(tx, suggestion) {
    await adminFetch('/api/bank/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transaction_id: tx.id,
        type: suggestion.type,
        target_id: suggestion.candidate.id,
        confidence: suggestion.score,
        actor: currentUser,
      }),
    })
    setSelected(null)
    load()
  }

  async function unmatch(tx) {
    if (!confirm('Annuler ce matching ?')) return
    await adminFetch('/api/bank/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transaction_id: tx.id, unmatch: true }),
    })
    setSelected(null)
    load()
  }

  const stats = transactions.reduce((acc, t) => {
    acc.total++
    if (t.matched_to_type) acc.matched++
    return acc
  }, { total: 0, matched: 0 })

  return (
    <div className="min-h-screen" style={{ background: '#fafafa' }}>
      <Head><title>Maze Project — Banque</title></Head>

      <NavBar title="Banque">
        <label className="px-4 py-2 text-sm font-medium rounded-md text-white cursor-pointer"
          style={{ background: PINK }}>
          {importing ? 'Import…' : 'Importer relevé (CAMT.053)'}
          <input type="file" accept=".xml,.txt,application/xml,text/xml" className="hidden"
            onChange={e => importFile(e.target.files?.[0])} />
        </label>
      </NavBar>

      <main className="w-full px-4 md:px-10 py-6 md:py-10 space-y-6" style={{ maxWidth: 1600, margin: '0 auto' }}>

        {importResult && (
          <div className="rounded-md px-4 py-3 text-sm"
            style={{ background: importResult.error ? '#fee2e2' : '#f0fdf4',
                     color:      importResult.error ? '#991b1b' : '#15803d' }}>
            {importResult.error
              ? `Erreur : ${importResult.error}`
              : `${importResult.inserted} transaction(s) importée(s) · ${importResult.duplicates} doublon(s) ignoré(s) · ${importResult.total} total`}
          </div>
        )}

        {/* Stats + filtres */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex gap-1.5">
            {[
              { key: 'unmatched', label: 'À matcher' },
              { key: 'matched',   label: 'Matchées' },
              { key: 'all',       label: 'Toutes' },
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
          {!loading && (
            <span className="text-xs text-gray-500">
              {stats.matched}/{stats.total} matchées
            </span>
          )}
        </div>

        {/* Liste */}
        {loading ? (
          <p className="text-sm text-gray-400 py-12 text-center">Chargement…</p>
        ) : transactions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <p className="text-sm text-gray-400">Aucune transaction.</p>
            <p className="text-xs text-gray-400 mt-2">Importe un fichier CAMT.053 depuis ton e-banking.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-3 text-left font-semibold text-gray-700" style={{ fontSize: 11 }}>Date</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700" style={{ fontSize: 11 }}>Contrepartie</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700" style={{ fontSize: 11 }}>Libellé</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700" style={{ fontSize: 11 }}>Montant</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700" style={{ fontSize: 11 }}>Statut</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(tx => {
                  const matched = !!tx.matched_to_type
                  const isCredit = parseFloat(tx.amount) > 0
                  const topScore = tx.suggestions?.[0]?.score || 0
                  return (
                    <tr key={tx.id}
                      onClick={() => setSelected(tx)}
                      className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer">
                      <td className="px-4 py-3 text-gray-600 tabular-nums">{fmtDate(tx.booking_date)}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 truncate" style={{ maxWidth: 260 }}>
                          {tx.counterparty_name || '—'}
                        </div>
                        {tx.counterparty_iban && <div className="text-xs text-gray-400 truncate" style={{ maxWidth: 260 }}>{tx.counterparty_iban}</div>}
                      </td>
                      <td className="px-4 py-3 text-gray-600 truncate" style={{ maxWidth: 320 }}>
                        {tx.description || tx.reference || '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums" style={{ color: isCredit ? '#15803d' : '#9f1239' }}>
                        {isCredit ? '+' : ''}{fmtCHF(tx.amount)} <span className="text-xs font-normal text-gray-400">{tx.currency}</span>
                      </td>
                      <td className="px-4 py-3">
                        {matched ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold inline-block"
                            style={{ background: '#dcfce7', color: '#15803d' }}>
                            ✓ {TYPE_LABELS[tx.matched_to_type]}
                          </span>
                        ) : topScore >= 7 ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold inline-block"
                            style={{ background: '#fef3c7', color: '#92400e' }}>
                            Suggéré ({topScore.toFixed(0)}/10)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold inline-block"
                            style={{ background: '#f3f4f6', color: '#6b7280' }}>
                            À matcher
                          </span>
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

      {selected && (
        <MatchDrawer tx={selected}
          onClose={() => setSelected(null)}
          onConfirm={confirmMatch}
          onUnmatch={unmatch} />
      )}
    </div>
  )
}

function MatchDrawer({ tx, onClose, onConfirm, onUnmatch }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const isCredit = parseFloat(tx.amount) > 0
  const matched = !!tx.matched_to_type

  return (
    <>
      <style>{`
        @keyframes drawerSlide { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>
      <div className="fixed inset-0 z-50" style={{ background: 'rgba(15,23,42,0.35)' }}
        onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="fixed top-0 right-0 bottom-0 bg-white flex flex-col shadow-2xl overflow-y-auto"
          style={{ width: '100%', maxWidth: 560, animation: 'drawerSlide 0.2s ease both', fontFamily: 'Inter, sans-serif' }}>

          <div className="flex items-center justify-between px-8 py-5 border-b border-gray-100">
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-400 mb-0.5">Transaction</p>
              <h2 className="font-semibold text-gray-900" style={{ fontSize: 20 }}>
                {tx.counterparty_name || 'Sans contrepartie'}
              </h2>
            </div>
            <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-100" style={{ fontSize: 22 }}>×</button>
          </div>

          <div className="px-8 py-5 space-y-4 border-b border-gray-100">
            <div className="flex justify-between items-baseline">
              <span className="text-xs uppercase tracking-wider text-gray-400">Montant</span>
              <span className="font-bold tabular-nums" style={{ fontSize: 24, color: isCredit ? '#15803d' : '#9f1239' }}>
                {isCredit ? '+' : ''}{fmtCHF(tx.amount)} <span className="text-xs font-normal text-gray-400">{tx.currency}</span>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-400 text-xs block">Date</span>{fmtDate(tx.booking_date)}</div>
              <div><span className="text-gray-400 text-xs block">Compte</span><span className="text-xs">{tx.account_iban || '—'}</span></div>
              {tx.counterparty_iban && <div className="col-span-2"><span className="text-gray-400 text-xs block">IBAN contrepartie</span><span className="text-xs">{tx.counterparty_iban}</span></div>}
              {tx.reference && <div className="col-span-2"><span className="text-gray-400 text-xs block">Référence</span><span className="text-xs break-all">{tx.reference}</span></div>}
              {tx.description && <div className="col-span-2"><span className="text-gray-400 text-xs block">Libellé</span>{tx.description}</div>}
            </div>
          </div>

          {/* Matching */}
          <div className="px-8 py-5 flex-1">
            {matched ? (
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-400 mb-2">Matchée à</p>
                <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-4">
                  <p className="text-sm font-semibold text-green-900">{TYPE_LABELS[tx.matched_to_type]} #{tx.matched_to_id}</p>
                  <p className="text-xs text-green-700 mt-1">Matché le {tx.matched_at?.slice(0, 10)}</p>
                </div>
                <button onClick={() => onUnmatch(tx)}
                  className="text-xs font-medium text-red-500 hover:text-red-700">Annuler ce matching</button>
              </div>
            ) : (
              <>
                <p className="text-xs uppercase tracking-wider text-gray-400 mb-3">Suggestions</p>
                {!tx.suggestions || tx.suggestions.length === 0 ? (
                  <p className="text-sm text-gray-400">Aucune suggestion automatique. Vérifie que la facture correspondante existe.</p>
                ) : (
                  <ul className="space-y-2">
                    {tx.suggestions.map((s, i) => {
                      const c = s.candidate
                      const name = c.supplier_name || c.client_name || c.merchant || 'Sans nom'
                      const amt = c.amount
                      return (
                        <li key={i} className="border border-gray-200 rounded-lg p-3 hover:border-gray-400 cursor-pointer"
                          onClick={() => onConfirm(tx, s)}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-gray-500 uppercase">{TYPE_LABELS[s.type]}</span>
                            <span className="text-xs font-bold tabular-nums"
                              style={{ color: s.score >= 7 ? '#15803d' : '#92400e' }}>{s.score.toFixed(0)}/10</span>
                          </div>
                          <div className="font-medium text-gray-900 text-sm">{name}</div>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-xs text-gray-500">
                              {c.invoice_number ? `N° ${c.invoice_number} · ` : ''}{fmtDate(c.issue_date || c.date || c.due_date)}
                            </span>
                            <span className="text-sm font-semibold tabular-nums">{fmtCHF(amt)} CHF</span>
                          </div>
                          <div className="text-[10px] text-gray-400 mt-1">{s.reasons?.join(' · ')}</div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
