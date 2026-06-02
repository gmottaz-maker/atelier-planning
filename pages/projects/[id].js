import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import { useAuth } from '../_app'
import NavBar from '../../components/NavBar'
import { useResponsibles } from '../../lib/useResponsibles'
import useIsAdmin from '../../lib/useIsAdmin'
import { TASK_CATEGORIES } from '../../lib/taskCategories'
import TaskFormDrawer from '../../components/TaskFormDrawer'
import AutocompleteInput from '../../components/AutocompleteInput'
import { useSuggestions } from '../../lib/useSuggestions'
import AddressInput, { mapsViewUrl, mapsDirectionsUrl } from '../../components/AddressInput'

const PINK = '#111827'

// Champ quantité : step natif 0.5, mais le passage vide/0 → 0.5 (premier clic up) saute directement à 1
function QtyInput({ value, onChange, className }) {
  return (
    <input
      type="number"
      step="0.5"
      min="0"
      className={className}
      value={value ?? ''}
      onChange={e => {
        const raw = e.target.value
        const oldNum = parseFloat(value)
        const newNum = parseFloat(raw)
        const wasEmpty = value === '' || value == null || oldNum === 0
        if (wasEmpty && newNum === 0.5) { onChange('1'); return }
        onChange(raw)
      }}
    />
  )
}
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

