import { useState, useEffect, useCallback } from 'react'
import Head from 'next/head'
import { useAuth } from './_app'
import NavBar from '../components/NavBar'
import { useResponsibles } from '../lib/useResponsibles'

const PINK = '#111827'
const PEOPLE = ['Arnaud', 'Guillaume', 'Gabin', 'non défini']  // valeur par défaut, surchargée par useResponsibles()
const PERSON_COLORS = {
  Arnaud: '#3b82f6',
  Gabin: '#8b5cf6',
  Guillaume: PINK,
  'Sous-traitant': '#64748b',
  'non défini': '#9ca3af',
  'Coople': '#64748b',
}

function colorForName(name) {
  if (PERSON_COLORS[name]) return PERSON_COLORS[name]
  if (!name) return '#9ca3af'
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return `hsl(${Math.abs(hash) % 360}, 45%, 48%)`
}

const SECTIONS = [
  { key: 'overdue',        label: 'En retard',                color: '#dc2626' },
  { key: 'today',          label: "Aujourd'hui",              color: '#d97706' },
  { key: 'tomorrow',       label: 'Demain',                   color: '#f59e0b' },
  { key: 'thisWeek',       label: 'Cette semaine',            color: '#0ea5e9' },
  { key: 'nextWeek',       label: 'Semaine prochaine',        color: '#6366f1' },
  { key: 'later',          label: 'Plus tard',                color: '#6b7280' },
  { key: 'completedToday', label: "Terminées aujourd'hui",    color: '#22c55e' },
]

// ─── Helpers ───────────────────────────────────────────────────────────────

function today() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function parseDate(str) {
  if (!str) return null
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function toDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
}

function endOfWeek() {
  const d = today()
  const day = d.getDay() || 7
  d.setDate(d.getDate() + (7 - day))
  return d
}

function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

// Retourne la date qui compte pour le décompte
function countdownDate(task) {
  if (task.due_date && task.due_date !== task.execution_date) return parseDate(task.due_date)
  return parseDate(task.execution_date)
}

function daysRemaining(task) {
  const ref = countdownDate(task)
  if (!ref) return null
  const t = today()
  return Math.ceil((ref - t) / 86400000)
}

// La "date effective" pour le tri/affichage (auto-rollover si passée)
function effectiveDate(task) {
  const exec = parseDate(task.execution_date)
  const t = today()
  if (exec < t && task.status === 'active') return t
  return exec
}

function formatDate(str) {
  if (!str) return ''
  const [y, m, d] = str.split('-')
  return `${d}.${m}`
}

// Une tâche terminée aujourd'hui reste visible jusqu'à demain
function isCompletedToday(task) {
  if (task.status !== 'completed' || !task.completed_at) return false
  const completedDay = task.completed_at.split('T')[0]
  return completedDay === toDateStr(today())
}

// ─── Composant CountdownBadge ─────────────────────────────────────────────

function CountdownBadge({ task }) {
  const days = daysRemaining(task)
  if (days === null) return null
  const hasDueDate = task.due_date && task.due_date !== task.execution_date

  let bg, color, label
  if (days < 0) { bg = '#fee2e2'; color = '#dc2626'; label = `${Math.abs(days)}j de retard` }
  else if (days === 0) { bg = '#fee2e2'; color = '#dc2626'; label = "Aujourd'hui !" }
  else if (days === 1) { bg = '#fff7ed'; color = '#ea580c'; label = 'Demain' }
  else if (days <= 7) { bg = '#fff7ed'; color = '#ea580c'; label = `J-${days}` }
  else { bg = '#f0fdf4'; color = '#16a34a'; label = `J-${days}` }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold"
      style={{ background: bg, color }}>
      {hasDueDate && <span title="Date d'échéance">⏰</span>}
      {label}
    </span>
  )
}

// ─── Composant TaskCard ───────────────────────────────────────────────────

