// Les frais — déposer un ticket, le faire lire, le ranger.
//
// Ils vivaient dans `/schedule`, sous les congés. Ils n'ont rien à y faire :
// un reçu de parking n'est pas une demi-journée de vacances, et la page
// devenait deux écrans cousus. Ils ont désormais le leur.
//
// ── Pourquoi ce n'est PAS un écran d'admin ─────────────────────────────────
//
// `/justificatifs` montre les mêmes frais, mais il est réservé à l'admin :
// c'est l'écran de celui qui classe, rapproche et exporte. Ici, c'est celui
// qui dépense. Chacun ne voit et n'écrit que les siens — le serveur le lui
// impose, quel que soit le nom envoyé (`/api/expenses`, `ownName`). Sans cet
// écran, un membre n'aurait aucune façon de rendre un ticket.
//
// Ce qui est déposé ici part dans le journal comptable, le rapprochement
// bancaire et l'export : ce n'est pas un pense-bête, c'est une pièce.
import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { AL, C, FONT, R } from '../lib/theme'
import StatCard from './StatCard'

export const EXPENSE_CATEGORIES = [
  { key: 'Repas',       icon: '\u{1F37D}',  color: C.warning },
  { key: 'Transport',   icon: '\u{1F697}',  color: C.info },
  { key: 'H\u00e9bergement', icon: '\u{1F3E8}',  color: C.violet },
  { key: 'Fournitures', icon: '\u{1F6D2}',  color: C.success },
  { key: 'Mat\u00e9riel',    icon: '\u{1F527}',  color: C.muted },
  { key: 'Autre',       icon: '\u{1F4CB}',  color: C.muted },
]
const CURRENCIES = ['CHF', 'EUR', 'USD']
const MOIS = ['Janvier','F\u00e9vrier','Mars','Avril','Mai','Juin','Juillet','Ao\u00fbt','Septembre','Octobre','Novembre','D\u00e9cembre']

const dateStr = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Source d'affichage d'un re\u00e7u : URL sign\u00e9e Supabase (anciens frais) ou fichier
// kDrive (nouveaux frais, class\u00e9s par trimestre).
function receiptSrc(exp) {
  if (!exp) return null
  if (exp.receipt_url) return exp.receipt_url
  if (exp.kdrive_file_id) return `/api/kdrive/download?fileId=${exp.kdrive_file_id}`
  return null
}

async function apiFetch(path, options = {}) {
  const r = await fetch(path, options)
  if (!r.ok) {
    let msg = `Erreur ${r.status}`
    try { const j = await r.json(); msg = j.error || msg } catch (_) {}
    throw new Error(msg)
  }
  return r.json()
}

/**
 * Le panneau complet : les totaux, la liste, et le tiroir de saisie.
 *
 * `userName` vient de la page — soi-m\u00eame, ou le coll\u00e8gue choisi par l'admin.
 * Le serveur ram\u00e8ne de toute fa\u00e7on un membre \u00e0 son propre nom ; ce param\u00e8tre
 * ne donne aucun droit, il choisit un affichage.
 */