// ─── AddCommandeForm ──────────────────────────────────────────────────────────
function AddCommandeForm({ projectId, currentUser, onAdd, onCancel }) {
  const { responsibles } = useResponsibles()
  const vendorSuggestions = useSuggestions('vendor')
  const [form, setForm] = useState({
    article: '',
    quantity: '',
    vendor: '',
    order_date: '',
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
          execution_date: form.expected_date || form.order_date || null,
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
  const lbl = "block text-[10px] text-gray-400 mb-0.5"
  return (
    <form onSubmit={handleSubmit} className="pt-2 pb-1 space-y-2">
      <div>
        <label className={lbl}>Article *</label>
        <input autoFocus type="text" value={form.article}
          onChange={e => setForm(f => ({ ...f, article: e.target.value }))}
          placeholder="ex: Vis M6 inox" className={inp} style={{ fontSize: 14 }} />
      </div>
      <div className="flex gap-2">
        <div className="w-24">
          <label className={lbl}>Quantité</label>
          <input type="text" value={form.quantity}
            onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
            placeholder="ex: 10" className={inp} style={{ fontSize: 14 }} />
        </div>
        <div className="flex-1">
          <label className={lbl}>Vendeur</label>
          <AutocompleteInput
            value={form.vendor}
            onChange={v => setForm(f => ({ ...f, vendor: v }))}
            suggestions={vendorSuggestions}
            placeholder="Nom du vendeur (autocomplete)"
            className={inp}
            style={{ fontSize: 14 }}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className={lbl}>Commandé le</label>
          <input type="date" value={form.order_date}
            onChange={e => setForm(f => ({ ...f, order_date: e.target.value }))}
            className={inp} style={{ fontSize: 14 }} />
        </div>
        <div className="flex-1">
          <label className={lbl}>Réception prévue</label>
          <input type="date" value={form.expected_date}
            onChange={e => setForm(f => ({ ...f, expected_date: e.target.value }))}
            className={inp} style={{ fontSize: 14 }} />
        </div>
      </div>
      <div>
        <label className={lbl}>Responsable</label>
        <select value={form.responsible}
          onChange={e => setForm(f => ({ ...f, responsible: e.target.value }))}
          className={inp} style={{ fontSize: 14 }}>
          {responsibles.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
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
  const [form, setForm] = useState({
    title: '',
    subcontractor: '',
    drop_date: '',
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
          execution_date: form.expected_pickup_date || form.drop_date || null,
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
      <AutocompleteInput
        value={form.subcontractor}
        onChange={v => setForm(f => ({ ...f, subcontractor: v }))}
        suggestions={subSuggestions}
        placeholder="Sous-traitant"
        className={inp}
        style={{ fontSize: 14 }}
      />
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
  const isAdmin = useIsAdmin()

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
  const [addingCategory, setAddingCategory] = useState(null) // 'commande' | 'sous_traitance' (inline)
  const [drawerCategory, setDrawerCategory] = useState(null) // catégorie pour le drawer générique
  const [editingTask, setEditingTask]       = useState(null) // task object being edited

  // Files state
  const [files, setFiles] = useState([])
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  // Updates state
  const [updates, setUpdates] = useState([])
  const [newUpdate, setNewUpdate] = useState('')
  const [newUpdateImage, setNewUpdateImage] = useState(null) // { base64, mime_type, filename, preview }
  const [postingUpdate, setPostingUpdate] = useState(false)
  const [updateError, setUpdateError] = useState('')
  const [updateDragging, setUpdateDragging] = useState(false)

  // Quote state — structure: { management:[], items:[{ _uid, name, purchases:[], labor:[] }], subcontracting:[], logistics:[], general_margin:'' }
  // general_margin (%) s'applique aux achats / sous-traitance / logistique sauf si une marge spécifique est définie sur la ligne
  const EMPTY_QUOTE = { management: [], items: [], subcontracting: [], logistics: [], general_margin: '' }
  const [quote, setQuote] = useState(EMPTY_QUOTE)
  const [quoteDirty, setQuoteDirty] = useState(false)
  const [quoteSaving, setQuoteSaving] = useState(false)
  const [quoteExpanded, setQuoteExpanded] = useState(false)

  // kDrive preview state
  const [kdriveItems, setKdriveItems] = useState([])
  const [kdrivePath, setKdrivePath]   = useState([])   // [{ id, name }]
  const [kdriveLoading, setKdriveLoading] = useState(false)
  const [kdriveError, setKdriveError] = useState('')

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
      fetch(`/api/projects/${id}/updates`).then(r => r.json()),
    ]).then(([proj, allTasks, fileList, updateList]) => {
      if (Array.isArray(updateList)) setUpdates(updateList)
      if (proj && !proj.error) {
        setProject(proj)
        setLogistics(initLogistics(proj))
        if (proj.site_visit_data && Object.keys(proj.site_visit_data).length > 0) {
          setSiteVisit(v => ({ ...v, ...proj.site_visit_data }))
          setVisitExpanded(true)
        }
        if (proj.site_visit_summary) setVisitSummary(proj.site_visit_summary)
        if (proj.quote_data) {
          const q = proj.quote_data
          // Nouveau format : { management, items, subcontracting, logistics }
          if (Array.isArray(q.items) || Array.isArray(q.management)) {
            const totalLines = (q.management?.length || 0) + (q.items?.length || 0)
              + (q.subcontracting?.length || 0) + (q.logistics?.length || 0)
            if (totalLines > 0) {
              setQuote({
                management:     q.management || [],
                items:          q.items || [],
                subcontracting: q.subcontracting || [],
                logistics:      q.logistics || [],
                general_margin: q.general_margin ?? '',
              })
              setQuoteExpanded(true)
            }
          // Migration silencieuse depuis l'ancien format { purchases, labor, logistics }
          } else if (q.purchases?.length || q.labor?.length || q.logistics?.length) {
            const migrated = {
              management: [],
              items: (q.purchases?.length || q.labor?.length)
                ? [{
                    _uid: `i_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
                    name: 'Général',
                    purchases: q.purchases || [],
                    labor:     q.labor || [],
                  }]
                : [],
              subcontracting: [],
              logistics: q.logistics || [],
              general_margin: '',
            }
            setQuote(migrated)
            setQuoteDirty(true)  // forcer un re-save dans le nouveau format
            setQuoteExpanded(true)
          }
        }
      }
      if (Array.isArray(allTasks)) {
        setTasks(allTasks.filter(t => String(t.project_id) === String(id)))
      }
      if (Array.isArray(fileList)) setFiles(fileList)
    }).catch(console.error)
    .finally(() => setLoading(false))
  }, [id, currentUser])

  // Charger l'aperçu kDrive dès que le projet est chargé
  useEffect(() => {
    if (project && project.kdrive_folder_id) {
      setKdrivePath([])
      loadKdrive(null)
    }
  }, [project?.id, project?.kdrive_folder_id])

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

  // ── Quote helpers ────────────────────────────────────────────────────────
  function genRowUid() { return `r_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` }

  function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n }
  // Marge effective : marge spécifique de la ligne si définie, sinon marge générale du devis
  function effectiveMargin(r) {
    if (r?.margin !== '' && r?.margin != null) return num(r.margin)
    return num(quote.general_margin)
  }
  function purchaseTotal(r)  { return num(r.unit_price) * num(r.quantity) }
  function purchaseBilled(r) { return purchaseTotal(r) * (1 + effectiveMargin(r) / 100) }
  function serviceTotal(r)   { return num(r.rate) * num(r.quantity) }
  function serviceBilled(r)  { return serviceTotal(r) * (1 + effectiveMargin(r) / 100) }
  function fmtCHF(n) { return new Intl.NumberFormat('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) }

  function genItemUid() { return `i_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` }
  const QUOTE_UNITS = ['heure(s)', 'jour(s)', 'ml', 'm²', 'km', 'PAN', 'pce']
  function emptyPurchaseRow() { return { _uid: genRowUid(), description: '', dimension: '', unit_price: '', quantity: '', unit: '', margin: '' } }
  function emptyLaborRow()    { return { _uid: genRowUid(), description: '', rate: '100', quantity: '', unit: '' } }
  function emptyLogisticsRow(){ return { _uid: genRowUid(), trajet: '', description: '', rate: '', quantity: '', unit: '', margin: '' } }
  function emptySubcontractingRow(){ return { _uid: genRowUid(), item: '', description: '', rate: '', quantity: '', unit: '', margin: '' } }

  // ── Gestion (lignes de main d'œuvre globales) ──
  function addManagementRow() {
    setQuote(q => ({ ...q, management: [...q.management, emptyLaborRow()] }))
    setQuoteDirty(true)
  }
  function updateManagementRow(idx, field, value) {
    setQuote(q => ({ ...q, management: q.management.map((r, i) => i === idx ? { ...r, [field]: value } : r) }))
    setQuoteDirty(true)
  }
  function removeManagementRow(idx) {
    setQuote(q => ({ ...q, management: q.management.filter((_, i) => i !== idx) }))
    setQuoteDirty(true)
  }

  // ── Logistique ──
  function addLogisticsRow() {
    setQuote(q => ({ ...q, logistics: [...q.logistics, emptyLogisticsRow()] }))
    setQuoteDirty(true)
  }
  function updateLogisticsRow(idx, field, value) {
    setQuote(q => ({ ...q, logistics: q.logistics.map((r, i) => i === idx ? { ...r, [field]: value } : r) }))
    setQuoteDirty(true)
  }
  function removeLogisticsRow(idx) {
    setQuote(q => ({ ...q, logistics: q.logistics.filter((_, i) => i !== idx) }))
    setQuoteDirty(true)
  }

  // ── Sous-traitance ──
  function addSubcontractingRow() {
    setQuote(q => ({ ...q, subcontracting: [...(q.subcontracting || []), emptySubcontractingRow()] }))
    setQuoteDirty(true)
  }
  function updateSubcontractingRow(idx, field, value) {
    setQuote(q => ({ ...q, subcontracting: (q.subcontracting || []).map((r, i) => i === idx ? { ...r, [field]: value } : r) }))
    setQuoteDirty(true)
  }
  function removeSubcontractingRow(idx) {
    setQuote(q => ({ ...q, subcontracting: (q.subcontracting || []).filter((_, i) => i !== idx) }))
    setQuoteDirty(true)
  }

  // ── Items (Bar, Backbar, etc.) ──
  function addItem() {
    setQuote(q => ({
      ...q,
      items: [...q.items, { _uid: genItemUid(), name: '', purchases: [], labor: [] }],
    }))
    setQuoteDirty(true)
  }
  function updateItemName(idx, name) {
    setQuote(q => ({ ...q, items: q.items.map((it, i) => i === idx ? { ...it, name } : it) }))
    setQuoteDirty(true)
  }
  function removeItem(idx) {
    setQuote(q => ({ ...q, items: q.items.filter((_, i) => i !== idx) }))
    setQuoteDirty(true)
  }
  function addItemRow(itemIdx, kind) {
    const empty = kind === 'purchases' ? emptyPurchaseRow() : emptyLaborRow()
    setQuote(q => ({
      ...q,
      items: q.items.map((it, i) => i === itemIdx ? { ...it, [kind]: [...(it[kind] || []), empty] } : it),
    }))
    setQuoteDirty(true)
  }
  function updateItemRow(itemIdx, kind, rowIdx, field, value) {
    setQuote(q => ({
      ...q,
      items: q.items.map((it, i) => i === itemIdx
        ? { ...it, [kind]: it[kind].map((r, j) => j === rowIdx ? { ...r, [field]: value } : r) }
        : it),
    }))
    setQuoteDirty(true)
  }
  function removeItemRow(itemIdx, kind, rowIdx) {
    setQuote(q => ({
      ...q,
      items: q.items.map((it, i) => i === itemIdx
        ? { ...it, [kind]: it[kind].filter((_, j) => j !== rowIdx) }
        : it),
    }))
    setQuoteDirty(true)
  }
  function itemTotal(it) {
    const p = (it.purchases || []).reduce((s, r) => s + purchaseBilled(r), 0)
    const l = (it.labor || []).reduce((s, r) => s + serviceTotal(r), 0)
    return p + l
  }

  async function saveQuote() {
    setQuoteSaving(true)
    try {
      const r = await fetch(`/api/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-actor': currentUser },
        body: JSON.stringify({ ...project, quote_data: quote }),
      })
      if (r.ok) setQuoteDirty(false)
    } finally {
      setQuoteSaving(false)
    }
  }

  // Auto-save: 5 min après une modification, on enregistre silencieusement
  const latestQuote   = useRef(quote)
  const latestProject = useRef(project)
  useEffect(() => { latestQuote.current   = quote   }, [quote])
  useEffect(() => { latestProject.current = project }, [project])
  useEffect(() => {
    if (!quoteDirty || !project) return
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/projects/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'x-actor': currentUser },
          body: JSON.stringify({ ...latestProject.current, quote_data: latestQuote.current }),
        })
        if (r.ok) setQuoteDirty(false)
      } catch (e) { console.warn('Auto-save quote failed:', e?.message) }
    }, 5 * 60 * 1000)
    return () => clearTimeout(t)
  }, [quoteDirty, project, id, currentUser])

  // ── kDrive preview helpers ───────────────────────────────────────────────
  const KDRIVE_DRIVE_ID = 1936508 // pour bâtir les liens externes (drive Infomaniak)

  async function loadKdrive(folderId) {
    setKdriveLoading(true); setKdriveError('')
    try {
      const url = folderId
        ? `/api/projects/${id}/kdrive-listing?folderId=${folderId}`
        : `/api/projects/${id}/kdrive-listing`
      const r = await fetch(url)
      const data = await r.json()
      if (data.error) { setKdriveError(data.error); setKdriveItems([]); return }
      setKdriveItems(data.items || [])
    } catch (e) {
      setKdriveError('Erreur kDrive')
      setKdriveItems([])
    } finally {
      setKdriveLoading(false)
    }
  }

  function enterKdriveFolder(folder) {
    setKdrivePath(p => [...p, { id: folder.id, name: folder.name }])
    loadKdrive(folder.id)
  }

  function kdriveGoTo(index) {
    const next = kdrivePath.slice(0, index + 1)
    setKdrivePath(next)
    loadKdrive(next.length > 0 ? next[next.length - 1].id : null)
  }

  function fmtSize(b) {
    if (!b) return ''
    if (b < 1024) return `${b} B`
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
    return `${(b / (1024 * 1024)).toFixed(1)} MB`
  }

  // ── Updates helpers ──────────────────────────────────────────────────────
  async function pickUpdateImage(file) {
    if (!file) return
    if (!file.type.startsWith('image/')) { setUpdateError('Image uniquement'); return }
    if (file.size > 10 * 1024 * 1024) { setUpdateError('Image trop grande (max 10 MB)'); return }
    setUpdateError('')
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = e => resolve(e.target.result)
      r.onerror = reject
      r.readAsDataURL(file)
    })
    setNewUpdateImage({
      base64: dataUrl.split(',')[1],
      mime_type: file.type,
      filename: `update_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`,
      preview: dataUrl,
    })
  }

  async function postUpdate() {
    if (!newUpdate.trim()) return
    setPostingUpdate(true)
    setUpdateError('')
    try {
      const body = {
        author: currentUser || 'Inconnu',
        content: newUpdate.trim(),
        image: newUpdateImage ? {
          base64: newUpdateImage.base64,
          mime_type: newUpdateImage.mime_type,
          filename: newUpdateImage.filename,
        } : null,
      }
      const r = await fetch(`/api/projects/${id}/updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await r.json()
      if (data.error) { setUpdateError(data.error); return }
      setUpdates(prev => [data, ...prev])
      setNewUpdate('')
      setNewUpdateImage(null)
    } catch (e) {
      setUpdateError('Erreur lors de la publication')
    } finally {
      setPostingUpdate(false)
    }
  }

  async function deleteUpdate(updateId) {
    if (!confirm('Supprimer cette mise à jour ?')) return
    setUpdates(prev => prev.filter(u => u.id !== updateId))
    await fetch(`/api/projects/${id}/updates`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updateId }),
    })
  }

  function fmtRelative(iso) {
    const d = new Date(iso)
    const diff = (Date.now() - d.getTime()) / 1000
    if (diff < 60)      return `à l'instant`
    if (diff < 3600)    return `il y a ${Math.floor(diff / 60)} min`
    if (diff < 86400)   return `il y a ${Math.floor(diff / 3600)} h`
    if (diff < 172800)  return `hier`
    if (diff < 604800)  return `il y a ${Math.floor(diff / 86400)} j`
    return d.toLocaleDateString('fr-CH', { day: '2-digit', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })
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

      <div className="w-full px-4 md:px-10 py-6 md:py-10" style={{ maxWidth: 1800, margin: '0 auto' }}>

        {/* ── Hero header ── */}
        <div className="mb-8 md:mb-12 bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="h-2 w-full" style={{ background: color }} />
          <div className="px-5 md:px-10 py-6 md:py-8">
            <div className="flex flex-col md:flex-row items-start gap-6 md:gap-8">
              <div className="flex-1 min-w-0">
                <p className="text-xs uppercase tracking-wider text-gray-400 mb-2">Projet</p>
                <h1 className="font-semibold text-gray-900 leading-tight tracking-tight" style={{ fontSize: 'clamp(24px, 6vw, 36px)' }}>
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
              <div className="flex flex-col items-stretch gap-5 flex-shrink-0 w-full md:w-auto" style={{ minWidth: 260 }}>
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

        {/* ── Mises à jour ── */}
        <div className="mb-8 md:mb-12">
          <div className="flex items-baseline justify-between mb-5">
            <h2 className="font-semibold text-gray-900" style={{ fontSize: 20 }}>Mises à jour</h2>
            <span className="text-xs text-gray-500">{updates.length} note{updates.length > 1 ? 's' : ''}</span>
          </div>

          {/* Form */}
          <div
            className="bg-white rounded-2xl border p-4 md:p-5 mb-4 transition-colors"
            style={{ borderColor: updateDragging ? '#111827' : '#e5e7eb', background: updateDragging ? '#f9fafb' : 'white' }}
            onDragOver={e => { e.preventDefault(); setUpdateDragging(true) }}
            onDragLeave={() => setUpdateDragging(false)}
            onDrop={e => {
              e.preventDefault(); setUpdateDragging(false)
              const file = e.dataTransfer.files?.[0]
              if (file && file.type.startsWith('image/')) pickUpdateImage(file)
            }}>
            <textarea
              value={newUpdate}
              onChange={e => setNewUpdate(e.target.value)}
              placeholder="Téléphone client, mail, changement de scope, photo chantier… (glisser-déposer une image OK)"
              rows={3}
              className="w-full text-sm text-gray-900 placeholder-gray-400 border-0 focus:outline-none resize-y leading-relaxed bg-transparent"
              style={{ minHeight: 64 }}
            />
            {newUpdateImage && (
              <div className="mt-3 relative inline-block">
                <img src={newUpdateImage.preview} alt="" style={{ maxHeight: 160, borderRadius: 8 }} />
                <button
                  onClick={() => setNewUpdateImage(null)}
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white text-xs flex items-center justify-center hover:bg-black"
                  type="button">×</button>
              </div>
            )}
            {updateError && <p className="text-xs text-red-500 mt-2">{updateError}</p>}
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
              <label className="text-xs font-medium text-gray-500 hover:text-gray-900 cursor-pointer flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="M21 15l-5-5L5 21" />
                </svg>
                Joindre une image
                <input type="file" accept="image/*" className="hidden"
                  onChange={e => { pickUpdateImage(e.target.files?.[0]); e.target.value = '' }} />
              </label>
              <button
                onClick={postUpdate}
                disabled={postingUpdate || !newUpdate.trim()}
                className="px-4 py-1.5 rounded-md text-sm font-medium text-white disabled:opacity-40"
                style={{ background: '#111827' }}>
                {postingUpdate ? 'Publication…' : 'Publier'}
              </button>
            </div>
          </div>

          {/* Timeline */}
          {updates.length === 0 ? (
            <p className="text-sm text-gray-400 px-2">Aucune mise à jour. Note ici les téléphones, mails ou décisions au fil du projet.</p>
          ) : (
            <ol className="space-y-3">
              {updates.map(u => {
                const initials = (u.author || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
                const c = PERSON_COLORS[u.author] || '#9ca3af'
                return (
                  <li key={u.id} className="bg-white rounded-2xl border border-gray-200 p-4 md:p-5">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0"
                        style={{ background: c, fontSize: 13 }}>
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-3">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="font-semibold text-gray-900" style={{ fontSize: 14 }}>{u.author}</span>
                            <span className="text-xs text-gray-400">{fmtRelative(u.created_at)}</span>
                          </div>
                          {currentUser === 'Guillaume' && (
                            <button onClick={() => deleteUpdate(u.id)}
                              className="text-xs text-gray-300 hover:text-red-500 flex-shrink-0">
                              Supprimer
                            </button>
                          )}
                        </div>
                        <p className="mt-1.5 text-gray-700 whitespace-pre-wrap leading-relaxed" style={{ fontSize: 14 }}>
                          {u.content}
                        </p>
                        {u.image_kdrive_id && (
                          <div className="mt-3">
                            <a href={`/api/update-image?updateId=${u.id}`} target="_blank" rel="noopener">
                              <img src={`/api/update-image?updateId=${u.id}`} alt={u.image_filename || ''}
                                style={{ maxHeight: 320, maxWidth: '100%', borderRadius: 10, border: '1px solid #e5e7eb' }} />
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
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

                const isSpecial = cat.key === 'commande' || cat.key === 'sous_traitance'
                const openAdd = () => isSpecial ? setAddingCategory(cat.key) : setDrawerCategory(cat.key)

                // Catégorie vide → ligne discrète repliée
                if (isEmpty) {
                  return (
                    <button key={cat.key}
                      onClick={openAdd}
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
                        onClick={() => isSpecial ? setAddingCategory(isAdding ? null : cat.key) : openAdd()}
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
                      {isAdding && cat.key === 'commande' && (
                        <AddCommandeForm
                          projectId={project.id}
                          currentUser={currentUser}
                          onAdd={handleTaskAdded}
                          onCancel={() => setAddingCategory(null)}
                        />
                      )}
                      {isAdding && cat.key === 'sous_traitance' && (
                        <AddSousTraitanceForm
                          projectId={project.id}
                          currentUser={currentUser}
                          onAdd={handleTaskAdded}
                          onCancel={() => setAddingCategory(null)}
                        />
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

        {/* ── Offre ── */}
        <div className="mt-12 no-print">
          {(() => {
            const managementTotal     = quote.management.reduce((s, r) => s + serviceTotal(r), 0)
            const itemsTotal          = quote.items.reduce((s, it) => s + itemTotal(it), 0)
            const subcontractingTotal = (quote.subcontracting || []).reduce((s, r) => s + serviceBilled(r), 0)
            const logisticsTotal      = quote.logistics.reduce((s, r) => s + serviceBilled(r), 0)
            const grandTotal          = managementTotal + itemsTotal + subcontractingTotal + logisticsTotal

            const numCell = "px-2 py-1.5 text-sm bg-transparent text-right tabular-nums w-full focus:outline-none focus:bg-white focus:ring-1 focus:ring-gray-300 rounded"
            const txtCell = "px-2 py-1.5 text-sm bg-transparent w-full focus:outline-none focus:bg-white focus:ring-1 focus:ring-gray-300 rounded"
            const th = "px-3 py-2 text-left text-xs font-semibold text-gray-700 bg-gray-100"
            const td = "border-t border-gray-100 align-middle"
            const tdRO = "px-3 py-1.5 text-sm text-right text-gray-600 tabular-nums"

            return (
              <>
                <div className="flex items-center justify-between mb-3">
                  <button onClick={() => setQuoteExpanded(v => !v)}
                    className="flex items-center gap-2 group">
                    <h2 className="font-semibold text-gray-900" style={{ fontSize: 20 }}>Offre</h2>
                    <span className="text-gray-400 group-hover:text-gray-700 text-sm">{quoteExpanded ? '▾' : '▸'}</span>
                    {!quoteExpanded && grandTotal > 0 && (
                      <span className="text-sm text-gray-500 ml-2">· Total {fmtCHF(grandTotal)} CHF</span>
                    )}
                  </button>
                  {quoteExpanded && (
                    <div className="flex items-center gap-3">
                      {quoteDirty && <span className="text-xs text-amber-600">non enregistré</span>}
                      <button onClick={saveQuote} disabled={!quoteDirty || quoteSaving}
                        className="px-4 py-1.5 rounded-md text-sm font-medium text-white disabled:opacity-40"
                        style={{ background: '#111827' }}>
                        {quoteSaving ? 'Enregistrement…' : 'Enregistrer'}
                      </button>
                      <a href={`/projects/${id}/devis`} target="_blank" rel="noopener"
                        className="px-4 py-1.5 rounded-md text-sm font-medium border border-gray-200 text-gray-700 hover:border-gray-400 transition-colors inline-flex items-center gap-1.5"
                        title={quoteDirty ? 'Enregistre d\'abord pour inclure les dernières modifs' : 'Ouvrir le devis PDF'}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                        Devis PDF
                      </a>
                      {isAdmin && (
                        <a href={`/factures-emises?from=${id}`}
                          className="px-4 py-1.5 rounded-md text-sm font-medium text-white inline-flex items-center gap-1.5"
                          style={{ background: '#111827' }}
                          title={quoteDirty ? 'Enregistre d\'abord' : 'Convertir en facture officielle avec QR-bill'}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="4" width="18" height="16" rx="2" />
                            <path d="M3 10h18" />
                          </svg>
                          Convertir en facture
                        </a>
                      )}
                    </div>
                  )}
                </div>

                {quoteExpanded && (
                  <div className="space-y-6">
                    {/* ── Marge générale ── */}
                    <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
                      <span className="text-sm font-medium text-amber-900">Marge générale</span>
                      <input
                        type="number"
                        step="0.1"
                        className="px-3 py-1.5 border border-amber-300 rounded-md text-sm w-24 text-right bg-white tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-400"
                        placeholder="0"
                        value={quote.general_margin ?? ''}
                        onChange={e => { setQuote(q => ({ ...q, general_margin: e.target.value })); setQuoteDirty(true) }}
                      />
                      <span className="text-sm text-amber-900">%</span>
                      <span className="text-xs text-amber-800/80 ml-2">S'applique aux achats, sous-traitance et logistique. Une marge spécifique sur une ligne prend le dessus.</span>
                    </div>

                    {/* ── Gestion de projet / visuel ── */}
                    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between" style={{ background: '#eef2ff' }}>
                        <h3 className="font-semibold" style={{ fontSize: 15, color: '#3730a3' }}>Gestion de projet / visuel</h3>
                        <button onClick={addManagementRow}
                          className="text-xs font-medium text-indigo-700 hover:text-indigo-900">+ Ligne</button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full" style={{ minWidth: 900 }}>
                          <thead>
                            <tr>
                              <th className={th} style={{ width: 160 }}>Item</th>
                              <th className={th}>Description</th>
                              <th className={th + ' text-right'} style={{ width: 110 }}>Prix</th>
                              <th className={th + ' text-right'} style={{ width: 80 }}>Qté</th>
                              <th className={th} style={{ width: 100 }}>Unité</th>
                              <th className={th + ' text-right'} style={{ width: 130 }}>Total</th>
                              <th className={th} style={{ width: 32 }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {quote.management.length === 0 ? (
                              <tr><td colSpan={7} className="text-center text-sm text-gray-400 py-6">Aucune ligne. Clique "+ Ligne" pour ajouter.</td></tr>
                            ) : quote.management.map((r, i) => (
                              <tr key={r._uid || i} className="group hover:bg-gray-50">
                                <td className={td}><input className={txtCell} style={{ background: '#f3f4f6', fontWeight: 500 }} value={r.item || ''} onChange={e => updateManagementRow(i, 'item', e.target.value)} /></td>
                                <td className={td}><input className={txtCell} value={r.description || ''} onChange={e => updateManagementRow(i, 'description', e.target.value)} /></td>
                                <td className={td}><input type="number" step="0.01" className={numCell} value={r.rate || ''} onChange={e => updateManagementRow(i, 'rate', e.target.value)} /></td>
                                <td className={td}><QtyInput className={numCell} value={r.quantity} onChange={v => updateManagementRow(i, 'quantity', v)} /></td>
                                <td className={td}><select className={txtCell} value={r.unit || ''} onChange={e => updateManagementRow(i, 'unit', e.target.value)}><option value="">—</option>{QUOTE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select></td>
                                <td className={tdRO + ' ' + td + ' font-semibold text-gray-900'}>{fmtCHF(serviceTotal(r))}</td>
                                <td className={td + ' text-center'}>
                                  <button onClick={() => removeManagementRow(i)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 text-sm">×</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          {quote.management.length > 0 && (
                            <tfoot>
                              <tr>
                                <td colSpan={5} className="px-3 py-2 text-right text-xs font-medium text-gray-500 bg-gray-50">Sous-total gestion</td>
                                <td className="px-3 py-2 text-right text-sm font-bold text-gray-900 tabular-nums bg-gray-50">{fmtCHF(managementTotal)}</td>
                                <td className="bg-gray-50"></td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    </div>

                    {/* ── Items (Bar, Backbar, etc.) ── */}
                    {quote.items.map((it, itemIdx) => {
                      const purchSub = (it.purchases || []).reduce((s, r) => s + purchaseBilled(r), 0)
                      const laborSub = (it.labor || []).reduce((s, r) => s + serviceTotal(r), 0)
                      const subTotal = purchSub + laborSub
                      return (
                        <div key={it._uid || itemIdx} className="bg-white rounded-2xl border border-emerald-200 overflow-hidden">
                          <div className="px-5 py-3 border-b border-emerald-100 flex items-center justify-between gap-3" style={{ background: '#ecfdf5' }}>
                            <input
                              className="flex-1 px-2 py-1 text-base font-semibold bg-transparent focus:outline-none focus:bg-white focus:ring-1 focus:ring-emerald-400 rounded"
                              style={{ color: '#065f46' }}
                              placeholder="Nom de l'item (ex: Bar, Backbar…)"
                              value={it.name || ''}
                              onChange={e => updateItemName(itemIdx, e.target.value)}
                            />
                            <span className="text-sm font-semibold tabular-nums whitespace-nowrap" style={{ color: '#065f46' }}>{fmtCHF(subTotal)} CHF</span>
                            <button onClick={() => { if (confirm(`Supprimer l'item "${it.name || 'sans nom'}" ?`)) removeItem(itemIdx) }}
                              className="text-emerald-600 hover:text-red-500 text-sm" title="Supprimer cet item">✕</button>
                          </div>

                          {/* Achats de l'item */}
                          <div className="border-b border-gray-100">
                            <div className="px-5 py-2 flex items-center justify-between bg-white">
                              <h4 className="font-medium text-gray-700 text-sm">Achats (matériaux)</h4>
                              <button onClick={() => addItemRow(itemIdx, 'purchases')}
                                className="text-xs font-medium text-gray-500 hover:text-gray-900">+ Ligne</button>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full" style={{ minWidth: 1090 }}>
                                <thead>
                                  <tr>
                                    <th className={th}>Description</th>
                                    <th className={th} style={{ width: 130 }}>Dimension</th>
                                    <th className={th + ' text-right'} style={{ width: 110 }}>Prix d'achat</th>
                                    <th className={th + ' text-right'} style={{ width: 80 }}>Qté</th>
                                    <th className={th} style={{ width: 100 }}>Unité</th>
                                    <th className={th + ' text-right'} style={{ width: 110 }}>Total</th>
                                    <th className={th + ' text-right'} style={{ width: 80 }}>Marge %</th>
                                    <th className={th + ' text-right'} style={{ width: 130 }}>Total facturé</th>
                                    <th className={th} style={{ width: 32 }}></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(it.purchases || []).length === 0 ? (
                                    <tr><td colSpan={9} className="text-center text-sm text-gray-400 py-4">Aucun achat.</td></tr>
                                  ) : it.purchases.map((r, i) => (
                                    <tr key={r._uid || i} className="group hover:bg-gray-50">
                                      <td className={td}><input className={txtCell} value={r.description || ''} onChange={e => updateItemRow(itemIdx, 'purchases', i, 'description', e.target.value)} /></td>
                                      <td className={td}><input className={txtCell} placeholder="ex: 200×120×40" value={r.dimension || ''} onChange={e => updateItemRow(itemIdx, 'purchases', i, 'dimension', e.target.value)} /></td>
                                      <td className={td}><input type="number" step="0.01" className={numCell} value={r.unit_price || ''} onChange={e => updateItemRow(itemIdx, 'purchases', i, 'unit_price', e.target.value)} /></td>
                                      <td className={td}><QtyInput className={numCell} value={r.quantity} onChange={v => updateItemRow(itemIdx, 'purchases', i, 'quantity', v)} /></td>
                                      <td className={td}><select className={txtCell} value={r.unit || ''} onChange={e => updateItemRow(itemIdx, 'purchases', i, 'unit', e.target.value)}><option value="">—</option>{QUOTE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select></td>
                                      <td className={tdRO + ' ' + td}>{fmtCHF(purchaseTotal(r))}</td>
                                      <td className={td}><input type="number" step="0.1" className={numCell} value={r.margin || ''} placeholder={quote.general_margin || ''} onChange={e => updateItemRow(itemIdx, 'purchases', i, 'margin', e.target.value)} /></td>
                                      <td className={tdRO + ' ' + td + ' font-semibold text-gray-900'}>{fmtCHF(purchaseBilled(r))}</td>
                                      <td className={td + ' text-center'}>
                                        <button onClick={() => removeItemRow(itemIdx, 'purchases', i)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 text-sm">×</button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                                {(it.purchases || []).length > 0 && (
                                  <tfoot>
                                    <tr>
                                      <td colSpan={7} className="px-3 py-2 text-right text-xs font-medium text-gray-500 bg-gray-50">Sous-total achats</td>
                                      <td className="px-3 py-2 text-right text-sm font-bold text-gray-900 tabular-nums bg-gray-50">{fmtCHF(purchSub)}</td>
                                      <td className="bg-gray-50"></td>
                                    </tr>
                                  </tfoot>
                                )}
                              </table>
                            </div>
                          </div>

                          {/* Main d'œuvre de l'item */}
                          <div>
                            <div className="px-5 py-2 flex items-center justify-between bg-white">
                              <h4 className="font-medium text-gray-700 text-sm">Main d'œuvre (découpe, peinture…)</h4>
                              <button onClick={() => addItemRow(itemIdx, 'labor')}
                                className="text-xs font-medium text-gray-500 hover:text-gray-900">+ Ligne</button>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full" style={{ minWidth: 900 }}>
                                <thead>
                                  <tr>
                                    <th className={th}>Description</th>
                                    <th className={th + ' text-right'} style={{ width: 110 }}>Prix</th>
                                    <th className={th + ' text-right'} style={{ width: 80 }}>Qté</th>
                                    <th className={th} style={{ width: 100 }}>Unité</th>
                                    <th className={th + ' text-right'} style={{ width: 130 }}>Total</th>
                                    <th className={th} style={{ width: 32 }}></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(it.labor || []).length === 0 ? (
                                    <tr><td colSpan={6} className="text-center text-sm text-gray-400 py-4">Aucune main d'œuvre.</td></tr>
                                  ) : it.labor.map((r, i) => (
                                    <tr key={r._uid || i} className="group hover:bg-gray-50">
                                      <td className={td}><input className={txtCell} value={r.description || ''} onChange={e => updateItemRow(itemIdx, 'labor', i, 'description', e.target.value)} /></td>
                                      <td className={td}><input type="number" step="0.01" className={numCell} value={r.rate || ''} onChange={e => updateItemRow(itemIdx, 'labor', i, 'rate', e.target.value)} /></td>
                                      <td className={td}><QtyInput className={numCell} value={r.quantity} onChange={v => updateItemRow(itemIdx, 'labor', i, 'quantity', v)} /></td>
                                      <td className={td}><select className={txtCell} value={r.unit || ''} onChange={e => updateItemRow(itemIdx, 'labor', i, 'unit', e.target.value)}><option value="">—</option>{QUOTE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select></td>
                                      <td className={tdRO + ' ' + td + ' font-semibold text-gray-900'}>{fmtCHF(serviceTotal(r))}</td>
                                      <td className={td + ' text-center'}>
                                        <button onClick={() => removeItemRow(itemIdx, 'labor', i)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 text-sm">×</button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                                {(it.labor || []).length > 0 && (
                                  <tfoot>
                                    <tr>
                                      <td colSpan={4} className="px-3 py-2 text-right text-xs font-medium text-gray-500 bg-gray-50">Sous-total main d'œuvre</td>
                                      <td className="px-3 py-2 text-right text-sm font-bold text-gray-900 tabular-nums bg-gray-50">{fmtCHF(laborSub)}</td>
                                      <td className="bg-gray-50"></td>
                                    </tr>
                                  </tfoot>
                                )}
                              </table>
                            </div>
                          </div>
                        </div>
                      )
                    })}

                    {/* Bouton ajouter un item */}
                    <button onClick={addItem}
                      className="w-full py-3 rounded-2xl border-2 border-dashed border-gray-300 text-sm font-medium text-gray-600 hover:border-gray-900 hover:text-gray-900 transition-colors">
                      + Ajouter un item
                    </button>

                    {/* ── Sous-traitance ── */}
                    <div className="bg-white rounded-2xl border border-orange-200 overflow-hidden">
                      <div className="px-5 py-3 border-b border-orange-100 flex items-center justify-between" style={{ background: '#fff7ed' }}>
                        <h3 className="font-semibold" style={{ fontSize: 15, color: '#9a3412' }}>Sous-traitance</h3>
                        <button onClick={addSubcontractingRow}
                          className="text-xs font-medium text-orange-700 hover:text-orange-900">+ Ligne</button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full" style={{ minWidth: 980 }}>
                          <thead>
                            <tr>
                              <th className={th} style={{ width: 160 }}>Item</th>
                              <th className={th}>Description</th>
                              <th className={th + ' text-right'} style={{ width: 110 }}>Prix</th>
                              <th className={th + ' text-right'} style={{ width: 80 }}>Qté</th>
                              <th className={th} style={{ width: 100 }}>Unité</th>
                              <th className={th + ' text-right'} style={{ width: 80 }}>Marge %</th>
                              <th className={th + ' text-right'} style={{ width: 130 }}>Total</th>
                              <th className={th} style={{ width: 32 }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {(quote.subcontracting || []).length === 0 ? (
                              <tr><td colSpan={8} className="text-center text-sm text-gray-400 py-6">Aucune ligne.</td></tr>
                            ) : quote.subcontracting.map((r, i) => (
                              <tr key={r._uid || i} className="group hover:bg-gray-50">
                                <td className={td}><input className={txtCell} style={{ background: '#f3f4f6', fontWeight: 500 }} value={r.item || ''} onChange={e => updateSubcontractingRow(i, 'item', e.target.value)} /></td>
                                <td className={td}><input className={txtCell} value={r.description || ''} onChange={e => updateSubcontractingRow(i, 'description', e.target.value)} /></td>
                                <td className={td}><input type="number" step="0.01" className={numCell} value={r.rate || ''} onChange={e => updateSubcontractingRow(i, 'rate', e.target.value)} /></td>
                                <td className={td}><QtyInput className={numCell} value={r.quantity} onChange={v => updateSubcontractingRow(i, 'quantity', v)} /></td>
                                <td className={td}><select className={txtCell} value={r.unit || ''} onChange={e => updateSubcontractingRow(i, 'unit', e.target.value)}><option value="">—</option>{QUOTE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select></td>
                                <td className={td}><input type="number" step="0.1" className={numCell} value={r.margin || ''} placeholder={quote.general_margin || ''} onChange={e => updateSubcontractingRow(i, 'margin', e.target.value)} /></td>
                                <td className={tdRO + ' ' + td + ' font-semibold text-gray-900'}>{fmtCHF(serviceBilled(r))}</td>
                                <td className={td + ' text-center'}>
                                  <button onClick={() => removeSubcontractingRow(i)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 text-sm">×</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          {(quote.subcontracting || []).length > 0 && (
                            <tfoot>
                              <tr>
                                <td colSpan={6} className="px-3 py-2 text-right text-xs font-medium text-gray-500 bg-gray-50">Sous-total sous-traitance</td>
                                <td className="px-3 py-2 text-right text-sm font-bold text-gray-900 tabular-nums bg-gray-50">{fmtCHF(subcontractingTotal)}</td>
                                <td className="bg-gray-50"></td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    </div>

                    {/* ── Logistique ── */}
                    <div className="bg-white rounded-2xl border border-cyan-200 overflow-hidden">
                      <div className="px-5 py-3 border-b border-cyan-100 flex items-center justify-between" style={{ background: '#ecfeff' }}>
                        <h3 className="font-semibold" style={{ fontSize: 15, color: '#155e75' }}>Logistique</h3>
                        <button onClick={addLogisticsRow}
                          className="text-xs font-medium text-cyan-700 hover:text-cyan-900">+ Ligne</button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full" style={{ minWidth: 980 }}>
                          <thead>
                            <tr>
                              <th className={th} style={{ width: 160 }}>Item</th>
                              <th className={th}>Description</th>
                              <th className={th + ' text-right'} style={{ width: 110 }}>Prix</th>
                              <th className={th + ' text-right'} style={{ width: 80 }}>Qté</th>
                              <th className={th} style={{ width: 100 }}>Unité</th>
                              <th className={th + ' text-right'} style={{ width: 80 }}>Marge %</th>
                              <th className={th + ' text-right'} style={{ width: 130 }}>Total</th>
                              <th className={th} style={{ width: 32 }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {quote.logistics.length === 0 ? (
                              <tr><td colSpan={8} className="text-center text-sm text-gray-400 py-6">Aucune ligne.</td></tr>
                            ) : quote.logistics.map((r, i) => (
                              <tr key={r._uid || i} className="group hover:bg-gray-50">
                                <td className={td}><input className={txtCell} style={{ background: '#f3f4f6', fontWeight: 500 }} value={r.trajet || ''} onChange={e => updateLogisticsRow(i, 'trajet', e.target.value)} /></td>
                                <td className={td}><input className={txtCell} value={r.description || ''} onChange={e => updateLogisticsRow(i, 'description', e.target.value)} /></td>
                                <td className={td}><input type="number" step="0.01" className={numCell} value={r.rate || ''} onChange={e => updateLogisticsRow(i, 'rate', e.target.value)} /></td>
                                <td className={td}><QtyInput className={numCell} value={r.quantity} onChange={v => updateLogisticsRow(i, 'quantity', v)} /></td>
                                <td className={td}><select className={txtCell} value={r.unit || ''} onChange={e => updateLogisticsRow(i, 'unit', e.target.value)}><option value="">—</option>{QUOTE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select></td>
                                <td className={td}><input type="number" step="0.1" className={numCell} value={r.margin || ''} placeholder={quote.general_margin || ''} onChange={e => updateLogisticsRow(i, 'margin', e.target.value)} /></td>
                                <td className={tdRO + ' ' + td + ' font-semibold text-gray-900'}>{fmtCHF(serviceBilled(r))}</td>
                                <td className={td + ' text-center'}>
                                  <button onClick={() => removeLogisticsRow(i)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 text-sm">×</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          {quote.logistics.length > 0 && (
                            <tfoot>
                              <tr>
                                <td colSpan={6} className="px-3 py-2 text-right text-xs font-medium text-gray-500 bg-gray-50">Sous-total logistique</td>
                                <td className="px-3 py-2 text-right text-sm font-bold text-gray-900 tabular-nums bg-gray-50">{fmtCHF(logisticsTotal)}</td>
                                <td className="bg-gray-50"></td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    </div>

                    {/* ── Total général ── */}
                    <div className="rounded-2xl px-5 py-4 flex items-center justify-between" style={{ background: '#111827', color: 'white' }}>
                      <span className="text-sm font-medium uppercase tracking-wider opacity-80">Total général</span>
                      <span className="font-bold tabular-nums" style={{ fontSize: 24, letterSpacing: '-0.02em' }}>
                        {fmtCHF(grandTotal)} <span className="text-sm opacity-70 ml-1">CHF</span>
                      </span>
                    </div>
                  </div>
                )}
              </>
            )
          })()}
        </div>

        {/* ── Aperçu dossier kDrive ── */}
        <div className="mt-12 no-print">
          <div className="flex items-baseline justify-between mb-5">
            <h2 className="font-semibold text-gray-900" style={{ fontSize: 20 }}>Dossier kDrive</h2>
            {project.kdrive_folder_id && (
              <a
                href={`https://kdrive.infomaniak.com/app/drive/${KDRIVE_DRIVE_ID}/files/${kdrivePath.length > 0 ? kdrivePath[kdrivePath.length - 1].id : project.kdrive_folder_id}`}
                target="_blank" rel="noopener noreferrer"
                className="text-xs font-medium text-gray-500 hover:text-gray-900">
                Ouvrir sur kDrive ↗
              </a>
            )}
          </div>

          {!project.kdrive_folder_id ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center">
              <p className="text-sm text-gray-500">Aucun dossier kDrive lié à ce projet.</p>
              <p className="text-xs text-gray-400 mt-1">Modifie le projet pour le lier à un dossier existant sur kDrive.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              {/* Breadcrumb */}
              {kdrivePath.length > 0 && (
                <div className="px-5 py-3 border-b border-gray-100 flex items-center flex-wrap gap-1 text-xs">
                  <button onClick={() => kdriveGoTo(-1)}
                    className="px-1.5 py-0.5 rounded text-gray-500 hover:text-gray-900">
                    📁 Racine
                  </button>
                  {kdrivePath.map((p, i) => (
                    <span key={i} className="flex items-center gap-1">
                      <span className="text-gray-300">/</span>
                      <button onClick={() => kdriveGoTo(i)}
                        className={`px-1.5 py-0.5 rounded ${i === kdrivePath.length - 1 ? 'font-semibold text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}>
                        {p.name}
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Grid */}
              <div className="p-4">
                {kdriveLoading ? (
                  <p className="text-center text-sm text-gray-400 py-8">Chargement…</p>
                ) : kdriveError ? (
                  <p className="text-center text-sm text-red-500 py-8">{kdriveError}</p>
                ) : kdriveItems.length === 0 ? (
                  <p className="text-center text-sm text-gray-400 py-8">Dossier vide</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {kdriveItems.map(item => {
                      if (item.type === 'dir') {
                        return (
                          <button key={item.id} onClick={() => enterKdriveFolder(item)}
                            className="group flex flex-col items-center text-center p-3 rounded-xl border border-gray-100 hover:border-gray-300 hover:bg-gray-50 transition-colors">
                            <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
                            </svg>
                            <span className="mt-2 text-xs text-gray-700 truncate w-full">{item.name}</span>
                          </button>
                        )
                      }
                      const isImage = item.mime_type?.startsWith('image/')
                      const isPdf = item.mime_type === 'application/pdf'
                      return (
                        <a key={item.id}
                          href={`https://kdrive.infomaniak.com/app/drive/${KDRIVE_DRIVE_ID}/preview/${item.id}`}
                          target="_blank" rel="noopener noreferrer"
                          className="group block rounded-xl border border-gray-100 hover:border-gray-300 overflow-hidden transition-colors">
                          <div className="w-full h-28 bg-gray-50 flex items-center justify-center overflow-hidden">
                            {item.has_thumbnail ? (
                              <img
                                src={`/api/kdrive/thumbnail?fileId=${item.id}`}
                                alt={item.name}
                                loading="lazy"
                                className="w-full h-full object-cover"
                                onError={e => { e.currentTarget.style.display = 'none' }}
                              />
                            ) : isPdf ? (
                              <div className="flex flex-col items-center gap-1">
                                <span className="text-3xl">📄</span>
                                <span className="text-xs text-gray-400 font-medium">PDF</span>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center gap-1">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5">
                                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                  <polyline points="14 2 14 8 20 8" />
                                </svg>
                              </div>
                            )}
                          </div>
                          <div className="px-2 py-1.5">
                            <p className="text-xs text-gray-700 truncate" title={item.name}>{item.name}</p>
                            <p className="text-[10px] text-gray-400">{fmtSize(item.size)}</p>
                          </div>
                        </a>
                      )
                    })}
                  </div>
                )}
              </div>
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

    {/* ── Create task drawer (catégories génériques) ── */}
    {drawerCategory && (
      <TaskFormDrawer
        currentUser={currentUser}
        defaultProjectId={project.id}
        defaultCategory={drawerCategory}
        hideProjectSelector
        onSave={async (body) => {
          const res = await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-actor': currentUser },
            body: JSON.stringify(body),
          })
          const created = await res.json()
          if (created.id) handleTaskAdded(created)
          setDrawerCategory(null)
        }}
        onClose={() => setDrawerCategory(null)}
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