function TaskCard({ task, currentUser, onToggle, onEdit, onDelete }) {
  const completed   = task.status === 'completed'
  const personColor = colorForName(task.responsible)
  const projectName = task.projects?.name
  const canDelete   = task.responsible === currentUser || currentUser === 'Guillaume'
  const dateInfo    = !completed && fmtTaskDate(task)

  return (
    <div
      className="group bg-white rounded-lg border transition-all hover:border-gray-300"
      style={{
        borderColor: completed ? '#f3f4f6' : '#e5e7eb',
        opacity: completed ? 0.55 : 1,
      }}
    >
      <div className="flex items-center gap-4 px-5 py-4">
        <button
          onClick={() => onToggle(task)}
          className="flex-shrink-0 flex items-center justify-center transition-all hover:scale-110"
          style={{ width: 28, height: 28 }}
        >
          <div className="w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all"
            style={{
              borderColor: completed ? '#22c55e' : '#d1d5db',
              background: completed ? '#22c55e' : 'white',
            }}>
            {completed && (
              <svg width="13" height="13" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </div>
        </button>

        <div className="flex-1 min-w-0">
          <button onClick={() => !completed && onEdit(task)}
            className={`text-left w-full ${completed ? 'cursor-default' : ''}`}>
            <div className="flex items-center gap-2">
              {task.is_private && (
                <span className="text-xs text-gray-400" title="Tâche privée">🔒</span>
              )}
              <p className={`leading-snug ${completed ? 'text-gray-400 line-through' : 'text-gray-900 font-medium'}`}
                style={{ fontSize: 14 }}>
                {task.title}
              </p>
            </div>
            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs">
              <span className="font-medium px-2 py-0.5 rounded-md"
                style={{ background: personColor + '15', color: personColor }}>
                {task.responsible}
              </span>
              {projectName && (
                <span className="text-gray-500 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                  {projectName}
                </span>
              )}
              {dateInfo && (
                <span className="font-medium tabular-nums" style={{ color: dateInfo.color }}>
                  {dateInfo.label}
                </span>
              )}
              {task.notes && (
                <span className="text-gray-400 italic truncate max-w-xs">{task.notes}</span>
              )}
            </div>
          </button>
        </div>

        {/* Actions au survol */}
        {!completed && (
          <div className="flex items-center gap-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-xs">
            <button onClick={() => onEdit(task)}
              className="font-medium text-gray-500 hover:text-gray-900">
              Modifier
            </button>
            {canDelete && (
              <>
                <span className="text-gray-200">·</span>
                <button onClick={() => onDelete(task)}
                  className="font-medium text-gray-500 hover:text-red-600">
                  Supprimer
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Helper : libellé court de date pour la tâche
function fmtTaskDate(task) {
  const ref = task.due_date && task.due_date !== task.execution_date ? task.due_date : task.execution_date
  if (!ref) return null
  const todayStr = toDateStr(today())
  if (ref === todayStr) return { label: "Aujourd'hui", color: '#d97706' }
  const [y, m, d] = ref.split('-').map(Number)
  const date = new Date(y, m-1, d); date.setHours(0,0,0,0)
  const diff = Math.round((date - today()) / 86400000)
  if (diff < 0) return { label: `${Math.abs(diff)}j en retard`, color: '#dc2626' }
  if (diff === 1) return { label: 'Demain', color: '#d97706' }
  if (diff <= 7) return { label: `Dans ${diff}j`, color: '#0284c7' }
  return { label: date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }), color: '#6b7280' }
}

// ─── Formulaire (slide-up mobile) ─────────────────────────────────────────

function TaskForm({ task, projects, currentUser, onSave, onClose }) {
  const { responsibles } = useResponsibles()
  const isEdit = !!task?.id
  const [form, setForm] = useState({
    title: task?.title || '',
    project_id: task?.project_id || '',
    responsible: task?.responsible || currentUser || 'non défini',
    execution_date: task?.execution_date || toDateStr(today()),
    due_date: task?.due_date || '',
    is_private: task?.is_private || false,
    notes: task?.notes || '',
  })
  const [saving, setSaving] = useState(false)

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    const body = {
      ...form,
      project_id: form.project_id || null,
      due_date: form.due_date || null,
    }
    await onSave(body, isEdit ? task.id : null)
    setSaving(false)
  }

  const inputCls = "w-full px-3 py-2 border border-gray-200 rounded-md text-sm bg-white focus:border-gray-400 focus:outline-none transition-colors"

  // Esc pour fermer
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <style>{`
        @keyframes drawerSlide {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
        @keyframes drawerFade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
      <div className="fixed inset-0 z-50" style={{ background: 'rgba(15, 23, 42, 0.35)', animation: 'drawerFade 0.15s ease-out both' }}
        onClick={e => e.target === e.currentTarget && onClose()}>
        <div
          className="fixed top-0 right-0 bottom-0 bg-white flex flex-col shadow-2xl"
          style={{
            width: '100%',
            maxWidth: 520,
            animation: 'drawerSlide 0.2s cubic-bezier(0.4, 0, 0.2, 1) both',
            fontFamily: 'Inter, sans-serif',
          }}>
          {/* Header */}
          <div className="flex items-center justify-between px-8 py-5 border-b border-gray-100">
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-400 mb-0.5">{isEdit ? 'Modifier' : 'Nouvelle tâche'}</p>
              <h2 className="font-semibold text-gray-900 tracking-tight" style={{ fontSize: 20 }}>
                {isEdit ? task.title : 'Créer une tâche'}
              </h2>
            </div>
            <button onClick={onClose}
              className="w-9 h-9 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              style={{ fontSize: 22 }}>
              ×
            </button>
          </div>

          {/* Form body */}
          <form id="task-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-8 py-6 space-y-5">
            {/* Titre */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Titre</label>
              <input type="text" required autoFocus
                value={form.title} onChange={e => set('title', e.target.value)}
                placeholder="Ex : Découpe panneaux bar" className={inputCls} />
            </div>

            {/* Projet */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Projet lié</label>
              <select value={form.project_id} onChange={e => set('project_id', e.target.value)} className={inputCls}>
                <option value="">— Aucun projet —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name} · {p.client}</option>)}
              </select>
            </div>

            {/* Responsable */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Responsable</label>
              <div className="flex gap-2 flex-wrap">
                {responsibles.map(p => {
                  const color = colorForName(p)
                  const active = form.responsible === p
                  return (
                    <button key={p} type="button"
                      onClick={() => set('responsible', p)}
                      className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors border"
                      style={active
                        ? { background: color + '15', borderColor: color, color: color }
                        : { background: 'white', borderColor: '#e5e7eb', color: '#6b7280' }
                      }>
                      {p}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Date d'exécution</label>
                <input type="date" required value={form.execution_date}
                  onChange={e => set('execution_date', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Échéance (optionnel)</label>
                <input type="date" value={form.due_date}
                  onChange={e => set('due_date', e.target.value)} className={inputCls} />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Note</label>
              <textarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)}
                placeholder="Détail ou info utile…" className={inputCls}
                style={{ resize: 'vertical' }} />
            </div>

            {/* Privée */}
            <label className="flex items-center gap-3 py-2 cursor-pointer">
              <div
                onClick={() => set('is_private', !form.is_private)}
                className="w-10 h-5.5 rounded-full transition-colors flex items-center px-0.5 flex-shrink-0"
                style={{ background: form.is_private ? '#111827' : '#d1d5db', width: 36, height: 20 }}>
                <div className="w-4 h-4 bg-white rounded-full shadow transition-transform"
                  style={{ transform: form.is_private ? 'translateX(16px)' : 'translateX(0)' }} />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Tâche privée</p>
                <p className="text-xs text-gray-500">Visible uniquement par toi</p>
              </div>
            </label>
          </form>

          {/* Footer */}
          <div className="px-8 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">
              Annuler
            </button>
            <button type="submit" form="task-form" disabled={saving || !form.title.trim()}
              className="px-5 py-2 rounded-md text-white font-medium text-sm transition-opacity disabled:opacity-50"
              style={{ background: '#111827' }}>
              {saving ? 'Enregistrement…' : isEdit ? 'Mettre à jour' : 'Créer la tâche'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Sélecteur d'identité ─────────────────────────────────────────────────

function WhoAreYou({ onSelect }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center px-6"
      style={{ background: '#fafafa' }}>
      <div className="mb-8 text-center">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="mx-auto mb-3">
          <ellipse cx="20" cy="20" rx="18" ry="7" stroke={PINK} strokeWidth="2" fill="none" />
          <ellipse cx="20" cy="20" rx="18" ry="7" stroke={PINK} strokeWidth="2" fill="none" transform="rotate(60 20 20)" />
          <ellipse cx="20" cy="20" rx="18" ry="7" stroke={PINK} strokeWidth="2" fill="none" transform="rotate(120 20 20)" />
          <circle cx="20" cy="20" r="3" fill={PINK} />
        </svg>
        <p className="font-bold text-gray-900 text-lg">amazing lab</p>
        <p className="text-gray-500 text-sm mt-1">Qui es-tu ?</p>
      </div>
      <div className="w-full space-y-3 max-w-xs">
        {['Arnaud', 'Gabin', 'Guillaume'].map(p => (
          <button key={p} onClick={() => onSelect(p)}
            className="w-full py-4 rounded-2xl text-white text-lg font-semibold transition-opacity hover:opacity-90"
            style={{ background: PERSON_COLORS[p] }}>
            {p}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────

export default function Tasks() {
  const { user, signOut } = useAuth()
  const { responsibles } = useResponsibles()
  const currentUser = user?.name || null

  const [tasks, setTasks] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('week')       // 'today' | 'week' | 'twoweeks' | 'all'
  const [personFilter, setPersonFilter] = useState(null) // null = not initialized yet
  const [projectFilter, setProjectFilter] = useState('all') // 'all' | project_id
  const [showForm, setShowForm] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const [notifStatus, setNotifStatus] = useState('unknown') // 'unknown'|'granted'|'denied'|'unsupported'

  // Init filtre par défaut + notifs
  useEffect(() => {
    if (currentUser && personFilter === null) {
      setPersonFilter(currentUser)
    }
    // Statut notifications
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setNotifStatus('unsupported')
    } else {
      setNotifStatus(Notification.permission)
    }
  }, [currentUser])

  async function requestNotifications() {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return
    const permission = await Notification.requestPermission()
    setNotifStatus(permission)
    if (permission !== 'granted') return

    const sw = await navigator.serviceWorker.ready
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!vapidKey) return

    // Convertit la clé VAPID base64url → Uint8Array
    const keyData = vapidKey.replace(/-/g, '+').replace(/_/g, '/')
    const padding = '='.repeat((4 - keyData.length % 4) % 4)
    const raw = atob(keyData + padding)
    const uint8 = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i++) uint8[i] = raw.charCodeAt(i)

    const subscription = await sw.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: uint8,
    })

    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription, user: currentUser }),
    })
    showMsg('Notifications activées ! 🔔')
  }

  // Helper: ajoute l'acteur en header pour les API calls
  function actorHeaders() {
    return { 'Content-Type': 'application/json', 'x-actor': currentUser || '' }
  }

  const fetchAll = useCallback(async () => {
    const [tRes, pRes] = await Promise.all([
      fetch('/api/tasks'),
      fetch('/api/projects'),
    ])
    const [tData, pData] = await Promise.all([tRes.json(), pRes.json()])
    setTasks(Array.isArray(tData) ? tData : [])
    setProjects((Array.isArray(pData) ? pData : []).filter(p => p.status === 'active'))
    setLoading(false)
  }, [])

  useEffect(() => { if (currentUser) fetchAll() }, [currentUser, fetchAll])

  // Init personFilter when currentUser becomes available
  useEffect(() => {
    if (currentUser && personFilter === null) setPersonFilter(currentUser)
  }, [currentUser])

  function showMsg(msg, type = 'ok') {
    setFeedback({ msg, type })
    setTimeout(() => setFeedback(null), 2500)
  }

  async function handleToggle(task) {
    // Strip nested join data (projects) before sending to API
    const { projects: _p, ...taskData } = task
    const newStatus = task.status === 'completed' ? 'active' : 'completed'
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PUT',
      headers: actorHeaders(),
      body: JSON.stringify({ ...taskData, status: newStatus, prev_status: task.status }),
    })
    fetchAll()
  }

  async function handleSave(body, id) {
    if (id) {
      await fetch(`/api/tasks/${id}`, {
        method: 'PUT',
        headers: actorHeaders(),
        body: JSON.stringify(body),
      })
      showMsg('Tâche mise à jour ✓')
    } else {
      await fetch('/api/tasks', {
        method: 'POST',
        headers: actorHeaders(),
        body: JSON.stringify(body),
      })
      showMsg('Tâche créée ✓')
    }
    setShowForm(false)
    setEditingTask(null)
    fetchAll()
  }

  async function handleDelete(task) {
    if (!confirm(`Supprimer "${task.title}" ?`)) return
    await fetch(`/api/tasks/${task.id}`, {
      method: 'DELETE',
      headers: actorHeaders(),
    })
    showMsg('Tâche supprimée')
    fetchAll()
  }

  function handleEdit(task) {
    setEditingTask(task)
    setShowForm(true)
  }

  // ─── Filtrage ───────────────────────────────────────────────────────────

  const todayStr = toDateStr(today())
  const weekEnd = toDateStr(endOfWeek())
  const twoWeeksEnd = toDateStr(addDays(today(), 14))

  // personFilter defaults to 'all' while loading
  const activePersonFilter = personFilter === null ? 'all' : personFilter

  const tomorrowStr = toDateStr(addDays(today(), 1))
  const nextWeekEnd = toDateStr(addDays(parseDate(weekEnd), 7))

  function getTaskSection(task) {
    if (task.status === 'completed' && isCompletedToday(task)) return 'completedToday'
    if (task.status === 'active' && task.execution_date < todayStr) return 'overdue'
    const eff = toDateStr(effectiveDate(task))
    if (eff === todayStr) return 'today'
    if (eff === tomorrowStr) return 'tomorrow'
    if (eff <= weekEnd) return 'thisWeek'
    if (eff <= nextWeekEnd) return 'nextWeek'
    return 'later'
  }

  // Sections visibles selon la vue choisie
  const sectionsForView = {
    today:    ['overdue', 'today', 'completedToday'],
    week:     ['overdue', 'today', 'tomorrow', 'thisWeek', 'completedToday'],
    twoweeks: ['overdue', 'today', 'tomorrow', 'thisWeek', 'nextWeek', 'completedToday'],
    all:      ['overdue', 'today', 'tomorrow', 'thisWeek', 'nextWeek', 'later', 'completedToday'],
  }[view] || []

  function taskVisible(task) {
    if (task.is_private && task.responsible !== currentUser) return false
    if (activePersonFilter !== 'all' && task.responsible !== activePersonFilter) return false
    if (projectFilter !== 'all' && String(task.project_id) !== String(projectFilter)) return false
    if (task.status === 'completed' && !isCompletedToday(task)) return false
    return sectionsForView.includes(getTaskSection(task))
  }

  const visibleTasks = tasks.filter(taskVisible)

  // Groupes par section
  const grouped = SECTIONS.reduce((acc, s) => { acc[s.key] = []; return acc }, {})
  for (const t of visibleTasks) grouped[getTaskSection(t)].push(t)
  // Tri intra-section par date d'effet, puis par titre
  for (const key of Object.keys(grouped)) {
    grouped[key].sort((a, b) => {
      const da = toDateStr(effectiveDate(a))
      const db = toDateStr(effectiveDate(b))
      if (da !== db) return da.localeCompare(db)
      return (a.title || '').localeCompare(b.title || '')
    })
  }

  const activeCount = visibleTasks.filter(t => t.status === 'active').length
  const totalActiveByPerson = tasks.filter(t => t.status === 'active' && (!t.is_private || t.responsible === currentUser))

  // Projets avec des tâches actives
  const projectTaskCounts = {}
  for (const t of totalActiveByPerson) {
    if (t.project_id) {
      projectTaskCounts[t.project_id] = (projectTaskCounts[t.project_id] || 0) + 1
    }
  }
  const projectsWithTasks = projects
    .filter(p => projectTaskCounts[p.id])
    .sort((a, b) => (projectTaskCounts[b.id] || 0) - (projectTaskCounts[a.id] || 0))

  // ─── Rendu ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen" style={{ background: '#fafafa', fontFamily: 'Inter, sans-serif' }}>
      <Head>
        <title>Tâches — Maze Project</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <style>{`
          * { -webkit-tap-highlight-color: transparent; }
          @keyframes taskStrike {
            from { transform: translateY(-50%) rotate(-0.6deg) scaleX(0); }
            to   { transform: translateY(-50%) rotate(-0.6deg) scaleX(1); }
          }
          button, a { touch-action: manipulation; }
          input:focus, select:focus { border-color: ${PINK} !important; box-shadow: 0 0 0 3px ${PINK}22 !important; outline: none; }
          @media (max-width: 768px) { input, select, textarea { font-size: 16px !important; } }
          body { padding-bottom: env(safe-area-inset-bottom); }
        `}</style>
      </Head>

      {/* Feedback toast */}
      {feedback && (
        <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2 px-4 py-2 rounded-2xl shadow-lg text-sm font-medium text-white"
          style={{ background: feedback.type === 'err' ? '#ef4444' : PINK }}>
          {feedback.msg}
        </div>
      )}

      {/* Header */}
      <NavBar title="tâches">
        {activeCount > 0 && (
          <span className="px-1.5 py-0.5 rounded-full text-xs font-bold text-white"
            style={{ background: PINK }}>{activeCount}</span>
        )}
        {notifStatus !== 'unsupported' && notifStatus !== 'granted' && (
          <button onClick={requestNotifications} title="Activer les notifications"
            className="w-8 h-8 flex items-center justify-center rounded-full border text-base"
            style={{ borderColor: '#e5e7eb', color: '#9ca3af' }}>🔔</button>
        )}
        {notifStatus === 'granted' && (
          <span title="Notifications activées" className="w-8 h-8 flex items-center justify-center rounded-full text-base" style={{ background: '#f0fdf4' }}>🔔</span>
        )}
      </NavBar>

      {/* Tabs vue + Filtre personne — mobile uniquement */}
      <div className="md:hidden bg-white border-b px-4 pb-3 pt-2 space-y-2" style={{ borderColor: '#f0f0f0' }}>
        <div className="flex gap-1">
          {[
            { key: 'today', label: "Aujourd'hui" },
            { key: 'week', label: 'Semaine' },
            { key: 'twoweeks', label: '2 semaines' },
          ].map(v => (
            <button key={v.key} onClick={() => setView(v.key)}
              className="flex-1 py-2 rounded-xl text-xs font-semibold transition-all"
              style={view === v.key ? { background: PINK, color: 'white' } : { background: '#f3f4f6', color: '#6b7280' }}>
              {v.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          <button onClick={() => setPersonFilter('all')}
            className="px-3 py-1 rounded-full text-xs font-medium flex-shrink-0 transition-all"
            style={activePersonFilter === 'all' ? { background: '#111', color: 'white' } : { background: '#f3f4f6', color: '#6b7280' }}>
            Tous
          </button>
          {['Arnaud', 'Gabin', 'Guillaume'].map(p => (
            <button key={p} onClick={() => setPersonFilter(p)}
              className="px-3 py-1 rounded-full text-xs font-semibold flex-shrink-0 transition-all"
              style={activePersonFilter === p ? { background: PERSON_COLORS[p], color: 'white' } : { background: '#f3f4f6', color: '#6b7280' }}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Layout : sidebar (desktop) + liste */}
      <div className="w-full md:flex md:gap-8 px-6 sm:px-8 lg:px-10 py-8" style={{ maxWidth: 1800, margin: '0 auto' }}>

        {/* ── Sidebar desktop ── */}
        <aside className="hidden md:flex flex-col gap-6 flex-shrink-0 pt-1" style={{ width: 240 }}>
          {/* Période */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Période</p>
            {[
              { key: 'today',    label: "Aujourd'hui" },
              { key: 'week',     label: 'Cette semaine' },
              { key: 'twoweeks', label: '2 semaines' },
              { key: 'all',      label: 'Tout' },
            ].map(v => (
              <button key={v.key} onClick={() => setView(v.key)}
                className="w-full text-left px-3 py-2 rounded-md transition-all mb-0.5"
                style={view === v.key
                  ? { background: '#f3f4f6', color: '#111827', fontWeight: 600, fontSize: 14 }
                  : { color: '#6b7280', background: 'transparent', fontWeight: 500, fontSize: 14 }}>
                {v.label}
              </button>
            ))}
          </div>

          {/* Personne */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Personne</p>
            <button onClick={() => setPersonFilter('all')}
              className="w-full text-left px-3 py-2 rounded-md transition-all mb-0.5 flex items-center justify-between"
              style={activePersonFilter === 'all'
                ? { background: '#f3f4f6', color: '#111827', fontWeight: 600, fontSize: 14 }
                : { color: '#6b7280', fontSize: 14, fontWeight: 500 }}>
              <span>Toute l'équipe</span>
            </button>
            {(responsibles || []).filter(p => p !== 'non défini').map(p => {
              const color = colorForName(p)
              const n = totalActiveByPerson.filter(t => t.responsible === p).length
              return (
                <button key={p} onClick={() => setPersonFilter(p)}
                  className="w-full text-left px-3 py-2 rounded-md transition-all mb-0.5 flex items-center justify-between"
                  style={activePersonFilter === p
                    ? { background: color + '14', color: color, fontWeight: 600, fontSize: 14 }
                    : { color: '#6b7280', fontSize: 14, fontWeight: 500 }}>
                  <span className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                    {p}
                  </span>
                  {n > 0 && (
                    <span className="text-xs tabular-nums" style={{ color: activePersonFilter === p ? color : '#9ca3af' }}>{n}</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Projet */}
          {projectsWithTasks.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Projet</p>
              <button onClick={() => setProjectFilter('all')}
                className="w-full text-left px-3 py-2 rounded-md transition-all mb-0.5"
                style={projectFilter === 'all'
                  ? { background: '#f3f4f6', color: '#111827', fontWeight: 600, fontSize: 14 }
                  : { color: '#6b7280', fontSize: 14, fontWeight: 500 }}>
                Tous les projets
              </button>
              {projectsWithTasks.slice(0, 12).map(p => {
                const n = projectTaskCounts[p.id]
                return (
                  <button key={p.id} onClick={() => setProjectFilter(p.id)}
                    className="w-full text-left px-3 py-2 rounded-md transition-all mb-0.5 flex items-center justify-between gap-2"
                    style={projectFilter === p.id
                      ? { background: '#f3f4f6', color: '#111827', fontWeight: 600, fontSize: 13 }
                      : { color: '#6b7280', fontSize: 13, fontWeight: 500 }}>
                    <span className="truncate flex-1">{p.name}</span>
                    {n > 0 && (
                      <span className="text-xs text-gray-400 tabular-nums">{n}</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </aside>

        {/* ── Liste tâches ── */}
        <div className="flex-1 min-w-0">
          {/* Header desktop */}
          <div className="hidden md:flex items-baseline justify-between mb-6">
            <div>
              <h1 className="font-semibold text-gray-900 tracking-tight" style={{ fontSize: 26 }}>
                {activePersonFilter === 'all' ? 'Tâches' : `Tâches · ${activePersonFilter}`}
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {activeCount > 0
                  ? `${activeCount} tâche${activeCount > 1 ? 's' : ''} active${activeCount > 1 ? 's' : ''}`
                  : 'Aucune tâche active'}
                {projectFilter !== 'all' && projects.find(p => p.id === projectFilter) && (
                  <> · sur <span className="text-gray-900 font-medium">{projects.find(p => p.id === projectFilter).name}</span></>
                )}
              </p>
            </div>
            <button onClick={() => { setEditingTask(null); setShowForm(true) }}
              className="px-4 py-2 rounded-md text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: '#111827' }}>
              + Nouvelle tâche
            </button>
          </div>

          {loading ? (
            <div className="text-center py-20 text-gray-400 text-sm">Chargement…</div>
          ) : visibleTasks.length === 0 ? (
            <div className="text-center py-24 bg-white rounded-lg border border-gray-200">
              <p className="text-gray-400 text-sm">Aucune tâche dans cette vue.</p>
              <button onClick={() => { setEditingTask(null); setShowForm(true) }}
                className="mt-4 text-sm font-medium text-gray-700 hover:text-gray-900">
                + Créer une tâche
              </button>
            </div>
          ) : (
            <div className="space-y-8" style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}>
              {SECTIONS.filter(s => sectionsForView.includes(s.key)).map(section => {
                const items = grouped[section.key] || []
                if (items.length === 0) return null
                return (
                  <section key={section.key}>
                    <div className="flex items-baseline gap-3 mb-3">
                      <div className="flex items-baseline gap-2.5">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: section.color }} />
                        <h2 className="font-semibold tracking-tight" style={{ color: section.color, fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {section.label}
                        </h2>
                      </div>
                      <span className="text-xs text-gray-400 tabular-nums">{items.length}</span>
                    </div>
                    <div className="space-y-2">
                      {items.map(task => (
                        <TaskCard key={task.id} task={task} currentUser={currentUser}
                          onToggle={handleToggle} onEdit={handleEdit} onDelete={handleDelete} />
                      ))}
                    </div>
                  </section>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* FAB mobile uniquement */}
      <button
        onClick={() => { setEditingTask(null); setShowForm(true) }}
        className="fixed right-5 w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white text-2xl font-light active:scale-95 md:hidden"
        style={{ background: PINK, bottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
        +
      </button>

      {/* Formulaire */}
      {showForm && (
        <TaskForm task={editingTask} projects={projects} currentUser={currentUser}
          onSave={handleSave} onClose={() => { setShowForm(false); setEditingTask(null) }} />
      )}
    </div>
  )
}
