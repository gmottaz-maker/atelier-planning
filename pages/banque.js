import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { useAuth } from './_app'
import NavBar from '../components/NavBar'
import useIsAdmin from '../lib/useIsAdmin'
import adminFetch from '../lib/adminFetch'
import { matchesQuery, normalize } from '../lib/textSearch'
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
  const [suggestions, setSuggestions] = useState(null)  // null = en cours, [] = aucune
  const [q, setQ] = useState('')                        // recherche libre
  const [dir, setDir] = useState('all')                 // all | credit | debit
  const [sort, setSort] = useState({ key: 'booking_date', dir: 'desc' })

  async function load() {
    setLoading(true)
    const r = await adminFetch(`/api/bank/transactions?status=${filter}`)
    const data = await r.json()
    setTransactions(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [filter])

  // Ouvre le tiroir immédiatement, charge ses suggestions à part (une seule
  // transaction) plutôt que de les précalculer pour toute la liste.
  async function openTx(tx) {
    setSelected(tx)
    if (tx.matched_to_type) { setSuggestions([]); return }
    setSuggestions(null)
    try {
      const r = await adminFetch(`/api/bank/transactions?suggest_for=${tx.id}`)
      const d = await r.json()
      setSuggestions(Array.isArray(d.suggestions) ? d.suggestions : [])
    } catch { setSuggestions([]) }
  }

  // Met à jour la transaction localement, et la retire de la vue si elle ne
  // correspond plus au filtre — sans recharger toute la liste.
  function applyLocal(txId, patch) {
    setTransactions(ts => ts.flatMap(t => {
      if (t.id !== txId) return [t]
      const nt = { ...t, ...patch }
      const visible = filter === 'all'
        || (filter === 'matched' && nt.matched_to_type)
        || (filter === 'unmatched' && !nt.matched_to_type)
      return visible ? [nt] : []
    }))
  }

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

  // MAJ optimiste : l'écran réagit tout de suite, l'API confirme en arrière-plan.
  // En cas d'échec seulement, on resynchronise par un rechargement.
  async function confirmMatch(tx, suggestion) {
    applyLocal(tx.id, {
      matched_to_type: suggestion.type,
      matched_to_id: suggestion.candidate.id,
      matched_at: new Date().toISOString(),
    })
    setSelected(null)
    try {
      const r = await adminFetch('/api/bank/match', {
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
      const d = await r.json()
      if (d.error) throw new Error(d.error)
    } catch (e) {
      alert('Échec du matching : ' + e.message)
      load()
    }
  }

  async function unmatch(tx) {
    if (!confirm('Annuler ce matching ?')) return
    applyLocal(tx.id, { matched_to_type: null, matched_to_id: null, matched_at: null })
    setSelected(null)
    try {
      const r = await adminFetch('/api/bank/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction_id: tx.id, unmatch: true }),
      })
      const d = await r.json()
      if (d.error) throw new Error(d.error)
    } catch (e) {
      alert('Échec de l\'annulation : ' + e.message)
      load()
    }
  }

  const stats = transactions.reduce((acc, t) => {
    acc.total++
    if (t.matched_to_type) acc.matched++
    return acc
  }, { total: 0, matched: 0 })

  // ── Recherche, sens et tri ────────────────────────────────────────────────
  // La recherche porte sur la contrepartie, le libellé, la référence et l'IBAN :
  // « OBI » retrouve les achats OBI même si le nom n'est que dans le libellé,
  // sans ramener « automobile » (cf. lib/textSearch : début de mot).
  const norm = normalize
  const toggleSort = key => setSort(s => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))

  const visible = transactions
    .filter(t => {
      const amt = parseFloat(t.amount)
      if (dir === 'credit' && !(amt > 0)) return false
      if (dir === 'debit'  && !(amt < 0)) return false
      return matchesQuery([t.counterparty_name, t.description, t.reference, t.counterparty_iban], q)
    })
    .sort((a, b) => {
      const k = sort.key
      let va, vb
      if (k === 'amount') { va = parseFloat(a.amount) || 0; vb = parseFloat(b.amount) || 0 }
      else if (k === 'matched') { va = a.matched_to_type ? 1 : 0; vb = b.matched_to_type ? 1 : 0 }
      else { va = norm(a[k]); vb = norm(b[k]) }
      // Valeurs vides toujours en dernier, quel que soit le sens
      const ea = va === '' || va == null, eb = vb === '' || vb == null
      if (ea !== eb) return ea ? 1 : -1
      const c = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb))
      return sort.dir === 'asc' ? c : -c
    })

  const sumVisible = visible.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0)
  const th = (key, label, align = 'left') => (
    <th onClick={() => toggleSort(key)} title="Trier"
      className={`px-4 py-3 text-${align} font-semibold u-ink cursor-pointer select-none hover:u-ink`}
      style={{ fontSize: 11 }}>
      {label}
      <span className="ml-1 u-muted">{sort.key === key ? (sort.dir === 'asc' ? '↑' : '↓') : ''}</span>
    </th>
  )

  return (
    <div className="min-h-screen" style={{ background: AL.white }}>
      <Head><title>Maze Project — Banque</title></Head>

      <NavBar title="Banque">
        <label className="px-4 py-2 text-sm font-medium u-pill text-white cursor-pointer"
          style={{ background: PINK }}>
          {importing ? 'Import…' : 'Importer relevé (CAMT.053)'}
          <input type="file" accept=".xml,.txt,application/xml,text/xml" className="hidden"
            onChange={e => importFile(e.target.files?.[0])} />
        </label>
      </NavBar>

      <main className="w-full px-4 md:px-10 py-6 md:py-10 space-y-6" style={{ maxWidth: 1600, margin: '0 auto' }}>

        {importResult && (
          <div className="u-pill px-4 py-3 text-sm space-y-2"
            style={{ background: importResult.error ? 'rgba(196,0,43,.10)' : 'rgba(27,122,90,.10)',
                     color:      importResult.error ? C.danger : C.success }}>
            {importResult.error ? (
              `Erreur : ${importResult.error}`
            ) : (
              <>
                <div>{`${importResult.inserted} transaction(s) importée(s) · ${importResult.duplicates} doublon(s) ignoré(s) · ${importResult.total} total`}</div>
                {importResult.reconciled?.length > 0 && (
                  <div className="pt-1 border-t u-line/60">
                    <div className="font-semibold mb-1">
                      {importResult.reconciled.length} facture(s) fournisseur passée(s) en payée :
                    </div>
                    <ul className="space-y-0.5">
                      {importResult.reconciled.map(r => (
                        <li key={r.invoice_id} className="text-xs">
                          {r.supplier_name}{r.invoice_number ? ` · n° ${r.invoice_number}` : ''} — {Number(r.amount).toFixed(2)} CHF, payée le {r.paid_at}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {importResult.ambiguous > 0 && (
                  <div className="text-xs u-warn">
                    ⚠ {importResult.ambiguous} paiement(s) probable(s) mais ambigu(s) — à rapprocher à la main dans « À matcher ».
                  </div>
                )}
              </>
            )}
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
                className="px-3 py-1.5 u-pill text-xs font-medium"
                style={filter === f.key
                  ? { background: AL.black, color: 'white' }
                  : { background: 'rgba(12,12,12,.06)', color: C.muted }}>
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Sens : crédits (entrées) / débits (sorties) */}
            <div className="flex gap-1.5">
              {[
                { key: 'all',    label: 'Tout' },
                { key: 'credit', label: 'Crédits' },
                { key: 'debit',  label: 'Débits' },
              ].map(d => (
                <button key={d.key} onClick={() => setDir(d.key)}
                  className="px-3 py-1.5 u-pill text-xs font-medium"
                  style={dir === d.key
                    ? { background: 'rgba(12,12,12,.08)', color: AL.black }
                    : { background: 'rgba(12,12,12,.06)', color: C.muted }}>
                  {d.label}
                </button>
              ))}
            </div>
            <div className="relative">
              <input value={q} onChange={e => setQ(e.target.value)}
                placeholder="Rechercher (OBI, IBAN, référence…)"
                className="px-3 py-1.5 pr-7 border u-line u-pill text-sm u-surface focus:u-line focus:outline-none"
                style={{ width: 260 }} />
              {q && (
                <button onClick={() => setQ('')} title="Effacer"
                  className="absolute right-2 top-1/2 -translate-y-1/2 u-muted hover:u-ink text-sm">×</button>
              )}
            </div>
          </div>
          {!loading && (
            <span className="text-xs u-muted">
              {visible.length === stats.total
                ? `${stats.matched}/${stats.total} matchées`
                : `${visible.length} sur ${stats.total} · ${fmtCHF(sumVisible)} CHF`}
            </span>
          )}
        </div>

        {/* Liste */}
        {loading ? (
          <p className="text-sm u-muted py-12 text-center">Chargement…</p>
        ) : visible.length === 0 ? (
          <div className="u-surface u-panel border u-line p-12 text-center">
            <p className="text-sm u-muted">
              {transactions.length === 0 ? 'Aucune transaction.' : 'Aucune transaction ne correspond à cette recherche.'}
            </p>
            <p className="text-xs u-muted mt-2">
              {transactions.length === 0
                ? 'Importe un fichier CAMT.053 depuis ton e-banking.'
                : 'Modifie la recherche, le sens ou l\'onglet.'}
            </p>
          </div>
        ) : (
          <div className="u-surface u-panel border u-line overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="u-fill border-b u-line">
                  {th('booking_date', 'Date')}
                  {th('counterparty_name', 'Contrepartie')}
                  {th('description', 'Libellé')}
                  {th('amount', 'Montant', 'right')}
                  {th('matched', 'Statut')}
                </tr>
              </thead>
              <tbody>
                {visible.map(tx => {
                  const matched = !!tx.matched_to_type
                  const isCredit = parseFloat(tx.amount) > 0
                  const topScore = tx.top_score || 0
                  return (
                    <tr key={tx.id}
                      onClick={() => openTx(tx)}
                      className="border-t u-line hover:u-fill cursor-pointer">
                      <td className="px-4 py-3 u-ink tabular-nums">{fmtDate(tx.booking_date)}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium u-ink truncate" style={{ maxWidth: 260 }}>
                          {tx.counterparty_name || '—'}
                        </div>
                        {tx.counterparty_iban && <div className="text-xs u-muted truncate" style={{ maxWidth: 260 }}>{tx.counterparty_iban}</div>}
                      </td>
                      <td className="px-4 py-3 u-ink truncate" style={{ maxWidth: 320 }}>
                        {tx.description || tx.reference || '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums" style={{ color: isCredit ? C.success : C.danger }}>
                        {isCredit ? '+' : ''}{fmtCHF(tx.amount)} <span className="text-xs font-normal u-muted">{tx.currency}</span>
                      </td>
                      <td className="px-4 py-3">
                        {matched ? (
                          <span className="px-2 py-0.5 u-pill text-xs font-semibold inline-block"
                            style={{ background: 'rgba(27,122,90,.10)', color: C.success }}>
                            ✓ {TYPE_LABELS[tx.matched_to_type]}
                          </span>
                        ) : topScore >= 7 ? (
                          <span className="px-2 py-0.5 u-pill text-xs font-semibold inline-block"
                            style={{ background: 'rgba(166,99,0,.12)', color: C.warning }}>
                            Suggéré ({topScore.toFixed(0)}/10)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 u-pill text-xs font-semibold inline-block"
                            style={{ background: 'rgba(12,12,12,.06)', color: C.muted }}>
                            À matcher
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {/* Somme des lignes affichées — suit la recherche et les filtres */}
              <tfoot>
                <tr className="border-t-2 u-line u-fill">
                  <td colSpan={3} className="px-4 py-3 text-xs font-semibold u-muted uppercase tracking-wide">
                    Total{visible.length !== stats.total ? ' filtré' : ''}
                    <span className="ml-2 font-normal normal-case tracking-normal u-muted">
                      {visible.length} transaction{visible.length > 1 ? 's' : ''}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums"
                    style={{ fontSize: 15, color: sumVisible > 0 ? C.success : sumVisible < 0 ? C.danger : AL.black }}>
                    {sumVisible > 0 ? '+' : ''}{fmtCHF(sumVisible)} <span className="text-xs font-normal u-muted">CHF</span>
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </main>

      {selected && (
        <MatchDrawer tx={selected}
          suggestions={suggestions}
          onClose={() => setSelected(null)}
          onConfirm={confirmMatch}
          onUnmatch={unmatch} />
      )}
    </div>
  )
}

function MatchDrawer({ tx, suggestions, onClose, onConfirm, onUnmatch }) {
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
        <div className="fixed top-0 right-0 bottom-0 u-surface flex flex-col shadow-2xl overflow-y-auto"
          style={{ width: '100%', maxWidth: 560, animation: 'drawerSlide 0.2s ease both', fontFamily: FONT }}>

          <div className="flex items-center justify-between px-8 py-5 border-b u-line">
            <div>
              <p className="text-xs uppercase tracking-wider u-muted mb-0.5">Transaction</p>
              <h2 className="font-semibold u-ink" style={{ fontSize: 20 }}>
                {tx.counterparty_name || 'Sans contrepartie'}
              </h2>
            </div>
            <button onClick={onClose} className="w-9 h-9 flex items-center justify-center u-pill u-muted hover:u-fill" style={{ fontSize: 22 }}>×</button>
          </div>

          <div className="px-8 py-5 space-y-4 border-b u-line">
            <div className="flex justify-between items-baseline">
              <span className="text-xs uppercase tracking-wider u-muted">Montant</span>
              <span className="font-bold tabular-nums" style={{ fontSize: 24, color: isCredit ? C.success : C.danger }}>
                {isCredit ? '+' : ''}{fmtCHF(tx.amount)} <span className="text-xs font-normal u-muted">{tx.currency}</span>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="u-muted text-xs block">Date</span>{fmtDate(tx.booking_date)}</div>
              <div><span className="u-muted text-xs block">Compte</span><span className="text-xs">{tx.account_iban || '—'}</span></div>
              {tx.counterparty_iban && <div className="col-span-2"><span className="u-muted text-xs block">IBAN contrepartie</span><span className="text-xs">{tx.counterparty_iban}</span></div>}
              {tx.reference && <div className="col-span-2"><span className="u-muted text-xs block">Référence</span><span className="text-xs break-all">{tx.reference}</span></div>}
              {tx.description && <div className="col-span-2"><span className="u-muted text-xs block">Libellé</span>{tx.description}</div>}
            </div>
          </div>

          {/* Matching */}
          <div className="px-8 py-5 flex-1">
            {matched ? (
              <div>
                <p className="text-xs uppercase tracking-wider u-muted mb-2">Matchée à</p>
                <div className="u-ok-bg border u-line u-panel px-4 py-3 mb-4">
                  <p className="text-sm font-semibold u-ok">{TYPE_LABELS[tx.matched_to_type]} #{tx.matched_to_id}</p>
                  <p className="text-xs u-ok mt-1">Matché le {tx.matched_at?.slice(0, 10)}</p>
                </div>
                <button onClick={() => onUnmatch(tx)}
                  className="text-xs font-medium u-ko hover:u-ko">Annuler ce matching</button>
              </div>
            ) : (
              <>
                <p className="text-xs uppercase tracking-wider u-muted mb-3">Suggestions</p>
                {suggestions === null ? (
                  <p className="text-sm u-muted">Recherche de correspondances…</p>
                ) : suggestions.length === 0 ? (
                  <p className="text-sm u-muted">Aucune suggestion automatique. Vérifie que la facture correspondante existe.</p>
                ) : (
                  <ul className="space-y-2">
                    {suggestions.map((s, i) => {
                      const c = s.candidate
                      const name = c.supplier_name || c.client_name || c.merchant || 'Sans nom'
                      const amt = c.amount
                      return (
                        <li key={i} className="border u-line u-panel p-3 hover:u-line cursor-pointer"
                          onClick={() => onConfirm(tx, s)}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold u-muted uppercase">{TYPE_LABELS[s.type]}</span>
                            <span className="text-xs font-bold tabular-nums"
                              style={{ color: s.score >= 7 ? C.success : C.warning }}>{s.score.toFixed(0)}/10</span>
                          </div>
                          <div className="font-medium u-ink text-sm">{name}</div>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-xs u-muted">
                              {c.invoice_number ? `N° ${c.invoice_number} · ` : ''}{fmtDate(c.issue_date || c.date || c.due_date)}
                            </span>
                            <span className="text-sm font-semibold tabular-nums">{fmtCHF(amt)} CHF</span>
                          </div>
                          <div className="text-[10px] u-muted mt-1">{s.reasons?.join(' · ')}</div>
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
