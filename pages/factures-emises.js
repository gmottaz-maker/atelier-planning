import { useState, useEffect, useRef } from 'react'
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
import { invoiceCopyBody } from '../lib/duplicateDoc'
import { fmtCHF as fmtMontant } from '../lib/money'

const PINK = '#111827'
const STATUS_LABELS = { created: 'Créée', sent: 'Envoyée', pending: 'En attente', paid: 'Payée', overdue: 'En retard', cancelled: 'Annulée' }
const STATUS_COLORS = { created: '#6b7280', sent: '#1d4ed8', pending: '#f59e0b', paid: '#22c55e', overdue: '#dc2626', cancelled: '#9ca3af' }

function fmtCHF(n) {
  if (n == null) return '—'
  return fmtMontant(n)
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
  const [pdfBusy, setPdfBusy] = useState(null)   // `${id}:${mode}` en cours de génération

  // ?from=projectId (ancien lien) → page complète de création pré-remplie
  useEffect(() => {
    if (router.query.from) router.replace(`/factures-emises/new?from=${router.query.from}`)
  }, [router.query.from])

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
    // Verrou par bouton seulement : le serveur sérialise déjà les rendus
    // (lib/htmlToPdf), inutile de bloquer toute la liste — sinon on ne peut plus
    // rien télécharger tant qu'une génération est en cours.
    const key = `${inv.id}:${mode}`
    if (pdfBusy === key) return
    setPdfBusy(key)
    // Garde-fou : une requête qui resterait suspendue laisserait le bouton
    // bloqué indéfiniment.
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 90000)
    try {
      const r = await fetch(`/api/customer-invoices/${inv.id}/pdf?mode=${mode}`, { signal: ctrl.signal })
      if (!r.ok) {
        let msg = `Erreur ${r.status}`
        try { const j = await r.json(); if (j.error) msg = j.error } catch (_) {}
        throw new Error(msg)
      }
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = pdfFilename(mode === 'summary' ? 'facture-résumée' : 'facture-détaillée', inv.projects?.name || inv.object || inv.client_name)
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (e) {
      alert(e.name === 'AbortError'
        ? 'La génération du PDF a pris trop de temps. Réessaie dans un instant.'
        : 'Téléchargement impossible : ' + e.message)
    }
    finally { clearTimeout(timer); setPdfBusy(null) }
  }
  // Duplique une facture : nouveau numéro, dates du jour, statut « créée ».
  async function duplicate(inv) {
    if (!confirm(`Dupliquer la facture ${inv.invoice_number} ?\n\nUne nouvelle facture sera créée avec le même contenu, un nouveau numéro et la date du jour.`)) return
    try {
      const r = await adminFetch('/api/customer-invoices', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invoiceCopyBody(inv)),
      })
      const d = await r.json()
      if (d.error) throw new Error(d.error)
      router.push(`/factures-emises/${d.id}`)
    } catch (e) { alert('Duplication impossible : ' + e.message) }
  }

  // Mise à jour d'une facture depuis la liste (statut, dates) — optimiste, avec
  // resynchronisation seulement en cas d'échec.
  async function patchInvoice(inv, patch) {
    setInvoices(prev => prev.map(x => x.id === inv.id ? { ...x, ...patch } : x))
    try {
      const r = await adminFetch(`/api/customer-invoices/${inv.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      })
      const d = await r.json()
      if (d.error) throw new Error(d.error)
    } catch (e) {
      alert('Enregistrement impossible : ' + e.message)
      load()
    }
  }

  // Changer le statut renseigne la date correspondante si elle manque, pour ne
  // pas avoir à la saisir à la main dans le cas courant.
  function changeStatus(inv, status) {
    const patch = { status }
    const now = new Date().toISOString().slice(0, 10)
    if (status === 'sent' && !inv.sent_at) patch.sent_at = now
    if (status === 'paid' && !inv.paid_at) patch.paid_at = now
    patchInvoice(inv, patch)
  }

  // La date affichée suit le statut : date de paiement si payée, sinon d'envoi.
  const dateFieldOf = inv => (inv.status === 'paid' ? 'paid_at' : 'sent_at')
  const [sendDoc, setSendDoc] = useState(null)
  function openSend(inv) {
    const proj = projects.find(p => String(p.id) === String(inv.project_id))
    setSendDoc({ type: 'facture', docId: inv.id, contactId: proj?.client_contact_id, projectName: proj?.name || inv.object || inv.client_name, number: inv.invoice_number })
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
        <button onClick={() => router.push('/factures-emises/new')}
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
                      onClick={() => router.push(`/factures-emises/${inv.id}`)}>
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">{inv.invoice_number}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{inv.client_name}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs truncate" style={{ maxWidth: 200 }}>{inv.projects?.name || inv.object || '—'}</td>
                      <td className="px-4 py-3 text-gray-600 tabular-nums">{fmtDate(inv.issue_date)}</td>
                      <td className="px-4 py-3 text-gray-600 tabular-nums">{fmtDate(inv.due_date)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">
                        {fmtCHF(inv.amount)} <span className="text-xs font-normal text-gray-400">{inv.currency}</span>
                      </td>
                      {/* Statut modifiable + date correspondante (envoi, ou paiement si payée) */}
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <select value={inv.status || 'created'} onChange={e => changeStatus(inv, e.target.value)}
                            title="Changer le statut"
                            className="text-xs font-semibold rounded-full border px-2 py-1 cursor-pointer focus:outline-none focus:ring-1 focus:ring-gray-300"
                            style={{ background: STATUS_COLORS[st] + '18', color: STATUS_COLORS[st], borderColor: STATUS_COLORS[st] + '40' }}>
                            {['created', 'sent', 'pending', 'paid', 'cancelled'].map(k => (
                              <option key={k} value={k} style={{ color: '#111827', background: '#fff' }}>{STATUS_LABELS[k]}</option>
                            ))}
                          </select>
                          <input type="date"
                            value={inv[dateFieldOf(inv)] ? String(inv[dateFieldOf(inv)]).slice(0, 10) : ''}
                            onChange={e => patchInvoice(inv, { [dateFieldOf(inv)]: e.target.value || null })}
                            title={inv.status === 'paid' ? 'Date de paiement' : 'Date d\'envoi'}
                            className="text-xs text-gray-500 rounded-md border border-gray-200 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-gray-300"
                            style={{ width: 124 }} />
                        </div>
                      </td>
                      {/* Actions : trois boutons de même gabarit */}
                      <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-2 justify-end whitespace-nowrap">
                          {[
                            { label: 'Détaillée', title: 'Télécharger le PDF détaillé (avec QR-bill)', icon: '⤓', busy: pdfBusy === `${inv.id}:detailed`, act: () => downloadPdf(inv, 'detailed') },
                            { label: 'Résumée',   title: 'Télécharger le PDF résumé (avec QR-bill)',   icon: '⤓', busy: pdfBusy === `${inv.id}:summary`,  act: () => downloadPdf(inv, 'summary') },
                            { label: 'Envoyer',   title: 'Envoyer la facture par e-mail',              icon: '✉', act: () => openSend(inv) },
                            { label: 'Dupliquer', title: 'Créer une nouvelle facture avec le même contenu', icon: '⧉', act: () => duplicate(inv) },
                          ].map(b => (
                            <button key={b.label} title={b.title} onClick={b.act}
                              disabled={!!b.busy}
                              className="inline-flex items-center justify-center gap-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:border-gray-500 hover:text-gray-900 disabled:opacity-50 disabled:cursor-wait"
                              style={{ width: 104, padding: '6px 0' }}>
                              {b.busy
                                ? <><span className="inline-block w-3 h-3 rounded-full border-2 animate-spin" style={{ borderColor: '#d1d5db', borderTopColor: '#111827' }} />Génération…</>
                                : <><span style={{ fontSize: 13 }}>{b.icon}</span>{b.label}</>}
                            </button>
                          ))}
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

      {sendDoc && (
        <SendDocumentModal
          type={sendDoc.type} docId={sendDoc.docId} mode={sendDoc.mode}
          contactId={sendDoc.contactId} projectName={sendDoc.projectName} number={sendDoc.number}
          onClose={() => setSendDoc(null)} onSent={() => load()} />
      )}
    </div>
  )
}
