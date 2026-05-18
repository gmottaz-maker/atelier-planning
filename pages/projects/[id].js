import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import { useAuth } from '../_app'
import NavBar from '../../components/NavBar'
import { useResponsibles } from '../../lib/useResponsibles'
import { useSuggestions } from '../../lib/useSuggestions'
import AddressInput, { mapsViewUrl, mapsDirectionsUrl } from '../../components/AddressInput'

const PINK = '#111827'
const PERSON_COLORS = {
  Arnaud: '#3b82f6',
  Gabin: '#8b5cf6',
  Guillaume: PINK,
  'Sous-traitant': '#64748b',
}
// Liste par défaut — surchargée par useResponsibles() depuis l'API au runtime
const DEFAULT_RESPONSIBLE = 'non défini'

const LOGISTICS_TYPES = [
  { key: 'montage',      label: 'Montage',      icon: '🔨' },
  { key: 'demontage',    label: 'Démontage',    icon: '🔧' },
  { key: 'livraison',    label: 'Livraison',    icon: '🚚' },
  { key: 'recuperation', label: 'Récupération', icon: '↩️' },
  { key: 'envoi_dhl',    label: 'Envoi DHL',    icon: '✈️' },
  { key: 'envoi_ete',    label: 'Envoi ETE',    icon: '📦' },
]
const LOGISTICS_ASSIGNEES = ['Arnaud', 'Guillaume', 'Gabin', 'Coople']
const VEHICLES = ['Vito', 'Master', 'Autre']

