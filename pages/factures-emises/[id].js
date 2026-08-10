// Page complète de facture émise — création et édition.
// Reprend l'éditeur d'offre (components/QuoteEditor) : même structure groupée,
// même rendu, mêmes calculs. La facture conserve donc le découpage par item
// jusque dans le PDF, au lieu d'être aplatie comme dans l'ancien tiroir.
//
// Routes : /factures-emises/new (création) · /factures-emises/<id> (édition)
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import { useAuth } from '../_app'
import NavBar from '../../components/NavBar'
import useIsAdmin from '../../lib/useIsAdmin'
import adminFetch from '../../lib/adminFetch'
import ContactPicker from '../../components/ContactPicker'
import SendDocumentModal from '../../components/SendDocumentModal'
import QuoteEditor, { defaultQuote } from '../../components/QuoteEditor'
import { computeQuoteTotal } from '../../lib/quoteTotals'
import { invoiceTotals } from '../../lib/invoiceTotals'
import { pdfFilename } from '../../lib/pdfFilename'

const fmtCHF = n => new Intl.NumberFormat('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10) }
const today = () => new Date().toISOString().slice(0, 10)

// Un devis « groupé » garde ses items ; un ancien format plat est repris tel quel.
function isGrouped(q) { return !!q && (Array.isArray(q.items) || Array.isArray(q.management)) }

export default function FactureEmisePage() {
  const router = useRouter()
  const { id } = router.query
  const { user } = useAuth()
  const isAdmin = useIsAdmin()
  useEffect(() => { if (user && !isAdmin) router.replace('/') }, [user, isAdmin])

  const isNew = id === 'new'
  const [invoice, setInvoice]   = useState(null)
  const [projects, setProjects] = useState([])
  const [quote, setQuote]       = useState(null)
  const [form, setForm]         = useState({
    project_id: '', client_name: '', client_address: '', currency: 'CHF',
    vat_rate: '8.1', issue_date: today(), due_date: addDays(today(), 30),
    iban_recipient: '', notes: '', status: 'created', detail_level: 'detailed',
    object: '', discount_label: '', discount_rate: '', discount_amount: '',
  })
  const [loading, setLoading] = useState(true)
  const [dirty, setDirty]     = useState(false)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [sendOpen, setSendOpen] = useState(false)
  const dueTouched = useRef(false)

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); setDirty(true) }
  // Échéance = émission + 30 j tant qu'on ne l'a pas fixée à la main
  function setIssueDate(v) {
    setForm(f => ({ ...f, issue_date: v, ...(v && !dueTouched.current ? { due_date: addDays(v, 30) } : {}) }))
    setDirty(true)
  }

  useEffect(() => {
    if (!router.isReady) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const [prj, inv] = await Promise.all([
        adminFetch('/api/projects').then(r => r.json()).catch(() => []),
        isNew ? Promise.resolve(null) : adminFetch(`/api/customer-invoices/${id}`).then(r => r.json()).catch(() => null),
      ])
      if (cancelled) return
      setProjects(Array.isArray(prj) ? prj.filter(p => p.status === 'active') : [])

      if (inv && !inv.error) {
        setInvoice(inv)
        setForm({
          project_id: inv.project_id || '', client_name: inv.client_name || '',
          client_address: inv.client_address || '', currency: inv.currency || 'CHF',
          vat_rate: inv.vat_rate ?? '8.1',
          issue_date: inv.issue_date || today(),
          due_date: inv.due_date || addDays(inv.issue_date || today(), 30),
          iban_recipient: inv.iban_recipient || '', notes: inv.notes || '',
          status: inv.status || 'created', detail_level: inv.detail_level || 'detailed',
          object: inv.object || '',
          discount_label: inv.discount_label || '',
          discount_rate: inv.discount_rate ?? '',
          discount_amount: inv.discount_amount ?? '',
        })
        setQuote(isGrouped(inv.quote_snapshot) ? inv.quote_snapshot : defaultQuote())
        dueTouched.current = true
      } else {
        // Création : pré-remplissage depuis le projet passé en ?from=
        const from = router.query.from ? String(router.query.from) : ''
        const p = (Array.isArray(prj) ? prj : []).find(x => String(x.id) === from)
        if (p) {
          setForm(f => ({ ...f, project_id: p.id, client_name: p.client || '', client_address: p.client_address || '' }))
          setQuote(isGrouped(p.quote_data) ? p.quote_data : defaultQuote())
        } else {
          setQuote(defaultQuote())
        }
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [router.isReady, id])

  // Reprend le devis d'un projet (bouton « Reprendre l'offre »)
  function pickProject(pid) {
    const p = projects.find(x => String(x.id) === String(pid))
    setForm(f => ({
      ...f, project_id: pid,
      client_name: p?.client || f.client_name,
      client_address: p?.client_address || f.client_address,
    }))
    if (p && isGrouped(p.quote_data)) setQuote(p.quote_data)
    setDirty(true)
  }

  const totals = invoiceTotals({
    subtotal: computeQuoteTotal(quote),
    discount_rate: form.discount_rate,
    discount_amount: form.discount_amount,
    vat_rate: form.vat_rate,
  })
  const { subtotal, discount, net, vat, gross } = totals

  async function save({ close = false } = {}) {
    if (!form.client_name) { setError('Le client est requis.'); return }
    setSaving(true); setError('')
    try {
      const body = {
        ...form,
        amount: gross.toFixed(2), amount_net: net.toFixed(2), vat_amount: vat.toFixed(2),
        quote_snapshot: quote,
      }
      const r = await adminFetch(isNew ? '/api/customer-invoices' : `/api/customer-invoices/${id}`, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (d.error) { setError(d.error); return }
      setDirty(false)
      if (close) router.push('/factures-emises')
      else if (isNew) router.replace(`/factures-emises/${d.id}`)
      else setInvoice(d)
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  async function downloadPdf(mode) {
    try {
      const r = await fetch(`/api/customer-invoices/${id}/pdf?mode=${mode}`)
      if (!r.ok) throw new Error(`Erreur ${r.status}`)
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = pdfFilename(mode === 'summary' ? 'facture-résumée' : 'facture-détaillée',
        invoice?.projects?.name || invoice?.client_name, invoice?.issue_date)
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (e) { alert('Téléchargement impossible : ' + e.message) }
  }

  async function remove() {
    if (!confirm('Supprimer cette facture ?')) return
    await adminFetch(`/api/customer-invoices/${id}`, { method: 'DELETE' })
    router.push('/factures-emises')
  }

  // Prévient avant de quitter avec des modifications non enregistrées
  useEffect(() => {
    if (!dirty) return
    const h = e => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  if (user && !isAdmin) return null

  const input = "w-full px-3 py-2 border border-gray-200 rounded-md text-sm bg-white focus:border-gray-400 focus:outline-none"
  const label = "block text-xs font-medium text-gray-500 mb-1.5"

  return (
    <div className="min-h-screen" style={{ background: '#fafafa' }}>
      <Head><title>{isNew ? 'Nouvelle facture' : `Facture ${invoice?.invoice_number || ''}`} — Maze Project</title></Head>
      <NavBar title={isNew ? 'Nouvelle facture' : `Facture ${invoice?.invoice_number || ''}`}>
        <Link href="/factures-emises" className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900">← Factures</Link>
        {dirty && <span className="text-xs text-amber-600 mr-2">non enregistré</span>}
        <button onClick={() => save()} disabled={saving || loading}
          className="px-4 py-2 text-sm font-medium rounded-md text-white disabled:opacity-50" style={{ background: '#111827' }}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </NavBar>

      {loading ? (
        <p className="text-sm text-gray-400 py-16 text-center">Chargement…</p>
      ) : (
        <main className="w-full px-4 md:px-10 py-6 md:py-10 space-y-6" style={{ maxWidth: 1400, margin: '0 auto' }}>

          {error && <div className="rounded-md px-4 py-3 text-sm" style={{ background: '#fee2e2', color: '#991b1b' }}>{error}</div>}

          {/* ── Destinataire ── */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
            <h2 className="font-semibold text-gray-900" style={{ fontSize: 15 }}>Destinataire</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className={label}>Projet — reprend son offre</label>
                <select className={input} value={form.project_id || ''} onChange={e => pickProject(e.target.value)}>
                  <option value="">— Aucun —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name} · {p.client}</option>)}
                </select>
                <p className="text-xs text-gray-400 mt-1">Choisir un projet recopie son offre dans l'éditeur ci-dessous.</p>
              </div>
              <div>
                <label className={label}>Objet — nom libre {form.project_id && <span className="text-gray-400">(remplace le nom du projet)</span>}</label>
                <input className={input} value={form.object} onChange={e => set('object', e.target.value)}
                  placeholder="ex. Stockage T3 2026, Acompte chantier…" />
                <p className="text-xs text-gray-400 mt-1">
                  Permet de nommer la facture sans la lier à un projet. Sans objet ni projet, la facture n'a pas d'intitulé.
                </p>
              </div>
              <div>
                <label className={label}>Depuis la base contacts</label>
                <ContactPicker onSelect={({ name, address }) => {
                  setForm(f => ({ ...f, client_name: name, client_address: address || f.client_address })); setDirty(true)
                }} />
              </div>
              <div>
                <label className={label}>Client *</label>
                <input className={input} value={form.client_name} onChange={e => set('client_name', e.target.value)} />
              </div>
              <div>
                <label className={label}>Adresse</label>
                <textarea rows={3} className={input} value={form.client_address}
                  onChange={e => set('client_address', e.target.value)}
                  placeholder="Société Sàrl&#10;Rue X 12&#10;1200 Genève" />
              </div>
            </div>
          </div>

          {/* ── Paramètres de facturation ── */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
            <h2 className="font-semibold text-gray-900" style={{ fontSize: 15 }}>Facturation</h2>
            <div className="grid md:grid-cols-4 gap-4">
              <div>
                <label className={label}>Émise le</label>
                <input type="date" className={input} value={form.issue_date} onChange={e => setIssueDate(e.target.value)} />
              </div>
              <div>
                <label className={label}>Échéance <span className="text-gray-400">(+30 j)</span></label>
                <input type="date" className={input} value={form.due_date}
                  onChange={e => { dueTouched.current = true; set('due_date', e.target.value) }} />
              </div>
              <div>
                <label className={label}>TVA</label>
                <select className={input} value={form.vat_rate} onChange={e => set('vat_rate', e.target.value)}>
                  <option value="8.1">8.1 % (normal)</option>
                  <option value="2.6">2.6 % (réduit)</option>
                  <option value="3.8">3.8 % (hébergement)</option>
                  <option value="0">0 % (exempt)</option>
                </select>
              </div>
              <div>
                <label className={label}>Devise</label>
                <select className={input} value={form.currency} onChange={e => set('currency', e.target.value)}>
                  <option>CHF</option><option>EUR</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className={label}>IBAN bénéficiaire <span className="text-gray-400">(vide = celui par défaut)</span></label>
                <input className={input} value={form.iban_recipient} onChange={e => set('iban_recipient', e.target.value)} placeholder="CH…" />
              </div>
              <div>
                <label className={label}>PDF</label>
                <div className="inline-flex rounded-md border border-gray-200 overflow-hidden text-sm w-full">
                  {[{ k: 'detailed', l: 'Détaillée' }, { k: 'summary', l: 'Résumée' }].map(o => (
                    <button key={o.k} type="button" onClick={() => set('detail_level', o.k)} className="flex-1 px-3 py-1.5 font-medium"
                      style={form.detail_level === o.k ? { background: '#111827', color: '#fff' } : { background: '#fff', color: '#6b7280' }}>
                      {o.l}
                    </button>
                  ))}
                </div>
              </div>
              {!isNew && (
                <div>
                  <label className={label}>Statut</label>
                  <select className={input} value={form.status} onChange={e => set('status', e.target.value)}>
                    <option value="created">Créée</option>
                    <option value="sent">Envoyée</option>
                    <option value="pending">En attente</option>
                    <option value="paid">Payée</option>
                    <option value="cancelled">Annulée</option>
                  </select>
                </div>
              )}
              <div className="md:col-span-4">
                <label className={label}>Notes</label>
                <textarea rows={2} className={input} value={form.notes} onChange={e => set('notes', e.target.value)} />
              </div>
            </div>
          </div>

          {/* ── Positions : le même éditeur que l'offre ── */}
          <div className="space-y-6">
            <QuoteEditor value={quote} onChange={q => { setQuote(q); setDirty(true) }} />
          </div>

          {/* ── Escompte sur toute la facture ── */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
            <h2 className="font-semibold text-gray-900" style={{ fontSize: 15 }}>Escompte sur la facture</h2>
            <div className="grid md:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <label className={label}>Libellé <span className="text-gray-400">(imprimé sur le PDF)</span></label>
                <input className={input} value={form.discount_label} onChange={e => set('discount_label', e.target.value)}
                  placeholder="ex. Remise commerciale, Geste client…" />
              </div>
              <div>
                <label className={label}>Pourcentage</label>
                <input type="number" step="0.1" min="0" className={input + ' text-right tabular-nums'}
                  value={form.discount_rate} onChange={e => set('discount_rate', e.target.value)} placeholder="0" />
              </div>
              <div>
                <label className={label}>Montant fixe ({form.currency})</label>
                <input type="number" step="0.01" min="0" className={input + ' text-right tabular-nums'}
                  value={form.discount_amount} onChange={e => set('discount_amount', e.target.value)} placeholder="0" />
              </div>
            </div>
            <p className="text-xs text-gray-400">
              S'applique au sous-total HT, avant TVA. Les deux se cumulent : le pourcentage d'abord, puis le montant fixe.
            </p>
          </div>

          {/* ── Récapitulatif TVA ── */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            {discount > 0 && (
              <>
                <div className="flex justify-between text-sm text-gray-600 mb-1">
                  <span>Sous-total HT</span><span className="tabular-nums font-medium">{fmtCHF(subtotal)} {form.currency}</span>
                </div>
                <div className="flex justify-between text-sm mb-1" style={{ color: '#b91c1c' }}>
                  <span>{form.discount_label || (form.discount_rate ? `Escompte ${form.discount_rate} %` : 'Escompte')}</span>
                  <span className="tabular-nums font-medium">− {fmtCHF(discount)} {form.currency}</span>
                </div>
              </>
            )}
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>{discount > 0 ? 'Net HT' : 'Total HT'}</span><span className="tabular-nums font-medium">{fmtCHF(net)} {form.currency}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600 mb-2">
              <span>TVA {form.vat_rate} %</span><span className="tabular-nums font-medium">{fmtCHF(vat)} {form.currency}</span>
            </div>
            <div className="flex justify-between items-baseline pt-2 border-t border-gray-100">
              <span className="text-sm font-semibold text-gray-700">Total TTC</span>
              <span className="font-bold tabular-nums text-gray-900" style={{ fontSize: 22 }}>{fmtCHF(gross)} {form.currency}</span>
            </div>
          </div>

          {/* ── Actions ── */}
          <div className="flex items-center justify-between gap-3 flex-wrap pb-10">
            <div className="flex gap-2">
              {!isNew && (
                <>
                  <button onClick={() => downloadPdf('detailed')} disabled={dirty}
                    title={dirty ? 'Enregistre d\'abord pour inclure les dernières modifications' : 'PDF détaillé avec QR-bill'}
                    className="px-4 py-2 rounded-md text-sm font-medium border border-gray-300 text-gray-700 hover:border-gray-400 disabled:opacity-40">
                    PDF détaillé
                  </button>
                  <button onClick={() => downloadPdf('summary')} disabled={dirty}
                    className="px-4 py-2 rounded-md text-sm font-medium border border-gray-300 text-gray-700 hover:border-gray-400 disabled:opacity-40">
                    PDF résumé
                  </button>
                  <button onClick={() => setSendOpen(true)} disabled={dirty}
                    className="px-4 py-2 rounded-md text-sm font-medium border border-gray-300 text-gray-700 hover:border-gray-400 disabled:opacity-40">
                    Envoyer par e-mail
                  </button>
                </>
              )}
            </div>
            <div className="flex gap-2">
              {!isNew && <button onClick={remove} className="px-4 py-2 text-sm font-medium text-red-500 hover:text-red-700">Supprimer</button>}
              <button onClick={() => save({ close: true })} disabled={saving}
                className="px-5 py-2 rounded-md text-white font-medium text-sm disabled:opacity-50" style={{ background: '#111827' }}>
                {saving ? 'Enregistrement…' : 'Enregistrer et fermer'}
              </button>
            </div>
          </div>
        </main>
      )}

      {sendOpen && (
        <SendDocumentModal type="facture" docId={id} number={invoice?.invoice_number}
          projectName={invoice?.projects?.name} onClose={() => setSendOpen(false)} onSent={() => setSendOpen(false)} />
      )}
    </div>
  )
}
