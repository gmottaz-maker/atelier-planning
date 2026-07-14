import { useState, useEffect } from 'react'
import useSWR from 'swr'
import adminFetch from '../lib/adminFetch'

const isEmail = s => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)

function EmailChips({ value, onChange, placeholder }) {
  const [draft, setDraft] = useState('')
  function commit(raw) {
    const parts = String(raw).split(/[,;\s]+/).map(s => s.trim()).filter(Boolean)
    const add = parts.filter(isEmail).filter(e => !value.includes(e))
    if (add.length) onChange([...value, ...add])
    setDraft('')
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5 border border-gray-200 rounded-md bg-white focus-within:border-gray-400" style={{ minHeight: 40 }}>
      {value.map(e => (
        <span key={e} className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 rounded px-2 py-0.5" style={{ fontSize: 12 }}>
          {e}<button type="button" onClick={() => onChange(value.filter(x => x !== e))} className="text-gray-400 hover:text-red-500" style={{ lineHeight: 1 }}>×</button>
        </span>
      ))}
      <input value={draft}
        onChange={ev => setDraft(ev.target.value)}
        onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ',') { ev.preventDefault(); commit(draft) } else if (ev.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1)) }}
        onBlur={() => draft && commit(draft)}
        placeholder={value.length ? '' : placeholder}
        className="flex-1 min-w-[120px] text-sm outline-none bg-transparent py-0.5" />
    </div>
  )
}

// type: 'devis' | 'facture'. mode: variante PDF. contactId: pré-remplit le destinataire.
export default function SendDocumentModal({ type, docId, mode, contactId, projectName, number, onClose, onSent }) {
  const { data: contacts = [] } = useSWR('/api/contacts')
  const list = Array.isArray(contacts) ? contacts : []
  const byId = Object.fromEntries(list.map(c => [String(c.id), c]))

  const label = type === 'facture' ? 'Facture' : 'Offre'
  const ref = number ? `${number} — ` : ''
  const [to, setTo] = useState([])
  const [showCc, setShowCc] = useState(false)
  const [cc, setCc] = useState([])
  const [subject, setSubject] = useState(`${label} ${ref}${projectName || ''}`.trim())
  const [message, setMessage] = useState(
    type === 'facture'
      ? `Bonjour,\n\nVeuillez trouver ci-joint la facture${number ? ' ' + number : ''} relative à « ${projectName || ''} ».\nLe bulletin de versement QR est intégré au PDF.\n\nAvec nos remerciements,\nAmazing Lab`
      : `Bonjour,\n\nVeuillez trouver ci-joint notre offre${number ? ' ' + number : ''} pour « ${projectName || ''} ».\nNous restons à votre disposition pour toute question.\n\nCordialement,\nAmazing Lab`
  )
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [seeded, setSeeded] = useState(false)

  // ── Modèles de message ──
  const { data: templates = [], mutate: mutateTpl } = useSWR('/api/email-templates')
  const tplList = Array.isArray(templates) ? templates : []
  const [tplId, setTplId] = useState('')
  const fill = s => String(s || '').replace(/\{projet\}/gi, projectName || '').replace(/\{numero\}/gi, number || '')
  function applyTemplate(id) {
    setTplId(id)
    const t = tplList.find(x => String(x.id) === String(id))
    if (t) { setSubject(fill(t.subject)); setMessage(fill(t.body)) }
  }
  async function saveTemplate() {
    const name = window.prompt('Nom du modèle :')
    if (!name) return
    const r = await adminFetch('/api/email-templates', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, scope: 'all', subject, body: message }),
    })
    const d = await r.json()
    if (d.error) { setError(d.error); return }
    await mutateTpl()
    setTplId(String(d.id))
  }
  async function deleteTemplate() {
    const t = tplList.find(x => String(x.id) === String(tplId))
    if (!t || !window.confirm(`Supprimer le modèle « ${t.name} » ?`)) return
    await adminFetch(`/api/email-templates?id=${t.id}`, { method: 'DELETE' })
    setTplId('')
    mutateTpl()
  }

  // Pré-remplit le destinataire depuis le contact du projet.
  useEffect(() => {
    if (seeded || !list.length || contactId == null) return
    const c = byId[String(contactId)]
    const email = c?.email || (c?.parent_id ? byId[String(c.parent_id)]?.email : '')
    if (email && isEmail(email)) setTo([email])
    setSeeded(true)
  }, [list.length]) // eslint-disable-line react-hooks/exhaustive-deps

  async function send() {
    if (!to.length) { setError('Ajoute au moins un destinataire.'); return }
    setSending(true); setError('')
    try {
      const r = await adminFetch('/api/send-document', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, id: docId, mode, to, cc, subject, message }),
      })
      const d = await r.json()
      if (!r.ok || d.error) { setError(d.error || `Erreur ${r.status}`); return }
      onSent?.()
      onClose?.()
    } catch (e) { setError('Envoi impossible : ' + e.message) }
    finally { setSending(false) }
  }

  const lbl = 'block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide'
  const inp = 'w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:border-gray-400'

  return (
    <div onMouseDown={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,.45)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 16px', overflowY: 'auto' }}>
      <div onMouseDown={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-xl w-full" style={{ maxWidth: 560 }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900" style={{ fontSize: 16 }}>Envoyer {type === 'facture' ? 'la facture' : "l'offre"} par e-mail</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>
        <div className="px-6 py-5 flex flex-col gap-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={lbl} style={{ marginBottom: 0 }}>Destinataires</label>
              {!showCc && <button type="button" onClick={() => setShowCc(true)} className="text-xs text-gray-500 hover:text-gray-900">+ Cc</button>}
            </div>
            <EmailChips value={to} onChange={setTo} placeholder="email@client.ch — Entrée pour ajouter" />
          </div>
          {showCc && (
            <div>
              <label className={lbl}>Cc</label>
              <EmailChips value={cc} onChange={setCc} placeholder="Copie à…" />
            </div>
          )}
          <div>
            <label className={lbl}>Modèle</label>
            <div className="flex items-center gap-2">
              <select value={tplId} onChange={e => applyTemplate(e.target.value)} className={inp} style={{ flex: 1 }}>
                <option value="">— Aucun (message par défaut) —</option>
                {tplList.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button type="button" onClick={saveTemplate} title="Enregistrer le message actuel comme modèle"
                className="text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded px-2.5 py-2 whitespace-nowrap">Enregistrer</button>
              {tplId && (
                <button type="button" onClick={deleteTemplate} title="Supprimer ce modèle"
                  className="text-xs font-medium text-gray-400 hover:text-red-600 border border-gray-200 rounded px-2.5 py-2">Suppr.</button>
              )}
            </div>
          </div>
          <div>
            <label className={lbl}>Objet</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} className={inp} />
          </div>
          <div>
            <label className={lbl}>Message</label>
            <textarea value={message} onChange={e => setMessage(e.target.value)} rows={8} className={inp} style={{ resize: 'vertical' }} />
            <p className="text-xs text-gray-400 mt-1">Placeholders dans un modèle : <code>{'{projet}'}</code> et <code>{'{numero}'}</code> (remplacés à la sélection).</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-md px-3 py-2">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
            {label} en pièce jointe (PDF{type === 'facture' ? ' + QR' : ''}) · copie à hello@amazinglab.ch
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-100">Annuler</button>
          <button onClick={send} disabled={sending || !to.length}
            className="px-5 py-2 rounded-md text-sm font-medium text-white disabled:opacity-40" style={{ background: '#111827' }}>
            {sending ? 'Envoi…' : 'Envoyer'}
          </button>
        </div>
      </div>
    </div>
  )
}
