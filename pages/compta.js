import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { useAuth } from './_app'
import NavBar from '../components/NavBar'
import useIsAdmin from '../lib/useIsAdmin'
import adminFetch from '../lib/adminFetch'

const PINK = '#111827'

function fmtCHF(n) {
  return new Intl.NumberFormat('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)
}

export default function Compta() {
  const router = useRouter()
  const { user } = useAuth()
  const isAdmin = useIsAdmin()
  useEffect(() => { if (user && !isAdmin) router.replace('/') }, [user, isAdmin])
  if (user && !isAdmin) return null
  const todayStr = new Date().toISOString().slice(0, 10)
  const yearStart = `${new Date().getFullYear()}-01-01`
  const [from, setFrom] = useState(yearStart)
  const [to, setTo]     = useState(todayStr)
  const [mode, setMode] = useState('all')   // all | paid
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)

  async function loadPreview() {
    setLoading(true)
    try {
      const [c, s, e] = await Promise.all([
        adminFetch(`/api/customer-invoices?year=${from.slice(0, 4)}`).then(r => r.json()),
        adminFetch(`/api/supplier-invoices?year=${from.slice(0, 4)}`).then(r => r.json()),
        adminFetch(`/api/expenses?userName=Guillaume&year=${from.slice(0, 4)}`).then(r => r.json()),
      ])
      const filter = (rows, key) => (Array.isArray(rows) ? rows : []).filter(r => {
        const d = r[key]
        return d >= from && d <= to && (mode !== 'paid' || r.status === 'paid' || key === 'date')
      })
      const recettes = filter(c, 'issue_date').reduce((sum, r) => sum + parseFloat(r.amount || 0), 0)
      const depenses_f = filter(s, 'issue_date').reduce((sum, r) => sum + parseFloat(r.amount || 0), 0)
      const frais     = filter(e, 'date').reduce((sum, r) => sum + parseFloat(r.amount || 0), 0)
      setPreview({
        recettes,
        depenses: depenses_f + frais,
        balance: recettes - depenses_f - frais,
        countRec: filter(c, 'issue_date').length,
        countDep: filter(s, 'issue_date').length + filter(e, 'date').length,
      })
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadPreview() }, [from, to, mode])

  function download() {
    const url = `/api/compta/export?from=${from}&to=${to}&mode=${mode}`
    window.open(url, '_blank')
  }

  function setRange(preset) {
    const now = new Date()
    if (preset === 'thisMonth') {
      setFrom(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`)
      setTo(todayStr)
    } else if (preset === 'lastMonth') {
      const m = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const last = new Date(now.getFullYear(), now.getMonth(), 0)
      setFrom(m.toISOString().slice(0, 10))
      setTo(last.toISOString().slice(0, 10))
    } else if (preset === 'thisQuarter') {
      const q = Math.floor(now.getMonth() / 3)
      setFrom(`${now.getFullYear()}-${String(q * 3 + 1).padStart(2, '0')}-01`)
      setTo(todayStr)
    } else if (preset === 'thisYear') {
      setFrom(`${now.getFullYear()}-01-01`)
      setTo(todayStr)
    } else if (preset === 'lastYear') {
      setFrom(`${now.getFullYear() - 1}-01-01`)
      setTo(`${now.getFullYear() - 1}-12-31`)
    }
  }

  return (
    <div className="min-h-screen" style={{ background: '#fafafa' }}>
      <Head><title>Maze Project — Compta</title></Head>
      <NavBar title="Comptabilité" />

      <main className="w-full px-4 md:px-10 py-6 md:py-10 space-y-6" style={{ maxWidth: 1200, margin: '0 auto' }}>

        <div className="bg-white rounded-2xl border border-gray-200 p-5 md:p-6">
          <h2 className="font-semibold text-gray-900 mb-4" style={{ fontSize: 16 }}>Export pour la fiduciaire</h2>

          {/* Période */}
          <div className="space-y-3 mb-5">
            <div className="flex flex-wrap gap-1.5">
              {[
                ['thisMonth',   'Mois en cours'],
                ['lastMonth',   'Mois dernier'],
                ['thisQuarter', 'Trimestre'],
                ['thisYear',    'Année en cours'],
                ['lastYear',    'Année dernière'],
              ].map(([k, label]) => (
                <button key={k} onClick={() => setRange(k)}
                  className="px-3 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200">
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-md text-sm bg-white" />
              <span className="text-xs text-gray-400">au</span>
              <input type="date" value={to} onChange={e => setTo(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-md text-sm bg-white" />
            </div>
          </div>

          {/* Mode */}
          <div className="mb-5">
            <p className="text-xs font-medium text-gray-500 mb-2">Inclure</p>
            <div className="flex gap-1.5">
              <button onClick={() => setMode('all')}
                className="px-3 py-1.5 rounded-md text-xs font-medium"
                style={mode === 'all' ? { background: '#111827', color: 'white' } : { background: '#f3f4f6', color: '#6b7280' }}>
                Toutes les factures (engagement)
              </button>
              <button onClick={() => setMode('paid')}
                className="px-3 py-1.5 rounded-md text-xs font-medium"
                style={mode === 'paid' ? { background: '#111827', color: 'white' } : { background: '#f3f4f6', color: '#6b7280' }}>
                Payées uniquement (trésorerie)
              </button>
            </div>
          </div>

          {/* Aperçu */}
          {preview && (
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <div className="text-xs text-green-700 mb-1">Recettes ({preview.countRec})</div>
                <div className="font-bold tabular-nums text-green-900" style={{ fontSize: 20 }}>{fmtCHF(preview.recettes)}</div>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <div className="text-xs text-red-700 mb-1">Dépenses ({preview.countDep})</div>
                <div className="font-bold tabular-nums text-red-900" style={{ fontSize: 20 }}>{fmtCHF(preview.depenses)}</div>
              </div>
              <div className="rounded-lg p-3 border"
                style={{ background: preview.balance >= 0 ? '#f0fdf4' : '#fef2f2',
                         borderColor: preview.balance >= 0 ? '#bbf7d0' : '#fecaca' }}>
                <div className="text-xs mb-1" style={{ color: preview.balance >= 0 ? '#166534' : '#991b1b' }}>Balance</div>
                <div className="font-bold tabular-nums" style={{ fontSize: 20, color: preview.balance >= 0 ? '#14532d' : '#7f1d1d' }}>
                  {preview.balance >= 0 ? '+' : ''}{fmtCHF(preview.balance)}
                </div>
              </div>
            </div>
          )}

          <button onClick={download}
            className="w-full px-4 py-2.5 rounded-md text-sm font-medium text-white"
            style={{ background: PINK }}>
            📥 Télécharger le CSV
          </button>
          <p className="text-xs text-gray-400 mt-2 text-center">
            Format CSV compatible Excel (séparateur ;). Une ligne par facture/frais + totaux en bas.
          </p>
        </div>
      </main>
    </div>
  )
}
