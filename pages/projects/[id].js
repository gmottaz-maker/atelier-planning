import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import { useAuth } from '../_app'

const PINK = '#FF4D6D'
const PERSON_COLORS = {
  Arnaud: '#3b82f6',
  Gabin: '#8b5cf6',
  Guillaume: PINK,
  'Sous-traitant': '#64748b',
}
const RESPONSIBLES = ['Arnaud', 'Gabin', 'Guillaume', 'Sous-traitant']

const LOGISTICS_TYPES = [
  { key: 'montage',      label: 'Montage',      icon: '🔨' },
  { key: 'demontage',    label: 'Démontage',    icon: '🔧' },
  { key: 'livraison',    label: 'Livraison',    icon: '🚚' },
  { key: 'recuperation', label: 'Récupération', icon: '↩️' },
  { key: 'envoi_dhl',    label: 'Envoi DHL',    icon: '✈️' },
  { key: 'envoi_ete',    label: 'Envoi ETE',    icon: '📦' },
]
// Types that have a date field
const TYPES_WITH_DATE = ['demontage', 'recuperation', 'livraison', 'envoi_dhl', 'envoi_ete', 'montage']

const TASK_CATEGORIES = [
  { key: 'bureau',         label: 'Bureau',            icon: '🏢' },
  { key: 'commande',       label: 'Commande & Achats',  icon: '🛒' },
  { key: 'sous_traitance', label: 'Sous-traitance',     icon: '🔨' },
  { key: 'atelier',        label: 'Atelier',            icon: '🏭' },
  { key: 'logistique',     label: 'Logistique',         icon: '🚚' },
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

// Init logistics from project → returns an array of items
function initLogistics(project) {
  const existing = project.logistics_data || {}

  // New format: already an array
  if (Array.isArray(existing) && existing.length > 0) return existing

  // Old format: object keyed by type — migrate to array
  if (!Array.isArray(existing)) {
    const OLD_KEYS = ['montage', 'livraison', 'envoi_dhl', 'demontage', 'recuperation']
    const items = []
    for (const key of OLD_KEYS) {
      const d = existing[key]
      if (d && Object.values(d).some(v => v && String(v).trim())) {
        items.push({ type: key, ...d })
      }
    }
    if (items.length > 0) return items
  }

  // Legacy columns fallback
  const items = []
  if (project.logistics_address || project.logistics_time) {
    items.push({ type: 'montage', date: '', address: project.logistics_address || '', time: project.logistics_time || '', contact: project.logistics_contact || '', notes: project.logistics_notes || '' })
  }
  if (project.disassembly_date || project.disassembly_address) {
    items.push({ type: 'demontage', date: project.disassembly_date || '', address: project.disassembly_address || '', time: project.disassembly_time || '', contact: project.disassembly_contact || '', notes: project.disassembly_notes || '' })
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
  const [form, setForm] = useState({
    title: task.title || '',
    responsible: task.responsible || RESPONSIBLES[0],
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
                {RESPONSIBLES.map(r => <option key={r} value={r}>{r}</option>)}
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
  const todayStr = toDateStr(today())
  const isLate = task.execution_date && task.execution_date < todayStr
  const completed = task.status === 'completed'
  return (
    <div
      className="flex items-center gap-2.5 py-2.5 border-b last:border-b-0 group"
      style={{ borderColor: '#f3f4f6', cursor: onEdit ? 'pointer' : 'default' }}
      onClick={() => onEdit && onEdit(task)}
    >
      <button
        onClick={e => { e.stopPropagation(); onToggle(task) }}
        className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all"
        style={{ borderColor: completed ? '#22c55e' : '#d1d5db', background: completed ? '#22c55e' : 'white' }}>
        {completed && (
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>
      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PERSON_COLORS[task.responsible] || '#ccc' }} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${completed ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{task.title}</p>
        {task.responsible && (
          <p className="text-xs mt-0.5" style={{ color: PERSON_COLORS[task.responsible] || '#9ca3af' }}>{task.responsible}</p>
        )}
      </div>
      {!completed && isLate && (
        <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: '#fef2f2', color: '#ef4444' }}>retard</span>
      )}
      {!completed && !isLate && task.execution_date && (
        <span className="text-xs text-gray-400 flex-shrink-0">
          {new Date(...task.execution_date.split('-').map((v,i)=>i===1?v-1:+v)).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
        </span>
      )}
      {onEdit && (
        <svg className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-400 flex-shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      )}
    </div>
  )
}

// ─── AddTaskForm ──────────────────────────────────────────────────────────────
function AddTaskForm({ projectId, category, currentUser, onAdd, onCancel }) {
  const todayStr = toDateStr(today())
  const [form, setForm] = useState({
    title: '',
    responsible: currentUser || RESPONSIBLES[0],
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
          {RESPONSIBLES.map(r => <option key={r} value={r}>{r}</option>)}
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

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ProjectPage() {
  const router = useRouter()
  const { id } = router.query
  const { user, signOut } = useAuth()
  const currentUser = user?.name || ''

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
    const newItem = { type, date: '', address: '', time: '', contact: '', notes: '' }
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
      }
    } catch (err) { console.error(err) }
    setLogisticsSaving(false)
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
        <title>{project.name} — Amazing Lab</title>
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

      {/* ── Header ── */}
      <header className="sticky top-0 z-20 bg-white border-b" style={{ borderColor: '#f0f0f0' }}>
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Link href="/"><Logo /></Link>
            <span className="text-gray-300">/</span>
            <Link href="/" className="text-xs text-gray-400 hover:text-gray-600 hidden sm:inline">Projets</Link>
            <span className="text-gray-300 hidden sm:inline">/</span>
            <span className="font-semibold text-gray-900 text-sm truncate">{project.name}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link href="/home" title="Accueil" className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 text-gray-400 hover:border-gray-400 transition-colors text-base">🏠</Link>
            <Link href="/tasks" title="Tâches" className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 text-gray-400 hover:border-gray-400 transition-colors text-base">✅</Link>
            <Link href="/settings" title="Paramètres" className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 text-gray-400 hover:border-gray-400 transition-colors text-base">⚙️</Link>
            <button onClick={signOut} className="px-3 py-1.5 rounded-full text-xs font-semibold text-white"
              style={{ background: PERSON_COLORS[currentUser] || PINK }}>{currentUser}</button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6">

        {/* ── Titre + chips ── */}
        <div className="mb-6">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-3 h-3 rounded-full mt-2 flex-shrink-0" style={{ background: color }} />
            <h1 className="text-2xl font-bold text-gray-900 leading-tight">
              {project.name}
              {project.client && <span className="text-gray-400 font-normal"> — {project.client}</span>}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 ml-6">
            {project.deadline && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: color + '22', color }}>
                {daysLeft < 0 ? `En retard (${Math.abs(daysLeft)}j)` : daysLeft === 0 ? "Aujourd'hui" : `${fmtDate(project.deadline)} · ${daysLeft}j`}
              </span>
            )}
            {project.delivery_type && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 font-medium">{project.delivery_type}</span>
            )}
            {project.responsible && (
              <span className="text-xs px-2.5 py-1 rounded-full font-medium"
                style={{ background: (PERSON_COLORS[project.responsible] || '#ccc') + '22', color: PERSON_COLORS[project.responsible] || '#888' }}>
                {project.responsible}
              </span>
            )}
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${project.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {project.status === 'active' ? 'En cours' : 'Archivé'}
            </span>
            {activeTasks.length > 0 && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 font-medium">
                {activeTasks.length} tâche{activeTasks.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        {/* ── Résumé ── */}
        {project.description && (
          <div className="mb-6">
            <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: PINK }}>Résumé du projet</p>
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{project.description}</p>
            </div>
          </div>
        )}

        {/* ── Two columns ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

          {/* ════ LEFT: Tâches groupées ════ */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: PINK }}>Tâches du projet</p>
            <div className="space-y-3">
              {TASK_CATEGORIES.map(cat => {
                const catTasks = tasks.filter(t =>
                  (t.category === cat.key || (!t.category && cat.key === 'bureau')) &&
                  (t.status === 'active' || isCompletedToday(t))
                )
                const activeCount = catTasks.filter(t => t.status === 'active').length
                return (
                  <div key={cat.key} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    {/* Group header */}
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-50">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{cat.icon}</span>
                        <span className="text-xs font-bold text-gray-700">{cat.label}</span>
                        {activeCount > 0 && (
                          <span className="text-xs font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: PINK }}>
                            {activeCount}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => setAddingCategory(addingCategory === cat.key ? null : cat.key)}
                        className="text-xs text-gray-400 hover:text-gray-700 transition-colors font-semibold">
                        {addingCategory === cat.key ? '✕' : '+ Ajouter'}
                      </button>
                    </div>

                    {/* Task list */}
                    <div className="px-4">
                      {catTasks.length === 0 && addingCategory !== cat.key && (
                        <p className="text-xs text-gray-300 py-3">Aucune tâche</p>
                      )}
                      {catTasks.map(t => <TaskItem key={t.id} task={t} onToggle={toggleTask} onEdit={t => setEditingTask(t)} />)}
                      {addingCategory === cat.key && (
                        <AddTaskForm
                          projectId={project.id}
                          category={cat.key}
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
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: PINK }}>Logistique</p>
              <div className="flex items-center gap-2">
                {logisticsDirty && (
                  <button onClick={() => saveLogistics()} disabled={logisticsSaving}
                    className="text-xs font-semibold px-3 py-1.5 rounded-full text-white disabled:opacity-60 transition-opacity"
                    style={{ background: PINK }}>
                    {logisticsSaving ? 'Enregistrement...' : '💾 Sauvegarder'}
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              {logistics.map((item, idx) => {
                const type = LOGISTICS_TYPES.find(t => t.key === item.type) || { icon: '📋', label: item.type }
                const isOpen = expandedLogIdx === idx
                const hasContent = item.date || item.address || item.time || item.contact || item.notes
                return (
                  <div key={idx} className="bg-white rounded-2xl border overflow-hidden"
                    style={{ borderColor: hasContent ? '#e5e7eb' : '#f3f4f6' }}>

                    {/* Row header */}
                    <div
                      className="flex items-center gap-2 px-4 py-2.5 cursor-pointer select-none"
                      onClick={() => setExpandedLogIdx(isOpen ? null : idx)}>
                      <span className="text-sm flex-shrink-0">{type.icon}</span>
                      <span className="text-xs font-bold text-gray-700">{type.label}</span>
                      {item.date && <span className="text-xs text-gray-400">{fmtDate(item.date)}</span>}
                      {!item.date && item.address && (
                        <span className="text-xs text-gray-400 truncate">{item.address}</span>
                      )}
                      <div className="ml-auto flex items-center gap-2">
                        {hasContent && !isOpen && <span className="text-xs text-green-500">✓</span>}
                        <button
                          onClick={e => { e.stopPropagation(); removeLogItem(idx) }}
                          className="text-gray-300 hover:text-red-400 transition-colors text-xs leading-none">✕</button>
                        <span className="text-gray-300 text-xs">{isOpen ? '▲' : '▼'}</span>
                      </div>
                    </div>

                    {/* Expanded form */}
                    {isOpen && (
                      <div className="px-4 pb-3 pt-1 space-y-2.5 border-t border-gray-50">
                        <div className="flex gap-2">
                          {/* Type selector */}
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
                          {/* Date */}
                          <div className="flex-1">
                            <label className="block text-xs text-gray-400 mb-1">Date</label>
                            <input type="date" value={item.date || ''} style={{ fontSize: 14 }}
                              onChange={e => updateLogItem(idx, 'date', e.target.value)}
                              className={inp} />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Adresse</label>
                          <input type="text" value={item.address || ''} placeholder="Rue, ville..." style={{ fontSize: 14 }}
                            onChange={e => updateLogItem(idx, 'address', e.target.value)}
                            className={inp} />
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
                          <textarea rows={2} value={item.notes || ''} placeholder="Accès, remarques..." style={{ fontSize: 14, resize: 'none' }}
                            onChange={e => updateLogItem(idx, 'notes', e.target.value)}
                            className={inp} />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Add logistics item */}
              {addingLogistics ? (
                <div className="bg-white rounded-2xl border border-gray-100 px-4 py-3">
                  <p className="text-xs text-gray-500 mb-2 font-semibold">Choisir un type :</p>
                  <div className="flex flex-wrap gap-1.5">
                    {LOGISTICS_TYPES.map(t => (
                      <button key={t.key} onClick={() => addLogItem(t.key)}
                        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-200 hover:border-gray-400 text-gray-600 transition-colors">
                        <span>{t.icon}</span>{t.label}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setAddingLogistics(false)}
                    className="mt-2 text-xs text-gray-400 hover:text-gray-600">Annuler</button>
                </div>
              ) : (
                <button onClick={() => setAddingLogistics(true)}
                  className="w-full py-2 text-xs font-semibold text-gray-400 hover:text-gray-600 border border-dashed border-gray-200 hover:border-gray-300 rounded-2xl transition-colors">
                  + Ajouter un point logistique
                </button>
              )}
            </div>
          </div>

        </div>

        {/* ── Visite sur site ── */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => setVisitExpanded(v => !v)}
              className="flex items-center gap-2 group">
              <span className="text-xs font-bold uppercase tracking-wider transition-colors" style={{ color: PINK }}>
                📍 Visite sur site
              </span>
              {visitSummary && !visitExpanded && (
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: PINK + '22', color: PINK }}>✓ Résumé disponible</span>
              )}
              <span className="text-gray-300 text-xs">{visitExpanded ? '▲' : '▼'}</span>
            </button>
            {visitExpanded && (
              <div className="flex items-center gap-2">
                {visitDirty && (
                  <button onClick={saveVisit} disabled={visitSaving}
                    className="text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-200 text-gray-600 disabled:opacity-50">
                    {visitSaving ? 'Enregistrement...' : '💾 Sauvegarder'}
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
                      {RESPONSIBLES.filter(r => r !== 'Sous-traitant').map(name => {
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
        <div className="mt-6 no-print">
          <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: PINK }}>Fichiers</p>

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className="rounded-2xl border-2 border-dashed transition-colors mb-3 cursor-pointer"
            style={{ borderColor: isDragging ? PINK : '#e5e7eb', background: isDragging ? PINK + '08' : 'white' }}
            onClick={() => document.getElementById('file-input-hidden').click()}>
            <input id="file-input-hidden" type="file" multiple accept="image/*,.pdf"
              className="hidden"
              onChange={e => Array.from(e.target.files).forEach(uploadFile)} />
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              {uploading ? (
                <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: '#e5e7eb', borderTopColor: PINK }} />
              ) : (
                <>
                  <span className="text-2xl">📎</span>
                  <p className="text-xs text-gray-400 font-medium">Glisser des fichiers ici ou <span style={{ color: PINK }}>parcourir</span></p>
                  <p className="text-xs text-gray-300">Images (JPG, PNG, WEBP) · PDF · max 10 MB</p>
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
          <div style={{ borderBottom: '2px solid #FF4D6D', paddingBottom: '12px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p style={{ fontSize: '10px', fontWeight: 700, color: '#FF4D6D', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>Amazing Lab — Visite sur site</p>
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
      <p style={{ fontSize: '9px', fontWeight: 700, color: '#FF4D6D', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>{label}</p>
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