function genLogUid() {
  return `log_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
// Types that have a date field
const TYPES_WITH_DATE = ['demontage', 'recuperation', 'livraison', 'envoi_dhl', 'envoi_ete', 'montage']

const TASK_CATEGORIES = [
  { key: 'bureau',         label: 'Bureau',             icon: '🏢', color: '#6366f1' },
  { key: 'commande',       label: 'Commande & Achats',  icon: '🛒', color: '#0ea5e9' },
  { key: 'sous_traitance', label: 'Sous-traitance',     icon: '🔨', color: '#a855f7' },
  { key: 'atelier',        label: 'Atelier',            icon: '🏭', color: '#f59e0b' },
  { key: 'logistique',     label: 'Logistique',         icon: '🚚', color: '#10b981' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today() { const d = new Date(); d.setHours(0,0,0,0); return d }
function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function isCompletedToday(task) {
  if (task.status !== 'completed' || !task.completed_at) return false
  return task.completed_at.split('T')[0] === toDateStr(today())
}
function fmtDate(str) {
  if (!str) return '—'
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m-1, d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}
function getDaysRemaining(deadline) {
  if (!deadline) return null
  const t = today()
  const d = new Date(deadline); d.setHours(0,0,0,0)
  return Math.ceil((d - t) / 86400000)
}
function getProjectColor(p) {
  if (p.color_override) return p.color_override
  const d = getDaysRemaining(p.deadline)
  if (d === null) return '#94a3b8'
  if (d < 0)   return '#dc2626'
  if (d <= 7)  return '#f59e0b'
  if (d <= 14) return '#eab308'
  return '#22c55e'
}

function ensureUid(item) {
  if (item?.uid) return item
  return { ...item, uid: genLogUid() }
}

// Init logistics from project → returns an array of items (chaque item a un uid stable)
function initLogistics(project) {
  const existing = project.logistics_data || {}

  // New format: already an array
  if (Array.isArray(existing) && existing.length > 0) return existing.map(ensureUid)

  // Old format: object keyed by type — migrate to array
  if (!Array.isArray(existing)) {
    const OLD_KEYS = ['montage', 'livraison', 'envoi_dhl', 'demontage', 'recuperation']
    const items = []
    for (const key of OLD_KEYS) {
      const d = existing[key]
      if (d && Object.values(d).some(v => v && String(v).trim())) {
        items.push(ensureUid({ type: key, ...d }))
      }
    }
    if (items.length > 0) return items
  }

  // Legacy columns fallback
  const items = []
  if (project.logistics_address || project.logistics_time) {
    items.push(ensureUid({ type: 'montage', date: '', address: project.logistics_address || '', time: project.logistics_time || '', contact: project.logistics_contact || '', notes: project.logistics_notes || '' }))
  }
  if (project.disassembly_date || project.disassembly_address) {
    items.push(ensureUid({ type: 'demontage', date: project.disassembly_date || '', address: project.disassembly_address || '', time: project.disassembly_time || '', contact: project.disassembly_contact || '', notes: project.disassembly_notes || '' }))
  }
  return items
}

// Parse / format time range "08:00 – 10:00"
function parseTimeRange(value) {
  if (!value) return { start: '', end: '' }
  const parts = value.split(/\s*[–\-]\s*/)
  function toInput(s) {
    if (!s) return ''
    s = s.trim().replace(/h/i, ':')
    return /^\d{2}:\d{2}$/.test(s) ? s : ''
  }
  return { start: toInput(parts[0] || ''), end: toInput(parts[1] || '') }
}
function combineTime(start, end) {
  if (!start && !end) return ''
  if (start && end) return `${start} – ${end}`
  return start || end
}
function fmtTimeDisplay(value) {
  if (!value) return null
  return value.replace(/(\d{2}):(\d{2})/g, '$1h$2')
}

// Format relatif court pour une date d'exécution (J-3, Auj., Demain, 15/05 etc.)
function fmtTaskDate(dateStr) {
  if (!dateStr) return null
  const todayStr = toDateStr(today())
  if (dateStr === todayStr) return { label: "Aujourd'hui", color: '#d97706' }
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m-1, d); date.setHours(0,0,0,0)
  const diff = Math.round((date - today()) / 86400000)
  if (diff < 0) return { label: `${Math.abs(diff)}j en retard`, color: '#dc2626' }
  if (diff === 1) return { label: 'Demain', color: '#d97706' }
  if (diff <= 7) return { label: `Dans ${diff}j`, color: '#6b7280' }
  return { label: date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }), color: '#9ca3af' }
}

// ─── Logo ─────────────────────────────────────────────────────────────────────
function Logo() {
  return (
    <svg width="20" height="20" viewBox="0 0 40 40" fill="none">
      <ellipse cx="20" cy="20" rx="18" ry="7" stroke={PINK} strokeWidth="2" fill="none" />
      <ellipse cx="20" cy="20" rx="18" ry="7" stroke={PINK} strokeWidth="2" fill="none" transform="rotate(60 20 20)" />
      <ellipse cx="20" cy="20" rx="18" ry="7" stroke={PINK} strokeWidth="2" fill="none" transform="rotate(120 20 20)" />
      <circle cx="20" cy="20" r="3" fill={PINK} />
    </svg>
  )
}

// ─── TimeRangeInput ───────────────────────────────────────────────────────────
function TimeRangeInput({ value, onChange }) {
  const { start, end } = parseTimeRange(value)
  const inp = "flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-sm bg-white"
  return (
    <div className="flex items-center gap-1.5">
      <input type="time" value={start}
        onChange={e => onChange(combineTime(e.target.value, end))}
        className={inp} style={{ fontSize: 14 }} />
      <span className="text-gray-400 text-xs">–</span>
      <input type="time" value={end}
        onChange={e => onChange(combineTime(start, e.target.value))}
        className={inp} style={{ fontSize: 14 }} />
    </div>
  )
}

// ─── EditTaskModal ────────────────────────────────────────────────────────────
function EditTaskModal({ task, currentUser, onSave, onDelete, onClose }) {
  const { responsibles } = useResponsibles()
  const [form, setForm] = useState({
    title: task.title || '',
    responsible: task.responsible || DEFAULT_RESPONSIBLE,
    execution_date: task.execution_date || toDateStr(today()),
    category: task.category || 'bureau',
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleSave() {
    if (!form.title.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-actor': currentUser },
        body: JSON.stringify({ ...form, title: form.title.trim(), prev_status: task.status }),
      })
      const updated = await res.json()
      if (updated.id) { onSave(updated); onClose() }
    } catch (err) { console.error(err) }
    setSaving(false)
  }

  async function handleDelete() {
    if (!confirm('Supprimer cette tâche ?')) return
    setDeleting(true)
    try {
      await fetch(`/api/tasks/${task.id}`, { method: 'DELETE', headers: { 'x-actor': currentUser } })
      onDelete(task.id)
      onClose()
    } catch (err) { console.error(err) }
    setDeleting(false)
  }

  const inp = "w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:border-gray-400 focus:outline-none"

  return (
    <div className="fixed inset-0 flex items-end sm:items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.35)' }} onClick={onClose}>
      <div
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900">Modifier la tâche</h3>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600" style={{ background: '#f3f4f6' }}>✕</button>
        </div>

        <div className="space-y-3 mb-5">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Titre</label>
            <input
              autoFocus type="text" value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className={inp}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Responsable</label>
              <select value={form.responsible} onChange={e => setForm(f => ({ ...f, responsible: e.target.value }))} className={inp}>
                {responsibles.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
              <input type="date" value={form.execution_date}
                onChange={e => setForm(f => ({ ...f, execution_date: e.target.value }))}
                className={inp} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Catégorie</label>
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className={inp}>
              {TASK_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
            </select>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleDelete} disabled={deleting}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold border"
            style={{ borderColor: '#fca5a5', color: '#dc2626', background: '#fff5f5' }}>
            {deleting ? '…' : 'Supprimer'}
          </button>
          <button
            onClick={handleSave} disabled={saving || !form.title.trim()}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: PINK }}>
            {saving ? '…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── TaskItem ─────────────────────────────────────────────────────────────────
function TaskItem({ task, onToggle, onEdit }) {
  const completed  = task.status === 'completed'
  const respColor  = PERSON_COLORS[task.responsible] || '#9ca3af'
  const dateInfo   = !completed && fmtTaskDate(task.execution_date)
  return (
    <div
      className="flex items-center gap-3 py-3 px-2 -mx-2 border-b last:border-b-0 group rounded-md hover:bg-gray-50 transition-colors"
      style={{ borderColor: '#f3f4f6', cursor: onEdit ? 'pointer' : 'default' }}
      onClick={() => onEdit && onEdit(task)}
    >
      <button
        onClick={e => { e.stopPropagation(); onToggle(task) }}
        className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all hover:scale-110"
        style={{ borderColor: completed ? '#22c55e' : '#d1d5db', background: completed ? '#22c55e' : 'white' }}>
        {completed && (
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>

      <div className="flex-1 min-w-0">
        <p className={`leading-snug ${completed ? 'text-gray-400 line-through' : 'text-gray-900 font-medium'}`}
          style={{ fontSize: 14 }}>
          {task.title}
        </p>
      </div>

      {task.responsible && (
        <span className="text-xs font-medium px-2 py-0.5 rounded-md flex-shrink-0"
          style={{ background: respColor + '15', color: respColor }}>
          {task.responsible}
        </span>
      )}

      {dateInfo && (
        <span className="text-xs font-medium tabular-nums flex-shrink-0"
          style={{ color: dateInfo.color }}>
          {dateInfo.label}
        </span>
      )}

      {onEdit && !completed && (
        <svg className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 flex-shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      )}
    </div>
  )
}

// ─── AddTaskForm ──────────────────────────────────────────────────────────────
function AddTaskForm({ projectId, category, currentUser, onAdd, onCancel }) {
  const { responsibles } = useResponsibles()
  const todayStr = toDateStr(today())
  const [form, setForm] = useState({
    title: '',
    responsible: currentUser || DEFAULT_RESPONSIBLE,
    execution_date: todayStr,
  })
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-actor': currentUser },
        body: JSON.stringify({
          title: form.title.trim(),
          responsible: form.responsible,
          execution_date: form.execution_date,
          project_id: projectId,
          category,
        }),
      })
      const task = await res.json()
      if (task.id) onAdd(task)
    } catch (err) { console.error(err) }
    setSaving(false)
  }

  const inp = "px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm bg-white w-full"
  return (
    <form onSubmit={handleSubmit} className="pt-2 pb-1 space-y-2">
      <input autoFocus type="text" value={form.title}
        onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
        placeholder="Titre de la tâche..." className={inp} style={{ fontSize: 14 }} />
      <div className="flex gap-2">
        <select value={form.responsible}
          onChange={e => setForm(f => ({ ...f, responsible: e.target.value }))}
          className={`${inp} flex-1`} style={{ fontSize: 14 }}>
          {responsibles.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <input type="date" value={form.execution_date}
          onChange={e => setForm(f => ({ ...f, execution_date: e.target.value }))}
          className={`${inp} flex-1`} style={{ fontSize: 14 }} />
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={saving || !form.title.trim()}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
          style={{ background: PINK }}>
          {saving ? '...' : 'Ajouter'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-500 border border-gray-200">
          Annuler
        </button>
      </div>
    </form>
  )
}

// ─── AddCommandeForm ──────────────────────────────────────────────────────────
function AddCommandeForm({ projectId, currentUser, onAdd, onCancel }) {
  const { responsibles } = useResponsibles()
  const vendorSuggestions = useSuggestions('vendor')
  const todayStr = toDateStr(today())
  const [form, setForm] = useState({
    article: '',
    quantity: '',
    vendor: '',
    order_date: todayStr,
    expected_date: '',
    responsible: currentUser || DEFAULT_RESPONSIBLE,
  })
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.article.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-actor': currentUser },
        body: JSON.stringify({
          title: form.article.trim(),
          responsible: form.responsible,
          execution_date: form.expected_date || form.order_date,
          project_id: projectId,
          category: 'commande',
          category_data: {
            quantity: form.quantity.trim() || null,
            vendor: form.vendor.trim() || null,
            order_date: form.order_date || null,
            expected_date: form.expected_date || null,
          },
        }),
      })
      const task = await res.json()
      if (task.id) onAdd(task)
    } catch (err) { console.error(err) }
    setSaving(false)
  }

  const inp = "px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm bg-white w-full"
  return (
    <form onSubmit={handleSubmit} className="pt-2 pb-1 space-y-2">
      <input autoFocus type="text" value={form.article}
        onChange={e => setForm(f => ({ ...f, article: e.target.value }))}
        placeholder="Article (ex: Vis M6 inox)" className={inp} style={{ fontSize: 14 }} />
      <div className="flex gap-2">
        <input type="text" value={form.quantity}
          onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
          placeholder="Quantité" className={`${inp} w-24`} style={{ fontSize: 14 }} />
        <input type="text" value={form.vendor} list="vendor-suggestions"
          onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))}
          placeholder="Vendeur" className={`${inp} flex-1`} style={{ fontSize: 14 }} />
        <datalist id="vendor-suggestions">
          {vendorSuggestions.map(v => <option key={v} value={v} />)}
        </datalist>
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-[10px] text-gray-400 mb-0.5">Commandé le</label>
          <input type="date" value={form.order_date}
            onChange={e => setForm(f => ({ ...f, order_date: e.target.value }))}
            className={inp} style={{ fontSize: 14 }} />
        </div>
        <div className="flex-1">
          <label className="block text-[10px] text-gray-400 mb-0.5">Réception prévue</label>
          <input type="date" value={form.expected_date}
            onChange={e => setForm(f => ({ ...f, expected_date: e.target.value }))}
            className={inp} style={{ fontSize: 14 }} />
        </div>
      </div>
      <select value={form.responsible}
        onChange={e => setForm(f => ({ ...f, responsible: e.target.value }))}
        className={inp} style={{ fontSize: 14 }}>
        {responsibles.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={saving || !form.article.trim()}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
          style={{ background: PINK }}>
          {saving ? '…' : 'Ajouter'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-500 border border-gray-200">
          Annuler
        </button>
      </div>
    </form>
  )
}

// ─── CommandeItem ─────────────────────────────────────────────────────────────
const STORAGE_LOCATIONS = ['Entrée', 'Étagère de réception', 'Économat', 'Rack à panneaux']

function CommandeItem({ task, currentUser, onUpdate, onDelete }) {
  const data = task.category_data || {}
  const isReceived = task.status === 'completed' || !!data.received_at
  const [saving, setSaving] = useState(false)
  const [showPicker, setShowPicker] = useState(false)

  async function confirmReceived(storageLocation) {
    if (saving) return
    setSaving(true)
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-actor': currentUser },
        body: JSON.stringify({
          status: 'completed',
          prev_status: task.status,
          category_data: {
            ...data,
            received_at: toDateStr(today()),
            received_by: currentUser,
            storage_location: storageLocation || null,
          },
        }),
      })
      const updated = await res.json()
      if (updated.id) onUpdate(updated)
      setShowPicker(false)
    } catch (err) { console.error(err) }
    setSaving(false)
  }

  async function reopen() {
    if (saving) return
    setSaving(true)
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-actor': currentUser },
        body: JSON.stringify({
          status: 'active',
          prev_status: task.status,
          category_data: { ...data, received_at: null, received_by: null, storage_location: null },
        }),
      })
      const updated = await res.json()
      if (updated.id) onUpdate(updated)
    } catch (err) { console.error(err) }
    setSaving(false)
  }

  async function remove() {
    if (!confirm('Supprimer cette commande ?')) return
    await fetch(`/api/tasks/${task.id}`, { method: 'DELETE', headers: { 'x-actor': currentUser } })
    onDelete(task.id)
  }

  return (
    <>
      <div className="py-3 border-b last:border-b-0" style={{ borderColor: '#f3f4f6' }}>
        <div className="flex items-start gap-3">
          <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
            style={{ background: isReceived ? '#22c55e' : '#d1d5db' }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className={`text-sm font-medium ${isReceived ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                {task.title}
              </span>
              {data.quantity && (
                <span className="text-xs text-gray-500">· {data.quantity}</span>
              )}
              {data.vendor && (
                <span className="text-xs text-gray-500">· {data.vendor}</span>
              )}
            </div>
            <div className="text-xs text-gray-400 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
              {data.order_date && <span>Commandé {fmtDate(data.order_date)}</span>}
              {data.expected_date && <span>Réception prévue {fmtDate(data.expected_date)}</span>}
              {data.received_at && <span style={{ color: '#16a34a' }}>Reçu {fmtDate(data.received_at)}{data.received_by ? ` par ${data.received_by}` : ''}</span>}
              {data.storage_location && <span style={{ color: '#16a34a' }}>Rangé : {data.storage_location}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {!isReceived ? (
              <button onClick={() => setShowPicker(true)} disabled={saving}
                className="text-xs font-medium px-3 py-1.5 rounded-md text-white disabled:opacity-50"
                style={{ background: '#111827' }}>
                Réceptionné
              </button>
            ) : (
              <button onClick={reopen} disabled={saving}
                className="text-xs text-gray-500 hover:text-gray-900">
                Annuler
              </button>
            )}
            <button onClick={remove} className="text-xs text-gray-400 hover:text-red-500">✕</button>
          </div>
        </div>
      </div>
      {showPicker && (
        <StorageLocationPicker
          onConfirm={confirmReceived}
          onCancel={() => setShowPicker(false)}
          saving={saving}
        />
      )}
    </>
  )
}

function StorageLocationPicker({ onConfirm, onCancel, saving }) {
  const suggestions = useSuggestions('storage')
  const [picked, setPicked] = useState('')
  const [customValue, setCustomValue] = useState('')
  const isAutres = picked === 'Autres'

  // Suggestions supplémentaires (anciennes valeurs custom)
  const extra = suggestions.filter(s => !STORAGE_LOCATIONS.includes(s))

  function handleConfirm() {
    const value = isAutres ? customValue.trim() : picked
    if (!value) return
    onConfirm(value)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.35)' }}
      onClick={onCancel}>
      <div className="bg-white rounded-xl w-full sm:max-w-md p-6 shadow-xl"
        onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold text-gray-900 text-base mb-1">Lieu de stockage</h3>
        <p className="text-xs text-gray-500 mb-4">Où as-tu rangé cette commande ?</p>
        <div className="space-y-1.5 mb-4">
          {STORAGE_LOCATIONS.map(loc => (
            <button key={loc}
              onClick={() => setPicked(loc)}
              className="w-full text-left px-4 py-2.5 rounded-md text-sm transition-colors border"
              style={{
                borderColor: picked === loc ? '#111827' : '#e5e7eb',
                background: picked === loc ? '#111827' : 'white',
                color: picked === loc ? 'white' : '#374151',
                fontWeight: picked === loc ? 600 : 500,
              }}>
              {loc}
            </button>
          ))}
          {extra.map(loc => (
            <button key={loc}
              onClick={() => { setPicked('Autres'); setCustomValue(loc) }}
              className="w-full text-left px-4 py-2.5 rounded-md text-sm transition-colors border"
              style={{
                borderColor: picked === 'Autres' && customValue === loc ? '#111827' : '#e5e7eb',
                background: picked === 'Autres' && customValue === loc ? '#111827' : 'white',
                color: picked === 'Autres' && customValue === loc ? 'white' : '#374151',
                fontWeight: picked === 'Autres' && customValue === loc ? 600 : 500,
              }}>
              {loc}
            </button>
          ))}
          <button
            onClick={() => setPicked('Autres')}
            className="w-full text-left px-4 py-2.5 rounded-md text-sm transition-colors border"
            style={{
              borderColor: isAutres ? '#111827' : '#e5e7eb',
              background: isAutres ? '#f9fafb' : 'white',
              color: '#374151',
              fontWeight: isAutres ? 600 : 500,
            }}>
            Autres…
          </button>
          {isAutres && (
            <input autoFocus type="text" value={customValue}
              onChange={e => setCustomValue(e.target.value)}
              placeholder="Préciser le lieu de stockage"
              className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm" />
          )}
        </div>
        <div className="flex items-center gap-3 justify-end">
          <button onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-900">Annuler</button>
          <button onClick={handleConfirm} disabled={saving || (!picked || (isAutres && !customValue.trim()))}
            className="px-4 py-2 rounded-md text-sm font-medium text-white disabled:opacity-50"
            style={{ background: '#111827' }}>
            {saving ? 'Enregistrement…' : 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── AddSousTraitanceForm ─────────────────────────────────────────────────────
function AddSousTraitanceForm({ projectId, currentUser, onAdd, onCancel }) {
  const { responsibles } = useResponsibles()
  const subSuggestions = useSuggestions('subcontractor')
  const todayStr = toDateStr(today())
  const [form, setForm] = useState({
    title: '',
    subcontractor: '',
    drop_date: todayStr,
    expected_pickup_date: '',
    responsible: currentUser || DEFAULT_RESPONSIBLE,
  })
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-actor': currentUser },
        body: JSON.stringify({
          title: form.title.trim(),
          responsible: form.responsible,
          execution_date: form.expected_pickup_date || form.drop_date,
          project_id: projectId,
          category: 'sous_traitance',
          category_data: {
            subcontractor: form.subcontractor.trim() || null,
            drop_date: form.drop_date || null,
            expected_pickup_date: form.expected_pickup_date || null,
          },
        }),
      })
      const task = await res.json()
      if (task.id) onAdd(task)
    } catch (err) { console.error(err) }
    setSaving(false)
  }

  const inp = "px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm bg-white w-full"
  return (
    <form onSubmit={handleSubmit} className="pt-2 pb-1 space-y-2">
      <input autoFocus type="text" value={form.title}
        onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
        placeholder="Que sous-traiter ? (ex: Découpe panneaux)" className={inp} style={{ fontSize: 14 }} />
      <input type="text" value={form.subcontractor} list="subcontractor-suggestions"
        onChange={e => setForm(f => ({ ...f, subcontractor: e.target.value }))}
        placeholder="Sous-traitant" className={inp} style={{ fontSize: 14 }} />
      <datalist id="subcontractor-suggestions">
        {subSuggestions.map(v => <option key={v} value={v} />)}
      </datalist>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-[10px] text-gray-400 mb-0.5">Dépose</label>
          <input type="date" value={form.drop_date}
            onChange={e => setForm(f => ({ ...f, drop_date: e.target.value }))}
            className={inp} style={{ fontSize: 14 }} />
        </div>
        <div className="flex-1">
          <label className="block text-[10px] text-gray-400 mb-0.5">Récupération prévue</label>
          <input type="date" value={form.expected_pickup_date}
            onChange={e => setForm(f => ({ ...f, expected_pickup_date: e.target.value }))}
            className={inp} style={{ fontSize: 14 }} />
        </div>
      </div>
      <select value={form.responsible}
        onChange={e => setForm(f => ({ ...f, responsible: e.target.value }))}
        className={inp} style={{ fontSize: 14 }}>
        {responsibles.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={saving || !form.title.trim()}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
          style={{ background: PINK }}>
          {saving ? '…' : 'Ajouter'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-500 border border-gray-200">
          Annuler
        </button>
      </div>
    </form>
  )
}

// ─── SousTraitanceItem ────────────────────────────────────────────────────────
function SousTraitanceItem({ task, currentUser, onUpdate, onDelete, onAddTask }) {
  const data = task.category_data || {}
  const isReady = !!data.ready_at
  const isDone = task.status === 'completed' || !!data.picked_up_at
  const [saving, setSaving] = useState(false)
  const [showPicker, setShowPicker] = useState(false)

  async function transition(payload) {
    if (saving) return
    setSaving(true)
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-actor': currentUser },
        body: JSON.stringify({ prev_status: task.status, ...payload }),
      })
      const updated = await res.json()
      if (updated.id) onUpdate(updated)
      return updated
    } catch (err) { console.error(err); return null }
    finally { setSaving(false) }
  }

  async function markReady() {
    if (saving) return
    setSaving(true)
    try {
      // 1. Créer la tâche de récupération pour Arnaud
      const pickupTitle = `Récupérer ${task.title}${data.subcontractor ? ` chez ${data.subcontractor}` : ''}`
      const pickupRes = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-actor': currentUser },
        body: JSON.stringify({
          title: pickupTitle,
          responsible: 'Arnaud',
          execution_date: toDateStr(today()),
          project_id: task.project_id,
          category: 'logistique',
          category_data: { source_task_id: task.id, kind: 'pickup' },
        }),
      })
      const pickupTask = await pickupRes.json()

      // 2. Marquer la sous-traitance comme prête à récupérer (avec lien vers la tâche pickup)
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-actor': currentUser },
        body: JSON.stringify({
          prev_status: task.status,
          category_data: {
            ...data,
            ready_at: toDateStr(today()),
            ready_by: currentUser,
            pickup_task_id: pickupTask?.id || null,
          },
        }),
      })
      const updated = await res.json()
      if (updated.id) onUpdate(updated)
      if (pickupTask?.id && onAddTask) onAddTask(pickupTask)
    } catch (err) { console.error(err) }
    setSaving(false)
  }

  async function confirmPickedUp(storageLocation) {
    if (saving) return
    setSaving(true)
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-actor': currentUser },
        body: JSON.stringify({
          status: 'completed',
          prev_status: task.status,
          category_data: {
            ...data,
            picked_up_at: toDateStr(today()),
            picked_up_by: currentUser,
            storage_location: storageLocation || null,
          },
        }),
      })
      const updated = await res.json()
      if (updated.id) onUpdate(updated)

      // Compléter aussi la tâche de récupération liée si elle existe
      if (data.pickup_task_id) {
        try {
          const pickupRes = await fetch(`/api/tasks/${data.pickup_task_id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'x-actor': currentUser },
            body: JSON.stringify({ status: 'completed', prev_status: 'active' }),
          })
          const pickupUpdated = await pickupRes.json()
          if (pickupUpdated.id) onUpdate(pickupUpdated)
        } catch (err) { /* tâche supprimée ou inaccessible — non bloquant */ }
      }
      setShowPicker(false)
    } catch (err) { console.error(err) }
    setSaving(false)
  }

  async function reopen() {
    // Supprime la tâche pickup si elle existe et est encore active
    if (data.pickup_task_id) {
      try {
        await fetch(`/api/tasks/${data.pickup_task_id}`, {
          method: 'DELETE',
          headers: { 'x-actor': currentUser },
        })
        onDelete && onDelete(data.pickup_task_id)
      } catch (_) {}
    }
    transition({
      status: 'active',
      category_data: { ...data, picked_up_at: null, picked_up_by: null, ready_at: null, ready_by: null, pickup_task_id: null, storage_location: null },
    })
  }

  async function remove() {
    if (!confirm('Supprimer cette sous-traitance ?')) return
    if (data.pickup_task_id) {
      try { await fetch(`/api/tasks/${data.pickup_task_id}`, { method: 'DELETE', headers: { 'x-actor': currentUser } }) } catch (_) {}
      onDelete && onDelete(data.pickup_task_id)
    }
    await fetch(`/api/tasks/${task.id}`, { method: 'DELETE', headers: { 'x-actor': currentUser } })
    onDelete(task.id)
  }

  const stateLabel = isDone ? 'À l\'atelier' : isReady ? 'Prêt à récupérer' : 'Chez le sous-traitant'
  const stateColor = isDone ? '#16a34a' : isReady ? '#d97706' : '#6b7280'

  return (
    <>
    <div className="py-3 border-b last:border-b-0" style={{ borderColor: '#f3f4f6' }}>
      <div className="flex items-start gap-3">
        <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: stateColor }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className={`text-sm font-medium ${isDone ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
              {task.title}
            </span>
            {data.subcontractor && (
              <span className="text-xs text-gray-500">· {data.subcontractor}</span>
            )}
            <span className="text-xs font-medium" style={{ color: stateColor }}>· {stateLabel}</span>
          </div>
          <div className="text-xs text-gray-400 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            {data.drop_date && <span>Dépose {fmtDate(data.drop_date)}</span>}
            {data.expected_pickup_date && <span>Récup prévue {fmtDate(data.expected_pickup_date)}</span>}
            {data.ready_at && !isDone && <span style={{ color: '#d97706' }}>Prêt depuis {fmtDate(data.ready_at)}</span>}
            {data.picked_up_at && <span style={{ color: '#16a34a' }}>À l'atelier {fmtDate(data.picked_up_at)}{data.picked_up_by ? ` (${data.picked_up_by})` : ''}</span>}
            {data.storage_location && <span style={{ color: '#16a34a' }}>Rangé : {data.storage_location}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!isReady && !isDone && (
            <button onClick={markReady} disabled={saving}
              className="text-xs font-medium px-3 py-1.5 rounded-md text-white disabled:opacity-50"
              style={{ background: '#d97706' }}>
              {saving ? '…' : 'Prêt à récupérer'}
            </button>
          )}
          {isReady && !isDone && (
            <button onClick={() => setShowPicker(true)} disabled={saving}
              className="text-xs font-medium px-3 py-1.5 rounded-md text-white disabled:opacity-50"
              style={{ background: '#111827' }}>
              À l'atelier
            </button>
          )}
          {isDone && (
            <button onClick={reopen} disabled={saving}
              className="text-xs text-gray-500 hover:text-gray-900">
              Annuler
            </button>
          )}
          <button onClick={remove} className="text-xs text-gray-400 hover:text-red-500">✕</button>
        </div>
      </div>
    </div>
    {showPicker && (
      <StorageLocationPicker
        onConfirm={confirmPickedUp}
        onCancel={() => setShowPicker(false)}
        saving={saving}
      />
    )}
    </>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ProjectPage() {
  const router = useRouter()
  const { id } = router.query
  const { user, signOut } = useAuth()
  const currentUser = user?.name || ''
  const { responsibles } = useResponsibles()

  const [project, setProject] = useState(null)
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)

  // Logistics state (array of items)
  const [logistics, setLogistics] = useState([])
  const [logisticsDirty, setLogisticsDirty] = useState(false)
  const [logisticsSaving, setLogisticsSaving] = useState(false)
  const [expandedLogIdx, setExpandedLogIdx] = useState(null)
  const [addingLogistics, setAddingLogistics] = useState(false)

  // Task state
  const [addingCategory, setAddingCategory] = useState(null)
  const [editingTask, setEditingTask]       = useState(null) // task object being edited

  // Files state
  const [files, setFiles] = useState([])
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  // Site visit state
  const EMPTY_VISIT = {
    date: '', participants: [],
    address: '', surface: '', ceiling_height: '', floor_type: '',
    access_notes: '', access_hours: '',
    electricity: '', lighting: '', wifi: '',
    contacts: '', constraints: '', observations: '',
  }
  const [siteVisit, setSiteVisit] = useState(EMPTY_VISIT)
  const [visitDirty, setVisitDirty] = useState(false)
  const [visitSaving, setVisitSaving] = useState(false)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [visitSummary, setVisitSummary] = useState('')
  const [visitExpanded, setVisitExpanded] = useState(false)

  // ── Load data ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id || !currentUser) return
    Promise.all([
      fetch(`/api/projects/${id}`).then(r => r.json()),
      fetch('/api/tasks', { headers: { 'x-actor': currentUser } }).then(r => r.json()),
      fetch(`/api/projects/${id}/files`).then(r => r.json()),
    ]).then(([proj, allTasks, fileList]) => {
      if (proj && !proj.error) {
        setProject(proj)
        setLogistics(initLogistics(proj))
        if (proj.site_visit_data && Object.keys(proj.site_visit_data).length > 0) {
          setSiteVisit(v => ({ ...v, ...proj.site_visit_data }))
          setVisitExpanded(true)
        }
        if (proj.site_visit_summary) setVisitSummary(proj.site_visit_summary)
      }
      if (Array.isArray(allTasks)) {
        setTasks(allTasks.filter(t => String(t.project_id) === String(id)))
      }
      if (Array.isArray(fileList)) setFiles(fileList)
    }).catch(console.error)
    .finally(() => setLoading(false))
  }, [id, currentUser])

  // ── Logistics helpers ────────────────────────────────────────────────────
  function updateLogItem(idx, field, value) {
    setLogistics(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))
    setLogisticsDirty(true)
  }
  function removeLogItem(idx) {
    setLogistics(prev => prev.filter((_, i) => i !== idx))
    if (expandedLogIdx === idx) setExpandedLogIdx(null)
    else if (expandedLogIdx > idx) setExpandedLogIdx(expandedLogIdx - 1)
    setLogisticsDirty(true)
  }
  function addLogItem(type) {
    const newItem = {
      uid: genLogUid(),
      type, date: '', address: '', time: '', contact: '', notes: '',
      assignees: [],
      coople_contact: { name: '', phone: '' },
      vehicle: '',
    }
    setLogistics(prev => {
      const next = [...prev, newItem]
      setExpandedLogIdx(next.length - 1)
      return next
    })
    setAddingLogistics(false)
    setLogisticsDirty(true)
  }

  async function saveLogistics(logisticsToSave) {
    setLogisticsSaving(true)
    const data = logisticsToSave ?? logistics
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-actor': currentUser },
        body: JSON.stringify({ ...project, logistics_data: data }),
      })
      const updated = await res.json()
      if (updated && !updated.error) {
        setProject(updated)
        setLogisticsDirty(false)
        await syncLogisticsTasks(data)
      }
    } catch (err) { console.error(err) }
    setLogisticsSaving(false)
  }

  // Synchronise les tâches associées aux points logistiques (1 tâche par personne assignée)
  async function syncLogisticsTasks(currentItems) {
    const tasksRes = await fetch('/api/tasks', { headers: { 'x-actor': currentUser } }).then(r => r.json()).catch(() => null)
    if (!Array.isArray(tasksRes)) return
    const existingLogTasks = tasksRes.filter(t =>
      String(t.project_id) === String(id) &&
      t.category === 'logistique' &&
      t.category_data?.source_logistics_uid
    )

    for (const item of currentItems) {
      if (!item.uid) continue
      const type = LOGISTICS_TYPES.find(t => t.key === item.type)
      const label = type?.label || item.type
      const assignees = Array.isArray(item.assignees) ? item.assignees : []
      const tasksForItem = existingLogTasks.filter(t => t.category_data?.source_logistics_uid === item.uid)
      const existingPeople = new Set(tasksForItem.map(t => t.responsible))
      const desiredPeople = new Set(assignees)

      // Créer les manquantes
      for (const person of assignees) {
        if (existingPeople.has(person)) continue
        await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-actor': currentUser },
          body: JSON.stringify({
            title: `${label} — ${project.name}`,
            responsible: person,
            execution_date: item.date || toDateStr(today()),
            project_id: id,
            category: 'logistique',
            category_data: {
              source_logistics_uid: item.uid,
              logistics_type: item.type,
              vehicle: item.vehicle || null,
            },
            notes: item.notes || null,
          }),
        }).catch(console.error)
      }

      // Supprimer celles dont la personne n'est plus dans la liste
      for (const t of tasksForItem) {
        if (desiredPeople.has(t.responsible)) continue
        await fetch(`/api/tasks/${t.id}`, {
          method: 'DELETE',
          headers: { 'x-actor': currentUser },
        }).catch(console.error)
      }
    }

    // Supprimer aussi les tâches dont l'item logistique a été supprimé
    const validUids = new Set(currentItems.map(i => i.uid).filter(Boolean))
    for (const t of existingLogTasks) {
      const uid = t.category_data?.source_logistics_uid
      if (!validUids.has(uid)) {
        await fetch(`/api/tasks/${t.id}`, {
          method: 'DELETE',
          headers: { 'x-actor': currentUser },
        }).catch(console.error)
      }
    }

    // Recharger les tâches de ce projet
    try {
      const fresh = await fetch('/api/tasks', { headers: { 'x-actor': currentUser } }).then(r => r.json())
      if (Array.isArray(fresh)) {
        setTasks(fresh.filter(t => String(t.project_id) === String(id)))
      }
    } catch (_) {}
  }

  // ── Task helpers ─────────────────────────────────────────────────────────
  async function toggleTask(task) {
    const newStatus = task.status === 'completed' ? 'active' : 'completed'
    const now = new Date().toISOString()
    setTasks(prev => prev.map(t => t.id === task.id
      ? { ...t, status: newStatus, completed_at: newStatus === 'completed' ? now : null }
      : t
    ))
    try {
      const { projects: _p, ...taskData } = task
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-actor': currentUser },
        body: JSON.stringify({ ...taskData, status: newStatus, prev_status: task.status, completed_at: newStatus === 'completed' ? now : null }),
      })
    } catch (err) {
      setTasks(prev => prev.map(t => t.id === task.id ? task : t))
    }
  }

  function handleTaskAdded(newTask) {
    setTasks(prev => [...prev, newTask])
    setAddingCategory(null)
  }

  function handleTaskUpdated(updated) {
    setTasks(prev => prev.map(t => t.id === updated.id ? updated : t))
  }

  function handleTaskDeleted(id) {
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  // ── Site visit helpers ────────────────────────────────────────────────────
  function setVisitField(field, value) {
    setSiteVisit(prev => ({ ...prev, [field]: value }))
    setVisitDirty(true)
  }
  function toggleParticipant(name) {
    setSiteVisit(prev => {
      const list = prev.participants || []
      const next = list.includes(name) ? list.filter(n => n !== name) : [...list, name]
      return { ...prev, participants: next }
    })
    setVisitDirty(true)
  }

  async function saveVisit() {
    setVisitSaving(true)
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-actor': currentUser },
        body: JSON.stringify({ ...project, logistics_data: logistics, site_visit_data: siteVisit, site_visit_summary: visitSummary || undefined }),
      })
      const updated = await res.json()
      if (updated && !updated.error) { setProject(updated); setVisitDirty(false) }
    } catch (err) { console.error(err) }
    setVisitSaving(false)
  }

  async function generateSummary() {
    setSummaryLoading(true)
    // Save first
    await saveVisit()
    try {
      const res = await fetch('/api/site-visit-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitData: siteVisit, projectName: project.name }),
      })
      const data = await res.json()
      if (data.summary) {
        setVisitSummary(data.summary)
        // Persist summary
        await fetch(`/api/projects/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'x-actor': currentUser },
          body: JSON.stringify({ ...project, logistics_data: logistics, site_visit_data: siteVisit, site_visit_summary: data.summary }),
        })
      }
    } catch (err) { console.error(err) }
    setSummaryLoading(false)
  }

  // ── File helpers ─────────────────────────────────────────────────────────
  async function uploadFile(file) {
    const ALLOWED = ['image/jpeg','image/png','image/gif','image/webp','application/pdf']
    if (!ALLOWED.includes(file.type)) { setUploadError('Format non supporté (JPG, PNG, GIF, WEBP, PDF uniquement)'); return }
    if (file.size > 20 * 1024 * 1024) { setUploadError('Fichier trop grand (max 20 MB)'); return }
    setUploadError('')
    setUploading(true)
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = e => resolve(e.target.result.split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const res = await fetch(`/api/projects/${id}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, mime_type: file.type, base64, size: file.size }),
      })
      const data = await res.json()
      if (data.error) { setUploadError(data.error); return }
      setFiles(prev => [data, ...prev])
    } catch (err) { setUploadError('Erreur lors de l\'upload') }
    setUploading(false)
  }

  async function deleteFile(file) {
    setFiles(prev => prev.filter(f => f.id !== file.id))
    await fetch(`/api/projects/${id}/files`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId: file.id, storagePath: file.storage_path }),
    })
  }

  function handleDrop(e) {
    e.preventDefault(); setIsDragging(false)
    const dropped = Array.from(e.dataTransfer.files)
    dropped.forEach(uploadFile)
  }

  // ── Computed ─────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#fafafa' }}>
      <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: '#e5e7eb', borderTopColor: PINK }} />
    </div>
  )
  if (!project || project.error) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: '#fafafa' }}>
      <p className="text-gray-500">Projet introuvable.</p>
      <Link href="/" className="text-sm text-blue-500 underline">← Retour</Link>
    </div>
  )

  const color = getProjectColor(project)
  const daysLeft = getDaysRemaining(project.deadline)
  const activeTasks = tasks.filter(t => t.status === 'active')

  const inp = "w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:border-gray-400 focus:outline-none transition-colors"

  return (
    <>
    <div className="min-h-screen" style={{ background: '#fafafa', fontFamily: 'Inter, sans-serif' }}>
      <Head>
        <title>{project.name} — Maze Project</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <style>{`
          * { -webkit-tap-highlight-color: transparent; }
          input[type=time]::-webkit-calendar-picker-indicator { opacity: 0.4; }
          @media print {
            body { background: white !important; font-family: 'Inter', sans-serif; }
            .no-print { display: none !important; }
            .print-only { display: block !important; }
            header, footer { display: none !important; }
            .print-form { display: block !important; }
          }
          .print-only { display: none; }
          .print-form { display: none; }
        `}</style>
      </Head>

      <NavBar title={project.name}>
        <Link href="/" style={{ fontSize: 12, color: '#6b7280', textDecoration: 'none' }}>← Projets</Link>
      </NavBar>

      <div className="w-full px-10 py-10" style={{ maxWidth: 1800, margin: '0 auto' }}>

        {/* ── Hero header ── */}
        <div className="mb-12 bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="h-2 w-full" style={{ background: color }} />
          <div className="px-10 py-8">
            <div className="flex items-start gap-8">
              <div className="flex-1 min-w-0">
                <p className="text-xs uppercase tracking-wider text-gray-400 mb-2">Projet</p>
                <h1 className="font-semibold text-gray-900 leading-tight tracking-tight" style={{ fontSize: 36 }}>
                  {project.name}
                </h1>
                {project.client && (
                  <p className="text-gray-500 mt-2" style={{ fontSize: 18 }}>{project.client}</p>
                )}
                <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
                  {project.deadline && (
                    <div>
                      <div className="text-xs uppercase tracking-wider text-gray-400">Deadline</div>
                      <div className="font-semibold text-gray-900 mt-0.5" style={{ fontSize: 16 }}>
                        {fmtDate(project.deadline)}
                        <span className="ml-2 font-normal" style={{ fontSize: 13, color: daysLeft < 0 ? '#dc2626' : daysLeft <= 7 ? '#d97706' : '#16a34a' }}>
                          {daysLeft < 0 ? `en retard de ${Math.abs(daysLeft)}j` : daysLeft === 0 ? "aujourd'hui" : `dans ${daysLeft}j`}
                        </span>
                      </div>
                    </div>
                  )}
                  {project.delivery_type && (
                    <div>
                      <div className="text-xs uppercase tracking-wider text-gray-400">Mode</div>
                      <div className="text-gray-900 mt-0.5" style={{ fontSize: 15 }}>{project.delivery_type}</div>
                    </div>
                  )}
                  <div>
                    <div className="text-xs uppercase tracking-wider text-gray-400">Statut</div>
                    <div className="text-gray-900 mt-0.5" style={{ fontSize: 15 }}>{project.status === 'active' ? 'En cours' : 'Archivé'}</div>
                  </div>
                  {activeTasks.length > 0 && (
                    <div>
                      <div className="text-xs uppercase tracking-wider text-gray-400">Tâches actives</div>
                      <div className="text-gray-900 mt-0.5" style={{ fontSize: 15 }}>{activeTasks.length}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right side: responsable + progress */}
              <div className="flex flex-col items-stretch gap-5 flex-shrink-0" style={{ minWidth: 260 }}>
                {project.responsible && (
                  <div className="flex items-center gap-3 justify-end">
                    <div className="text-right">
                      <div className="text-xs uppercase tracking-wider text-gray-400">Responsable</div>
                      <div className="font-semibold text-gray-900 mt-0.5" style={{ fontSize: 15 }}>{project.responsible}</div>
                    </div>
                    <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold"
                      style={{ background: PERSON_COLORS[project.responsible] || '#9ca3af', fontSize: 15, letterSpacing: '-0.02em' }}>
                      {(project.responsible || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                  </div>
                )}

                {(() => {
                  const done = tasks.filter(t => t.status === 'completed').length
                  const total = tasks.length
                  const pct = total > 0 ? Math.round((done / total) * 100) : 0
                  return (
                    <div className="w-full">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs uppercase tracking-wider text-gray-400">Progression</span>
                        <span className="font-semibold tabular-nums text-gray-900" style={{ fontSize: 14 }}>
                          {total === 0 ? '—' : `${pct}%`}
                        </span>
                      </div>
                      <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ background: '#f3f4f6' }}>
                        <div className="h-full rounded-full transition-all" style={{
                          width: `${pct}%`,
                          background: total === 0 ? '#e5e7eb' : pct === 100 ? '#22c55e' : '#111827',
                        }} />
                      </div>
                      <div className="mt-1.5 text-xs text-gray-500 text-right">
                        {total === 0 ? 'Aucune tâche' : `${done} / ${total} tâche${total > 1 ? 's' : ''}`}
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>

            {project.description && (
              <div className="mt-7 pt-6 border-t border-gray-100">
                <p className="text-xs uppercase tracking-wider text-gray-400 mb-2">Résumé</p>
                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap" style={{ fontSize: 14 }}>{project.description}</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Two columns ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">

          {/* ════ LEFT: Tâches groupées ════ */}
          <div>
            <div className="flex items-baseline justify-between mb-5">
              <h2 className="font-semibold text-gray-900" style={{ fontSize: 20 }}>Tâches</h2>
              {(() => {
                const totalActive = tasks.filter(t => t.status === 'active').length
                return totalActive > 0 ? (
                  <span className="text-xs text-gray-500">
                    {totalActive} tâche{totalActive > 1 ? 's' : ''} active{totalActive > 1 ? 's' : ''}
                  </span>
                ) : null
              })()}
            </div>
            <div className="space-y-3">
              {TASK_CATEGORIES.map(cat => {
                const catTasks = tasks.filter(t =>
                  (t.category === cat.key || (!t.category && cat.key === 'bureau')) &&
                  (t.status === 'active' || isCompletedToday(t))
                )
                const activeCount = catTasks.filter(t => t.status === 'active').length
                const isAdding = addingCategory === cat.key
                const isEmpty = catTasks.length === 0 && !isAdding

                // Catégorie vide → ligne discrète repliée
                if (isEmpty) {
                  return (
                    <button key={cat.key}
                      onClick={() => setAddingCategory(cat.key)}
                      className="w-full flex items-center gap-3 px-5 py-3 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors text-left group">
                      <div className="w-1 h-5 rounded-full" style={{ background: cat.color }} />
                      <span className="font-medium text-gray-600 group-hover:text-gray-900" style={{ fontSize: 14 }}>{cat.label}</span>
                      <span className="ml-auto text-xs text-gray-400 group-hover:text-gray-700">+ Ajouter</span>
                    </button>
                  )
                }

                return (
                  <div key={cat.key} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <div className="flex items-center justify-between pl-4 pr-5 py-3 border-b border-gray-100">
                      <div className="flex items-center gap-3">
                        <div className="w-1 h-5 rounded-full" style={{ background: cat.color }} />
                        <span className="font-semibold text-gray-900" style={{ fontSize: 14 }}>{cat.label}</span>
                        {activeCount > 0 && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-md"
                            style={{ background: cat.color + '15', color: cat.color }}>
                            {activeCount}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => setAddingCategory(isAdding ? null : cat.key)}
                        className="text-xs font-medium text-gray-500 hover:text-gray-900 transition-colors">
                        {isAdding ? 'Annuler' : '+ Ajouter'}
                      </button>
                    </div>

                    <div className="px-5 py-1">
                      {catTasks.map(t => {
                        if (t.category === 'commande') {
                          return <CommandeItem key={t.id} task={t} currentUser={currentUser}
                            onUpdate={handleTaskUpdated} onDelete={handleTaskDeleted} />
                        }
                        if (t.category === 'sous_traitance') {
                          return <SousTraitanceItem key={t.id} task={t} currentUser={currentUser}
                            onUpdate={handleTaskUpdated} onDelete={handleTaskDeleted} onAddTask={handleTaskAdded} />
                        }
                        return <TaskItem key={t.id} task={t} onToggle={toggleTask} onEdit={t => setEditingTask(t)} />
                      })}
                      {isAdding && (
                        cat.key === 'commande' ? (
                          <AddCommandeForm
                            projectId={project.id}
                            currentUser={currentUser}
                            onAdd={handleTaskAdded}
                            onCancel={() => setAddingCategory(null)}
                          />
                        ) : cat.key === 'sous_traitance' ? (
                          <AddSousTraitanceForm
                            projectId={project.id}
                            currentUser={currentUser}
                            onAdd={handleTaskAdded}
                            onCancel={() => setAddingCategory(null)}
                          />
                        ) : (
                          <AddTaskForm
                            projectId={project.id}
                            category={cat.key}
                            currentUser={currentUser}
                            onAdd={handleTaskAdded}
                            onCancel={() => setAddingCategory(null)}
                          />
                        )
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ════ RIGHT: Logistique ════ */}
          <div>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold text-gray-900" style={{ fontSize: 20 }}>Logistique</h2>
              {logisticsDirty && (
                <button onClick={() => saveLogistics()} disabled={logisticsSaving}
                  className="text-xs font-medium px-3 py-1.5 rounded-md text-white disabled:opacity-60 transition-opacity"
                  style={{ background: '#111827' }}>
                  {logisticsSaving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              )}
            </div>

            <div className="space-y-3">
              {logistics.map((item, idx) => {
                const type = LOGISTICS_TYPES.find(t => t.key === item.type) || { label: item.type }
                const hasContent = item.date || item.address || item.time || item.contact || item.notes
                const isEditing = expandedLogIdx === idx || !hasContent

                if (isEditing) {
                  return (
                    <div key={idx} className="bg-white rounded-lg border border-gray-300 overflow-hidden">
                      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
                        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                          {hasContent ? 'Modifier' : 'Nouveau point logistique'}
                        </span>
                        <div className="flex items-center gap-3 text-xs">
                          {hasContent && (
                            <button onClick={() => setExpandedLogIdx(null)}
                              className="font-medium text-gray-700 hover:text-gray-900">
                              Terminer
                            </button>
                          )}
                          <button onClick={() => removeLogItem(idx)}
                            className="text-gray-400 hover:text-red-500">
                            Supprimer
                          </button>
                        </div>
                      </div>
                      <div className="p-5 space-y-3">
                        <div className="flex gap-3">
                          <div className="flex-1">
                            <label className="block text-xs text-gray-400 mb-1">Type</label>
                            <select value={item.type}
                              onChange={e => updateLogItem(idx, 'type', e.target.value)}
                              className={inp} style={{ fontSize: 14 }}>
                              {LOGISTICS_TYPES.map(t => (
                                <option key={t.key} value={t.key}>{t.icon} {t.label}</option>
                              ))}
                            </select>
                          </div>
                          <div className="flex-1">
                            <label className="block text-xs text-gray-400 mb-1">Date</label>
                            <input type="date" value={item.date || ''} style={{ fontSize: 14 }}
                              onChange={e => updateLogItem(idx, 'date', e.target.value)}
                              className={inp} />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Adresse</label>
                          <AddressInput
                            value={item.address || ''}
                            onChange={v => updateLogItem(idx, 'address', v)}
                            placeholder="Rue, ville…"
                            className={inp}
                            style={{ fontSize: 14 }}
                          />
                          {item.address && (
                            <div className="mt-2 flex items-center gap-3 text-xs">
                              <a href={mapsViewUrl(item.address)} target="_blank" rel="noopener"
                                className="text-gray-500 hover:text-gray-900 underline">Voir sur Maps</a>
                              <a href={mapsDirectionsUrl(item.address)} target="_blank" rel="noopener"
                                className="font-medium text-gray-900 hover:underline">Itinéraire →</a>
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Heure prévue</label>
                          <TimeRangeInput value={item.time || ''} onChange={v => updateLogItem(idx, 'time', v)} />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Contact</label>
                          <input type="text" value={item.contact || ''} placeholder="Nom + téléphone" style={{ fontSize: 14 }}
                            onChange={e => updateLogItem(idx, 'contact', e.target.value)}
                            className={inp} />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Notes</label>
                          <textarea rows={2} value={item.notes || ''} placeholder="Accès, remarques…" style={{ fontSize: 14, resize: 'none' }}
                            onChange={e => updateLogItem(idx, 'notes', e.target.value)}
                            className={inp} />
                        </div>

                        {/* Personnes assignées */}
                        <div>
                          <label className="block text-xs text-gray-400 mb-2">Personnes</label>
                          <div className="flex flex-wrap gap-2">
                            {LOGISTICS_ASSIGNEES.map(name => {
                              const active = (item.assignees || []).includes(name)
                              const color = PERSON_COLORS[name] || '#6b7280'
                              return (
                                <button key={name} type="button"
                                  onClick={() => {
                                    const list = Array.isArray(item.assignees) ? item.assignees : []
                                    const next = list.includes(name) ? list.filter(n => n !== name) : [...list, name]
                                    updateLogItem(idx, 'assignees', next)
                                  }}
                                  className="text-xs font-medium px-3 py-1.5 rounded-md border transition-colors"
                                  style={{
                                    borderColor: active ? color : '#e5e7eb',
                                    background: active ? color + '14' : 'white',
                                    color: active ? color : '#6b7280',
                                  }}>
                                  {name}
                                </button>
                              )
                            })}
                          </div>
                          {(item.assignees || []).includes('Coople') && (
                            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-md border border-gray-200 bg-gray-50">
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">Coople — Nom et prénom</label>
                                <input type="text" value={item.coople_contact?.name || ''} style={{ fontSize: 14 }}
                                  onChange={e => updateLogItem(idx, 'coople_contact', { ...(item.coople_contact || {}), name: e.target.value })}
                                  className={inp} placeholder="Jean Dupont" />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">Téléphone</label>
                                <input type="tel" value={item.coople_contact?.phone || ''} style={{ fontSize: 14 }}
                                  onChange={e => updateLogItem(idx, 'coople_contact', { ...(item.coople_contact || {}), phone: e.target.value })}
                                  className={inp} placeholder="079 123 45 67" />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Véhicule */}
                        <div>
                          <label className="block text-xs text-gray-400 mb-2">Véhicule</label>
                          <div className="flex flex-wrap gap-2">
                            {VEHICLES.map(v => {
                              const active = item.vehicle === v
                              return (
                                <button key={v} type="button"
                                  onClick={() => updateLogItem(idx, 'vehicle', active ? '' : v)}
                                  className="text-xs font-medium px-3 py-1.5 rounded-md border transition-colors"
                                  style={{
                                    borderColor: active ? '#111827' : '#e5e7eb',
                                    background: active ? '#111827' : 'white',
                                    color: active ? 'white' : '#6b7280',
                                  }}>
                                  {v}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                }

                // ─── Carte info (mode lecture) ───
                return (
                  <div key={idx} className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:border-gray-300 transition-colors">
                    <div className="flex items-baseline justify-between gap-3 px-5 py-3 border-b border-gray-100">
                      <div className="flex items-baseline gap-3 min-w-0">
                        <span className="font-semibold text-gray-900" style={{ fontSize: 15 }}>{type.label}</span>
                        {item.date && (
                          <span className="text-sm text-gray-500">{fmtDate(item.date)}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs flex-shrink-0">
                        <button onClick={() => setExpandedLogIdx(idx)}
                          className="font-medium text-gray-600 hover:text-gray-900">
                          Modifier
                        </button>
                        <button onClick={() => removeLogItem(idx)}
                          className="text-gray-400 hover:text-red-500">
                          Supprimer
                        </button>
                      </div>
                    </div>
                    <div className="px-5 py-4">
                      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3" style={{ fontSize: 13 }}>
                        {item.address && (
                          <div className="sm:col-span-2">
                            <dt className="text-xs uppercase tracking-wider text-gray-400 mb-0.5">Adresse</dt>
                            <dd className="text-gray-900">{item.address}</dd>
                            <dd className="mt-1.5 flex items-center gap-3 text-xs">
                              <a href={mapsViewUrl(item.address)} target="_blank" rel="noopener"
                                className="text-gray-500 hover:text-gray-900 underline">Voir sur Maps</a>
                              <a href={mapsDirectionsUrl(item.address)} target="_blank" rel="noopener"
                                className="font-medium text-gray-900 hover:underline">Itinéraire →</a>
                            </dd>
                          </div>
                        )}
                        {item.time && (
                          <div>
                            <dt className="text-xs uppercase tracking-wider text-gray-400 mb-0.5">Heure</dt>
                            <dd className="text-gray-900 tabular-nums">{fmtTimeDisplay(item.time)}</dd>
                          </div>
                        )}
                        {item.contact && (
                          <div>
                            <dt className="text-xs uppercase tracking-wider text-gray-400 mb-0.5">Contact</dt>
                            <dd className="text-gray-900">{item.contact}</dd>
                          </div>
                        )}
                        {Array.isArray(item.assignees) && item.assignees.length > 0 && (
                          <div className="sm:col-span-2">
                            <dt className="text-xs uppercase tracking-wider text-gray-400 mb-1.5">Personnes</dt>
                            <dd className="flex flex-wrap gap-1.5">
                              {item.assignees.map(name => {
                                const color = PERSON_COLORS[name] || '#6b7280'
                                return (
                                  <span key={name}
                                    className="text-xs font-medium px-2 py-0.5 rounded-md"
                                    style={{ background: color + '14', color }}>
                                    {name}
                                  </span>
                                )
                              })}
                            </dd>
                            {item.assignees.includes('Coople') && (item.coople_contact?.name || item.coople_contact?.phone) && (
                              <dd className="mt-2 text-xs text-gray-600">
                                <span className="text-gray-400">Coople : </span>
                                {item.coople_contact?.name}
                                {item.coople_contact?.phone && <> · <a href={`tel:${item.coople_contact.phone}`} className="text-gray-700 hover:underline">{item.coople_contact.phone}</a></>}
                              </dd>
                            )}
                          </div>
                        )}
                        {item.vehicle && (
                          <div>
                            <dt className="text-xs uppercase tracking-wider text-gray-400 mb-0.5">Véhicule</dt>
                            <dd className="text-gray-900">{item.vehicle}</dd>
                          </div>
                        )}
                        {item.notes && (
                          <div className="sm:col-span-2">
                            <dt className="text-xs uppercase tracking-wider text-gray-400 mb-0.5">Notes</dt>
                            <dd className="text-gray-700 whitespace-pre-wrap leading-relaxed">{item.notes}</dd>
                          </div>
                        )}
                      </dl>
                    </div>
                  </div>
                )
              })}

              {/* Add logistics item */}
              {addingLogistics ? (
                <div className="bg-white rounded-lg border border-gray-200 px-5 py-4">
                  <p className="text-xs uppercase tracking-wider font-semibold text-gray-500 mb-3">Choisir un type</p>
                  <div className="flex flex-wrap gap-2">
                    {LOGISTICS_TYPES.map(t => (
                      <button key={t.key} onClick={() => addLogItem(t.key)}
                        className="text-xs font-medium px-3 py-2 rounded-md border border-gray-200 hover:border-gray-900 hover:text-gray-900 text-gray-600 transition-colors">
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setAddingLogistics(false)}
                    className="mt-3 text-xs text-gray-500 hover:text-gray-900">Annuler</button>
                </div>
              ) : (
                <button onClick={() => setAddingLogistics(true)}
                  className="w-full py-3 text-sm font-medium text-gray-500 hover:text-gray-900 border border-dashed border-gray-200 hover:border-gray-400 rounded-lg transition-colors">
                  + Ajouter un point logistique
                </button>
              )}
            </div>
          </div>

        </div>

        {/* ── Visite sur site ── */}
        <div className="mt-12">
          <div className="flex items-center justify-between mb-5">
            <button
              onClick={() => setVisitExpanded(v => !v)}
              className="flex items-center gap-3 group">
              <span className="font-semibold text-gray-900" style={{ fontSize: 20 }}>Visite sur site</span>
              {visitSummary && !visitExpanded && (
                <span className="text-xs text-green-600">complétée</span>
              )}
              <span className="text-gray-300 text-xs">{visitExpanded ? '▲' : '▼'}</span>
            </button>
            {visitExpanded && (
              <div className="flex items-center gap-2">
                {visitDirty && (
                  <button onClick={saveVisit} disabled={visitSaving}
                    className="text-xs font-medium px-3 py-1.5 rounded-md text-white disabled:opacity-60"
                    style={{ background: '#111827' }}>
                    {visitSaving ? 'Enregistrement…' : 'Enregistrer'}
                  </button>
                )}
                <button onClick={generateSummary} disabled={summaryLoading}
                  className="text-xs font-semibold px-3 py-1.5 rounded-full text-white disabled:opacity-50 transition-opacity"
                  style={{ background: PINK }}>
                  {summaryLoading ? '⏳ Génération...' : '✨ Résumé IA'}
                </button>
                <button onClick={() => window.print()}
                  className="no-print text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-200 text-gray-600 hover:border-gray-400 transition-colors">
                  🖨️ Imprimer
                </button>
              </div>
            )}
          </div>

          {visitExpanded && (
            <div className="space-y-4">
              {/* ── Form grid ── */}
              <div className="bg-white rounded-2xl border border-gray-100 p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                  {/* Date */}
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Date de visite</label>
                    <input type="date" value={siteVisit.date} style={{ fontSize: 14 }}
                      onChange={e => setVisitField('date', e.target.value)} className={inp} />
                  </div>

                  {/* Participants */}
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Participants</label>
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {responsibles.filter(r => r !== 'non défini' && r !== 'Sous-traitant').map(name => {
                        const active = (siteVisit.participants || []).includes(name)
                        return (
                          <button key={name} type="button" onClick={() => toggleParticipant(name)}
                            className="text-xs font-semibold px-2.5 py-1 rounded-full border transition-all"
                            style={{
                              borderColor: active ? PERSON_COLORS[name] : '#e5e7eb',
                              background: active ? PERSON_COLORS[name] + '18' : 'white',
                              color: active ? PERSON_COLORS[name] : '#9ca3af',
                            }}>{name}</button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Address */}
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-gray-400 mb-1">Adresse du lieu</label>
                    <input type="text" value={siteVisit.address} placeholder="Rue, ville..." style={{ fontSize: 14 }}
                      onChange={e => setVisitField('address', e.target.value)} className={inp} />
                  </div>

                  {/* Space dimensions */}
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Surface (m²)</label>
                    <input type="text" value={siteVisit.surface} placeholder="ex: 120" style={{ fontSize: 14 }}
                      onChange={e => setVisitField('surface', e.target.value)} className={inp} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Hauteur sous plafond (m)</label>
                    <input type="text" value={siteVisit.ceiling_height} placeholder="ex: 3.5" style={{ fontSize: 14 }}
                      onChange={e => setVisitField('ceiling_height', e.target.value)} className={inp} />
                  </div>

                  {/* Floor type */}
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Type de sol</label>
                    <select value={siteVisit.floor_type} onChange={e => setVisitField('floor_type', e.target.value)}
                      className={inp} style={{ fontSize: 14 }}>
                      <option value="">— Choisir —</option>
                      {['Parquet', 'Carrelage', 'Béton', 'Moquette', 'Résine', 'Marbre', 'Autre'].map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  {/* Access */}
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Accès livraison</label>
                    <input type="text" value={siteVisit.access_notes} placeholder="Monte-charge, quai, escalier..." style={{ fontSize: 14 }}
                      onChange={e => setVisitField('access_notes', e.target.value)} className={inp} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Horaires d'accès</label>
                    <input type="text" value={siteVisit.access_hours} placeholder="ex: 08h00 – 18h00" style={{ fontSize: 14 }}
                      onChange={e => setVisitField('access_hours', e.target.value)} className={inp} />
                  </div>

                  {/* Technical */}
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Électricité</label>
                    <input type="text" value={siteVisit.electricity} placeholder="ex: 2×16A, triphasé, nb prises..." style={{ fontSize: 14 }}
                      onChange={e => setVisitField('electricity', e.target.value)} className={inp} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Éclairage</label>
                    <input type="text" value={siteVisit.lighting} placeholder="ex: naturel + spots, modifiable..." style={{ fontSize: 14 }}
                      onChange={e => setVisitField('lighting', e.target.value)} className={inp} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Réseau / Wifi</label>
                    <input type="text" value={siteVisit.wifi} placeholder="ex: Wifi disponible, code: xxx" style={{ fontSize: 14 }}
                      onChange={e => setVisitField('wifi', e.target.value)} className={inp} />
                  </div>

                  {/* Contact */}
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Contact sur place</label>
                    <input type="text" value={siteVisit.contacts} placeholder="Nom + téléphone" style={{ fontSize: 14 }}
                      onChange={e => setVisitField('contacts', e.target.value)} className={inp} />
                  </div>

                  {/* Constraints */}
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-gray-400 mb-1">Contraintes particulières</label>
                    <textarea rows={2} value={siteVisit.constraints} style={{ fontSize: 14, resize: 'none' }}
                      placeholder="Horaires imposés, règles du lieu, travaux en cours..."
                      onChange={e => setVisitField('constraints', e.target.value)} className={inp} />
                  </div>

                  {/* Observations */}
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-gray-400 mb-1">Observations générales</label>
                    <textarea rows={3} value={siteVisit.observations} style={{ fontSize: 14, resize: 'none' }}
                      placeholder="Points d'attention, remarques de l'équipe..."
                      onChange={e => setVisitField('observations', e.target.value)} className={inp} />
                  </div>

                </div>
              </div>

              {/* ── AI Summary ── */}
              {(visitSummary || summaryLoading) && (
                <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: PINK + '44' }}>
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b" style={{ borderColor: PINK + '22', background: PINK + '08' }}>
                    <span className="text-sm">✨</span>
                    <span className="text-xs font-bold text-gray-700">Analyse IA</span>
                    {visitSummary && (
                      <button onClick={generateSummary} disabled={summaryLoading}
                        className="ml-auto text-xs text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50">
                        {summaryLoading ? '⏳' : '↻ Regénérer'}
                      </button>
                    )}
                  </div>
                  <div className="px-4 py-4">
                    {summaryLoading && !visitSummary ? (
                      <div className="flex items-center gap-2 text-sm text-gray-400">
                        <div className="w-4 h-4 rounded-full border-2 animate-spin flex-shrink-0"
                          style={{ borderColor: '#e5e7eb', borderTopColor: PINK }} />
                        Analyse en cours...
                      </div>
                    ) : (
                      <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{visitSummary}</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Fichiers du projet ── */}
        <div className="mt-12 no-print">
          <h2 className="font-semibold text-gray-900 mb-5" style={{ fontSize: 20 }}>Fichiers</h2>

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className="rounded-lg border border-dashed transition-colors mb-4 cursor-pointer"
            style={{ borderColor: isDragging ? '#111827' : '#e5e7eb', background: isDragging ? '#f9fafb' : 'white' }}
            onClick={() => document.getElementById('file-input-hidden').click()}>
            <input id="file-input-hidden" type="file" multiple accept="image/*,.pdf"
              className="hidden"
              onChange={e => Array.from(e.target.files).forEach(uploadFile)} />
            <div className="flex flex-col items-center justify-center py-10 gap-1.5">
              {uploading ? (
                <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: '#e5e7eb', borderTopColor: '#111827' }} />
              ) : (
                <>
                  <p className="text-sm text-gray-600 font-medium">Glisser des fichiers ici ou <span className="text-gray-900 underline">parcourir</span></p>
                  <p className="text-xs text-gray-400">Images (JPG, PNG, WEBP) · PDF · max 10 MB</p>
                </>
              )}
            </div>
          </div>

          {uploadError && (
            <p className="text-xs text-red-500 mb-2">{uploadError}</p>
          )}

          {/* File grid */}
          {files.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {files.map(f => {
                const isImage = f.mime_type?.startsWith('image/')
                const isPdf = f.mime_type === 'application/pdf'
                return (
                  <div key={f.id} className="group relative bg-white rounded-xl border border-gray-100 overflow-hidden">
                    {/* Thumbnail */}
                    <a href={f.url} target="_blank" rel="noreferrer" className="block">
                      {isImage ? (
                        <img src={f.url} alt={f.filename}
                          className="w-full h-32 object-cover" />
                      ) : (
                        <div className="w-full h-32 flex flex-col items-center justify-center gap-1 bg-gray-50">
                          <span className="text-3xl">📄</span>
                          <span className="text-xs text-gray-400 font-medium">PDF</span>
                        </div>
                      )}
                    </a>
                    {/* Label + delete */}
                    <div className="px-2 py-1.5 flex items-center gap-1">
                      <p className="text-xs text-gray-600 truncate flex-1">{f.filename}</p>
                      <button onClick={() => deleteFile(f)}
                        className="flex-shrink-0 text-gray-300 hover:text-red-400 transition-colors text-xs opacity-0 group-hover:opacity-100">✕</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Print form (hidden on screen, shown on print) ── */}
        <div className="print-form" style={{ padding: '2cm', fontFamily: 'Inter, sans-serif' }}>
          {/* Header */}
          <div style={{ borderBottom: '2px solid #111827', paddingBottom: '12px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p style={{ fontSize: '10px', fontWeight: 700, color: '#111827', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>Amazing Lab — Visite sur site</p>
                <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#111', margin: 0 }}>{project.name}</h1>
                {project.client && <p style={{ fontSize: '14px', color: '#6b7280', margin: '4px 0 0 0' }}>{project.client}</p>}
              </div>
              {project.deadline && (
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase' }}>Deadline</p>
                  <p style={{ fontSize: '14px', fontWeight: 600, color: '#374151' }}>{fmtDate(project.deadline)}</p>
                </div>
              )}
            </div>
          </div>

          {/* Form fields */}
          {[
            ['Date de visite', ''],
            ['Participants', ''],
            ['Adresse du lieu', ''],
          ].map(([label]) => (
            <PrintField key={label} label={label} />
          ))}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <PrintField label="Surface (m²)" />
            <PrintField label="Hauteur sous plafond (m)" />
            <PrintField label="Type de sol" />
          </div>

          {[
            'Accès livraison',
            'Horaires d\'accès',
            'Électricité',
            'Éclairage',
            'Réseau / Wifi',
            'Contact sur place',
          ].map(label => (
            <PrintField key={label} label={label} />
          ))}

          <PrintField label="Contraintes particulières" tall />
          <PrintField label="Observations générales" tall />

          <div style={{ marginTop: '32px', borderTop: '1px solid #e5e7eb', paddingTop: '12px', display: 'flex', justifyContent: 'space-between' }}>
            <p style={{ fontSize: '10px', color: '#9ca3af' }}>Amazing Lab © {new Date().getFullYear()}</p>
            <p style={{ fontSize: '10px', color: '#9ca3af' }}>amazinglab.ch</p>
          </div>
        </div>

      </div>
    </div>

    {/* ── Edit task modal ── */}
    {editingTask && (
      <EditTaskModal
        task={editingTask}
        currentUser={currentUser}
        onSave={handleTaskUpdated}
        onDelete={handleTaskDeleted}
        onClose={() => setEditingTask(null)}
      />
    )}
    </>
  )
}

// ── PrintField helper ──────────────────────────────────────────────────────────
function PrintField({ label, tall }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <p style={{ fontSize: '9px', fontWeight: 700, color: '#111827', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>{label}</p>
      <div style={{
        borderBottom: tall ? 'none' : '1px solid #d1d5db',
        border: tall ? '1px solid #d1d5db' : undefined,
        borderRadius: tall ? '6px' : undefined,
        minHeight: tall ? '60px' : '24px',
        width: '100%',
      }} />
    </div>
  )
}