export default function FraisPanel({ userName, year }) {
  const cle = userName ? `/api/expenses?userName=${encodeURIComponent(userName)}&year=${year}` : null
  const { data: expenses = [], mutate } = useSWR(cle)

  const VIDE = { date: dateStr(new Date()), amount: '', currency: 'CHF', category: 'Autre', merchant: '', description: '', payment_method: 'company' }
  const [modal, setModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(VIDE)
  const [receiptB64, setReceiptB64] = useState(null)
  const [receiptMime, setReceiptMime] = useState(null)
  const [receiptPreview, setReceiptPreview] = useState(null)
  const [scanLoading, setScanLoading] = useState(false)
  const [scanError, setScanError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  function openAdd() {
    setEditId(null)
    setForm({ ...VIDE, date: dateStr(new Date()) })
    setReceiptB64(null); setReceiptMime(null); setReceiptPreview(null)
    setScanError(''); setSaveError('')
    setModal(true)
  }

  function openEdit(exp) {
    setEditId(exp.id)
    setForm({
      date: exp.date, amount: exp.amount ?? '', currency: exp.currency || 'CHF',
      category: exp.category || 'Autre', merchant: exp.merchant || '',
      description: exp.description || '', payment_method: exp.payment_method || 'personal',
    })
    setReceiptB64(null); setReceiptMime(null)
    setReceiptPreview(receiptSrc(exp))
    setScanError(''); setSaveError('')
    setModal(true)
  }

  function handleReceiptFile(file) {
    if (!file) return
    setReceiptMime(file.type || 'image/jpeg')
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target.result
      setReceiptPreview(dataUrl)
      setReceiptB64(dataUrl.split(',')[1])
    }
    reader.readAsDataURL(file)
  }

  async function scanReceipt() {
    if (!receiptB64) return
    setScanLoading(true); setScanError('')
    try {
      const result = await apiFetch('/api/expenses/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: receiptB64, mimeType: receiptMime }),
      })
      if (result.error) { setScanError(result.error); return }
      // L'API rend une liste (un document peut porter plusieurs re\u00e7us) ; ici on
      // saisit un frais \u00e0 la fois, donc on prend le premier.
      const rec = Array.isArray(result.receipts) ? result.receipts[0] : result
      if (!rec) { setScanError('Aucun re\u00e7u d\u00e9tect\u00e9 sur cette image.'); return }
      setForm(f => ({
        ...f,
        date:     rec.date     || f.date,
        amount:   rec.amount   != null ? String(rec.amount) : f.amount,
        currency: rec.currency || f.currency,
        merchant: rec.merchant || f.merchant,
        category: rec.category || f.category,
      }))
    } catch (e) { setScanError(e.message) }
    finally { setScanLoading(false) }
  }

  async function save() {
    if (!form.date) return
    setSaving(true); setSaveError('')
    try {
      // Modification = suppression puis recr\u00e9ation. C'est le comportement
      // d'origine ; le re\u00e7u suit parce qu'il est renvoy\u00e9 avec le formulaire.
      if (editId) {
        await apiFetch(`/api/expenses?id=${editId}&userName=${encodeURIComponent(userName)}`, { method: 'DELETE' })
      }
      await apiFetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userName,
          date:            form.date,
          amount:          form.amount !== '' ? parseFloat(form.amount) : null,
          currency:        form.currency,
          category:        form.category,
          merchant:        form.merchant || null,
          description:     form.description || null,
          receiptBase64:   receiptB64 || null,
          receiptMimeType: receiptMime || null,
          payment_method:  form.payment_method || 'personal',
        }),
      })
      await mutate()
      setModal(false)
    } catch (e) { setSaveError(e.message) }
    finally { setSaving(false) }
  }

  async function supprimer(id) {
    if (!confirm('Supprimer ce frais ?')) return
    try {
      await apiFetch(`/api/expenses?id=${id}&userName=${encodeURIComponent(userName)}`, { method: 'DELETE' })
      await mutate()
      setModal(false)
    } catch (e) { console.error(e) }
  }

  const maintenant = new Date()
  const moisAffiche = maintenant.getMonth()
  const total = expenses.reduce((s, e) => s + (e.amount || 0), 0)
  const duMois = expenses
    .filter(e => { const d = new Date(e.date); return d.getMonth() === moisAffiche && d.getFullYear() === year })
    .reduce((s, e) => s + (e.amount || 0), 0)

  return (
    <>
      <style>{`
        .sch-ink   { color: ${AL.black}; }
        .sch-muted { color: ${C.muted}; }
        .sch-ko    { color: ${C.danger}; }
        .sch-line  { border-color: ${C.border}; }
        .sch-fill  { background: ${C.neutralBg}; }
      `}</style>

      <div className="flex justify-between items-baseline mb-5 flex-wrap gap-3">
        <p className="text-sm sch-muted">{year} \u00b7 {expenses.length} note{expenses.length > 1 ? 's' : ''}</p>
        <button onClick={openAdd} className="u-tactile px-4 py-2 u-pill text-sm font-medium text-white" style={{ background: AL.black }}>
          + Ajouter un frais
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard label={`Total ${year}`} value={`${total.toFixed(2)} CHF`} sub={`${expenses.length} frais`} />
        <StatCard label={MOIS[moisAffiche]} value={`${duMois.toFixed(2)} CHF`}
          sub={`${expenses.filter(e => { const d = new Date(e.date); return d.getMonth() === moisAffiche && d.getFullYear() === year }).length} frais`} />
        {EXPENSE_CATEGORIES.map(cat => {
          const t = expenses.filter(e => e.category === cat.key).reduce((s, e) => s + (e.amount || 0), 0)
          if (t === 0) return null
          return <StatCard key={cat.key} label={cat.key} value={`${t.toFixed(2)} CHF`}
            sub={`${expenses.filter(e => e.category === cat.key).length} frais`} color={cat.color} />
        })}
      </div>

      {expenses.length === 0 ? (
        <div className="bg-white u-panel border sch-line p-12 text-center">
          <p className="sch-muted text-sm">Aucun frais enregistr\u00e9 pour {year}</p>
          <button onClick={openAdd} className="u-tactile mt-4 px-4 py-2 u-pill text-sm font-medium text-white" style={{ background: AL.black }}>
            Ajouter mon premier frais
          </button>
        </div>
      ) : (
        <div className="bg-white u-panel border sch-line overflow-hidden">
          {expenses.map((exp, i) => {
            const cat = EXPENSE_CATEGORIES.find(c => c.key === exp.category) || EXPENSE_CATEGORIES[5]
            const src = receiptSrc(exp)
            return (
              <div key={exp.id}
                className="u-tactile flex items-center gap-3 px-4 py-3 cursor-pointer hover:sch-fill transition-colors"
                style={{ borderBottom: i < expenses.length - 1 ? `1px solid ${C.border}` : 'none' }}
                onClick={() => openEdit(exp)}>
                <div className="w-10 h-10 u-panel flex-shrink-0 overflow-hidden flex items-center justify-center"
                  style={{ background: src ? C.neutralBg : `${cat.color}18`, fontSize: src ? 10 : 20 }}>
                  {src
                    ? <img src={src} alt="re\u00e7u" className="w-full h-full object-cover" onError={e => { e.target.style.display = 'none' }} />
                    : cat.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold sch-ink truncate">{exp.merchant || exp.category}</p>
                  <p className="text-xs sch-muted">
                    {new Date(exp.date + 'T12:00:00').toLocaleDateString('fr-CH', { day: 'numeric', month: 'short' })}
                    {' \u00b7 '}<span style={{ color: cat.color }}>{cat.icon} {exp.category}</span>
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold sch-ink">{exp.amount != null ? `${parseFloat(exp.amount).toFixed(2)}` : '\u2014'}</p>
                  <p className="text-xs sch-muted">{exp.currency}</p>
                </div>
                <svg className="w-4 h-4 sch-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            )
          })}
        </div>
      )}

      {modal && (
        <ExpenseDrawer
          editId={editId} form={form} setForm={setForm}
          receiptPreview={receiptPreview} receiptB64={receiptB64}
          onReceiptFile={handleReceiptFile} onScan={scanReceipt}
          scanLoading={scanLoading} scanError={scanError}
          saving={saving} saveError={saveError}
          onSave={save} onDelete={supprimer}
          onClose={() => !saving && setModal(false)}
        />
      )}
    </>
  )
}

function ExpenseDrawer({ editId, form, setForm, receiptPreview, receiptB64, onReceiptFile, onScan, scanLoading, scanError, saving, saveError, onSave, onDelete, onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && !saving) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  const inputCls = "w-full px-3 py-2 border sch-line u-pill text-sm bg-white focus:sch-line focus:outline-none transition-colors"
  // Rayon panneau (15px) pour les champs multilignes : à 999px les deux coins
  // se rejoignent et le champ devient une ellipse. Dérivé, pour ne pas diverger.
  const textareaCls = inputCls.replace('u-pill', 'u-panel')

  return (
    <>
      <style>{`
        @keyframes drawerSlide { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes drawerFade  { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
      <div className="fixed inset-0 z-50"
        style={{ background: 'rgba(15, 23, 42, 0.35)', animation: 'drawerFade 0.15s ease-out both' }}
        onClick={e => e.target === e.currentTarget && onClose()}>
        <div
          className="fixed top-0 right-0 bottom-0 bg-white flex flex-col shadow-2xl"
          style={{
            width: '100%',
            maxWidth: 520,
            animation: 'drawerSlide 0.2s cubic-bezier(0.4, 0, 0.2, 1) both',
            fontFamily: FONT,
          }}>
          {/* Header */}
          <div className="flex items-center justify-between px-8 py-5 border-b sch-line">
            <div>
              <p className="text-xs uppercase tracking-wider sch-muted mb-0.5">{editId ? 'Modifier' : 'Nouveau frais'}</p>
              <h2 className="font-semibold sch-ink tracking-tight" style={{ fontSize: 20 }}>
                {editId ? (form.merchant || 'Frais') : 'Ajouter un frais'}
              </h2>
            </div>
            <button onClick={onClose}
              className="w-9 h-9 flex items-center justify-center u-pill sch-muted hover:sch-fill hover:sch-ink transition-colors"
              style={{ fontSize: 22 }}>
              ×
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5">
            {/* Receipt */}
            <div>
              <label className="block text-xs font-medium sch-muted mb-1.5">Photo du reçu</label>
              <label
                className="block w-full u-pill border border-dashed cursor-pointer overflow-hidden transition-colors"
                style={{ borderColor: receiptPreview ? C.successBg : C.border, background: receiptPreview ? C.successBg : C.surface, minHeight: 84 }}
                onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = AL.black }}
                onDragLeave={e => { e.currentTarget.style.borderColor = receiptPreview ? C.successBg : C.border }}
                onDrop={e => {
                  e.preventDefault()
                  e.currentTarget.style.borderColor = receiptPreview ? C.successBg : C.border
                  const file = e.dataTransfer.files?.[0]
                  if (file && file.type.startsWith('image/')) onReceiptFile(file)
                }}>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={e => onReceiptFile(e.target.files?.[0])}
                />
                {receiptPreview ? (
                  <div className="flex items-center gap-3 p-3">
                    <img src={receiptPreview} alt="reçu" className="w-16 h-16 object-cover u-pill flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold" style={{ color: C.success }}>Reçu attaché</p>
                      <p className="text-xs sch-muted mt-0.5">Cliquer pour changer</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-6 gap-1">
                    <p className="text-sm sch-ink font-medium">Glisser une image ou <span className="sch-ink underline">parcourir</span></p>
                    <p className="text-xs sch-muted">JPG / PNG / HEIC</p>
                  </div>
                )}
              </label>

              {receiptPreview && receiptB64 && (
                <button
                  onClick={onScan}
                  disabled={scanLoading}
                  className="mt-3 w-full py-2 u-pill text-sm font-medium border transition-colors"
                  style={{
                    background: scanLoading ? C.neutralBg : 'white',
                    color: scanLoading ? C.muted : AL.black,
                    borderColor: 'rgba(12,12,12,.08)',
                  }}>
                  {scanLoading ? 'Analyse en cours…' : 'Scanner avec l\'IA'}
                </button>
              )}
              {scanError && (
                <p className="mt-2 text-xs sch-warn">{scanError}</p>
              )}
            </div>

            {/* Date + Montant */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium sch-muted mb-1.5">Date</label>
                <input type="date" value={form.date} onChange={e => setForm(f=>({...f,date:e.target.value}))}
                  className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium sch-muted mb-1.5">Montant</label>
                <div className="flex gap-2">
                  <input type="number" step="0.01" min="0" placeholder="0.00" value={form.amount}
                    onChange={e => setForm(f=>({...f,amount:e.target.value}))}
                    className={`${inputCls} flex-1`} />
                  <select value={form.currency} onChange={e => setForm(f=>({...f,currency:e.target.value}))}
                    className={inputCls} style={{ width: 80 }}>
                    {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Commerçant */}
            <div>
              <label className="block text-xs font-medium sch-muted mb-1.5">Commerçant</label>
              <input type="text" placeholder="Ex : Migros, SBB, Hôtel Ibis…" value={form.merchant}
                onChange={e => setForm(f=>({...f,merchant:e.target.value}))}
                className={inputCls} />
            </div>

            {/* Catégorie */}
            <div>
              <label className="block text-xs font-medium sch-muted mb-2">Catégorie</label>
              <div className="grid grid-cols-3 gap-2">
                {EXPENSE_CATEGORIES.map(cat => {
                  const active = form.category === cat.key
                  return (
                    <button
                      key={cat.key}
                      type="button"
                      onClick={() => setForm(f=>({...f,category:cat.key}))}
                      className="py-2.5 u-pill text-sm font-medium transition-colors border"
                      style={active
                        ? { borderColor: cat.color, background: cat.color + '14', color: cat.color }
                        : { borderColor: C.border, background: 'white', color: C.muted }
                      }>
                      {cat.key}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Mode de paiement */}
            <div>
              <label className="block text-xs font-medium sch-muted mb-2">Mode de paiement</label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button"
                  onClick={() => setForm(f => ({ ...f, payment_method: 'company' }))}
                  className="py-2.5 u-pill text-sm font-medium transition-colors border"
                  style={form.payment_method === 'personal'
                    ? { borderColor: C.warning, background: C.warningBg, color: C.warning }
                    : { borderColor: C.border, background: 'white', color: C.muted }}>
                  💳 Compte perso
                  <span className="block text-[10px] opacity-75 font-normal">à rembourser</span>
                </button>
                <button type="button"
                  onClick={() => setForm(f => ({ ...f, payment_method: 'company' }))}
                  className="py-2.5 u-pill text-sm font-medium transition-colors border"
                  style={form.payment_method === 'company'
                    ? { borderColor: C.outline, background: C.neutralBg, color: AL.black }
                    : { borderColor: C.border, background: 'white', color: C.muted }}>
                  🏢 Carte société
                  <span className="block text-[10px] opacity-75 font-normal">déjà payé</span>
                </button>
              </div>
            </div>

            {/* Note */}
            <div>
              <label className="block text-xs font-medium sch-muted mb-1.5">Note</label>
              <textarea rows={2} placeholder="Détails supplémentaires…" value={form.description}
                onChange={e => setForm(f=>({...f,description:e.target.value}))}
                className={textareaCls} style={{ resize: 'vertical' }} />
            </div>

            {saveError && (
              <div className="px-4 py-3 u-pill text-sm" style={{ background: 'rgba(196,0,43,.10)', border: '1px solid rgba(196,0,43,.10)', color: C.danger }}>
                {saveError}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-8 py-4 border-t sch-line flex items-center justify-between gap-3">
            {editId ? (
              <button onClick={() => onDelete(editId)} disabled={saving}
                className="text-sm font-medium sch-ko hover:sch-ko">
                Supprimer
              </button>
            ) : <span />}
            <div className="flex items-center gap-3">
              <button type="button" onClick={onClose} disabled={saving}
                className="px-4 py-2 u-pill text-sm font-medium sch-ink hover:sch-fill transition-colors">
                Annuler
              </button>
              <button onClick={onSave} disabled={saving || !form.date}
                className="px-5 py-2 u-pill text-white font-medium text-sm transition-opacity disabled:opacity-50"
                style={{ background: AL.black }}>
                {saving ? 'Enregistrement…' : editId ? 'Mettre à jour' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
