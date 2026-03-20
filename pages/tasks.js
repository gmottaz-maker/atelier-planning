import { useState, useEffect, useCallback } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useAuth } from './_app'

const PINK = '#FF4D6D'
const PEOPLE = ['Arnaud', 'Gabin', 'Guillaume', 'Sous-traitant']
const PERSON_COLORS = {
  Arnaud: '#3b82f6',
  Gabin: '#8b5cf6',
  Guillaume: PINK,
  'Sous-traitant': '#64748b',
}

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
  return date.toISOString().split('T')[0]
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
  const [striking, setStriking] = useState(false)
  const completed = task.status === 'completed'
  const personColor = PERSON_COLORS[task.responsible] || '#64748b'
  const projectName = task.projects?.name

  // Reset animation lorsqu'on ré-active la tâche
  useEffect(() => { if (!completed) setStriking(false) }, [completed])

  function handleToggle() {
    if (!completed) setStriking(true)
    onToggle(task)
  }

  const showLine = completed || striking

  return (
    <div
      className="bg-white rounded-2xl border transition-all"
      style={{
        borderColor: completed ? '#e5e7eb' : '#f3f4f6',
        opacity: completed ? 0.65 : 1,
      }}
    >
      <div className="flex items-center gap-3 p-4">
        {/* Checkbox — touch target 44px */}
        <button
          onClick={handleToggle}
          className="flex-shrink-0 flex items-center justify-center transition-all"
          style={{ width: 44, height: 44, margin: -10 }}
        >
          <div
            className="w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all"
            style={{
              borderColor: completed ? '#22c55e' : '#d1d5db',
              background: completed ? '#22c55e' : 'white',
            }}
          >
            {completed && (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </div>
        </button>

        {/* Contenu */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="relative flex-1 min-w-0">
              <p className={`text-sm font-semibold leading-snug ${completed ? 'text-gray-400' : 'text-gray-900'}`}>
                {task.is_private && <span className="mr-1">🔒</span>}
                {task.title}
              </p>
              {showLine && (
                <span style={{
                  position: 'absolute',
                  top: '50%',
                  left: '-2px',
                  right: '-2px',
                  height: '2px',
                  background: '#9ca3af',
                  borderRadius: '2px',
                  pointerEvents: 'none',
                  transformOrigin: 'left center',
                  transform: 'translateY(-50%) rotate(-0.6deg)',
                  animation: striking && !completed ? 'taskStrike 0.5s cubic-bezier(0.4,0,0.2,1) both' : 'none',
                }} />
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {!completed && (
                <button onClick={() => onEdit(task)}
                  className="p-1.5 text-gray-300 hover:text-gray-600 rounded-xl transition-colors">
                  ✏️
                </button>
              )}
              {(task.responsible === currentUser || currentUser === 'Guillaume') && (
                <button onClick={() => onDelete(task)}
                  className="p-1.5 text-gray-300 hover:text-red-400 rounded-xl transition-colors">
                  🗑️
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {/* Responsable */}
            <span className="px-2 py-0.5 rounded-full text-xs font-medium text-white"
              style={{ background: personColor }}>
              {task.responsible}
            </span>

            {/* Projet */}
            {projectName && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                {projectName}
              </span>
            )}

            {/* Countdown */}
            {!completed && <CountdownBadge task={task} />}

            {/* Date d'exécution si différente de aujourd'hui */}
            {!completed && task.execution_date !== toDateStr(today()) && (
              <span className="text-xs text-gray-400">📅 {formatDate(task.execution_date)}</span>
            )}
          </div>

          {task.notes && (
            <p className="text-xs text-gray-400 mt-1 italic">{task.notes}</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Formulaire (slide-up mobile) ─────────────────────────────────────────

function TaskForm({ task, projects, currentUser, onSave, onClose }) {
  const isEdit = !!task?.id
  const [form, setForm] = useState({
    title: task?.title || '',
    project_id: task?.project_id || '',
    responsible: task?.responsible || currentUser || 'Arnaud',
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

  const inputCls = "w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none bg-white"

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-t-3xl px-5 pt-5" style={{ maxHeight: '92vh', overflowY: 'auto', paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}>
        {/* Handle */}
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-900 text-base">
            {isEdit ? 'Modifier la tâche' : <><span style={{ color: PINK }}>Nouvelle</span> tâche</>}
          </h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500">×</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Titre */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Titre *</label>
            <input type="text" required autoFocus
              value={form.title} onChange={e => set('title', e.target.value)}
              placeholder="Ex: Découpe panneaux bar" className={inputCls}
              style={{ fontSize: 16 }} // évite le zoom iOS
            />
          </div>

          {/* Projet */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Projet lié</label>
            <select value={form.project_id} onChange={e => set('project_id', e.target.value)} className={inputCls} style={{ fontSize: 16 }}>
              <option value="">— Aucun projet —</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name} · {p.client}</option>)}
            </select>
          </div>

          {/* Responsable */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Responsable</label>
            <div className="flex gap-2 flex-wrap">
              {PEOPLE.filter(p => p !== 'Sous-traitant').map(p => (
                <button key={p} type="button"
                  onClick={() => set('responsible', p)}
                  className="px-3 py-1.5 rounded-full text-sm font-medium transition-all"
                  style={form.responsible === p
                    ? { background: PERSON_COLORS[p], color: 'white' }
                    : { background: '#f3f4f6', color: '#374151' }
                  }>
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Date d'exécution *</label>
              <input type="date" required value={form.execution_date}
                onChange={e => set('execution_date', e.target.value)} className={inputCls} style={{ fontSize: 16 }} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Échéance (optionnel)</label>
              <input type="date" value={form.due_date}
                onChange={e => set('due_date', e.target.value)} className={inputCls} style={{ fontSize: 16 }} />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Note</label>
            <input type="text" value={form.notes} onChange={e => set('notes', e.target.value)}
              placeholder="Détail ou info utile..." className={inputCls} style={{ fontSize: 16 }} />
          </div>

          {/* Privée */}
          <label className="flex items-center gap-3 py-1 cursor-pointer">
            <div
              onClick={() => set('is_private', !form.is_private)}
              className="w-11 h-6 rounded-full transition-colors flex items-center px-0.5"
              style={{ background: form.is_private ? PINK : '#d1d5db' }}>
              <div className="w-5 h-5 bg-white rounded-full shadow transition-transform"
                style={{ transform: form.is_private ? 'translateX(20px)' : 'translateX(0)' }} />
            </div>
            <span className="text-sm text-gray-700">🔒 Tâche privée (visible uniquement par moi)</span>
          </label>

          <button type="submit" disabled={saving}
            className="w-full py-3 rounded-2xl text-white font-semibold text-base transition-opacity disabled:opacity-50"
            style={{ background: PINK }}>
            {saving ? 'Enregistrement...' : isEdit ? 'Mettre à jour' : 'Créer la tâche'}
          </button>
        </form>
      </div>
    </div>
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
  const currentUser = user?.name || null

  const [tasks, setTasks] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('today')       // 'today' | 'week' | 'twoweeks'
  const [personFilter, setPersonFilter] = useState(null) // null = not initialized yet
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

  function taskInView(task) {
    const eff = effectiveDate(task)
    const effStr = toDateStr(eff)
    const completed = task.status === 'completed'

    // Tâches terminées : afficher seulement si complétées aujourd'hui
    if (completed && !isCompletedToday(task)) return false

    if (view === 'today') {
      // Auto-rollover : tâches actives en retard = aujourd'hui
      if (!completed && task.execution_date < todayStr) return true
      return effStr === todayStr
    }
    if (view === 'week') return effStr <= weekEnd
    if (view === 'twoweeks') return effStr <= twoWeeksEnd
    return true
  }

  function taskVisible(task) {
    // Masquer les tâches privées des autres
    if (task.is_private && task.responsible !== currentUser) return false
    // Filtre par personne
    if (activePersonFilter !== 'all' && task.responsible !== activePersonFilter) return false
    // Filtre par vue temporelle
    return taskInView(task)
  }

  const visibleTasks = tasks.filter(taskVisible)

  // Tri : tâches actives d'abord (par date), puis complétées
  const sorted = [
    ...visibleTasks.filter(t => t.status === 'active').sort((a, b) => {
      const da = toDateStr(effectiveDate(a))
      const db = toDateStr(effectiveDate(b))
      return da.localeCompare(db)
    }),
    ...visibleTasks.filter(t => t.status === 'completed'),
  ]

  const activeCount = sorted.filter(t => t.status === 'active').length

  // ─── Rendu ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen" style={{ background: '#fafafa', fontFamily: 'Inter, sans-serif' }}>
      <Head>
        <title>Tâches — Amazing Lab</title>
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
      <header className="sticky top-0 z-10 bg-white border-b" style={{ borderColor: '#f0f0f0' }}>
        <div className="max-w-6xl mx-auto px-4 pt-3 pb-0">
          <div className="flex items-center justify-between mb-3">
            {/* Logo + titre */}
            <div className="flex items-center gap-2">
              <svg width="20" height="20" viewBox="0 0 40 40" fill="none">
                <ellipse cx="20" cy="20" rx="18" ry="7" stroke={PINK} strokeWidth="2" fill="none" />
                <ellipse cx="20" cy="20" rx="18" ry="7" stroke={PINK} strokeWidth="2" fill="none" transform="rotate(60 20 20)" />
                <ellipse cx="20" cy="20" rx="18" ry="7" stroke={PINK} strokeWidth="2" fill="none" transform="rotate(120 20 20)" />
                <circle cx="20" cy="20" r="3" fill={PINK} />
              </svg>
              <span className="font-bold text-gray-900 text-sm">tâches</span>
              {activeCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-xs font-bold text-white"
                  style={{ background: PINK }}>{activeCount}</span>
              )}
            </div>

            {/* Nav + identité */}
            <div className="flex items-center gap-2">
              <Link href="/" className="text-xs text-gray-400 px-2 py-1 rounded-full border border-gray-200 hover:border-gray-400 transition-colors">Projets</Link>
              <Link href="/activity" className="text-xs text-gray-400 px-2 py-1 rounded-full border border-gray-200 hover:border-gray-400 transition-colors">
                <span className="hidden sm:inline">Activité</span><span className="sm:hidden">📊</span>
              </Link>
              {notifStatus !== 'unsupported' && notifStatus !== 'granted' && (
                <button onClick={requestNotifications} title="Activer les notifications"
                  className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 text-gray-400 text-base">🔔</button>
              )}
              {notifStatus === 'granted' && (
                <span title="Notifications activées" className="w-8 h-8 flex items-center justify-center rounded-full text-base" style={{ background: '#f0fdf4' }}>🔔</span>
              )}
              <button onClick={() => signOut()} title="Se déconnecter"
                className="px-3 py-1.5 rounded-full text-xs font-semibold text-white"
                style={{ background: PERSON_COLORS[currentUser] || PINK }}>
                {currentUser}
              </button>
            </div>
          </div>

          {/* Tabs vue — mobile uniquement (desktop: sidebar) */}
          <div className="flex gap-1 pb-3 md:hidden">
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

          {/* Filtre personne — mobile uniquement */}
          <div className="flex gap-2 pb-3 overflow-x-auto md:hidden" style={{ scrollbarWidth: 'none' }}>
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
      </header>

      {/* Layout : sidebar (desktop) + liste */}
      <div className="max-w-6xl mx-auto md:flex md:gap-6 px-4 py-4">

        {/* ── Sidebar desktop ── */}
        <aside className="hidden md:flex flex-col gap-3 w-52 flex-shrink-0 pt-2">
          {/* Vue temporelle */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Période</p>
            {[
              { key: 'today', label: "Aujourd'hui" },
              { key: 'week', label: 'Cette semaine' },
              { key: 'twoweeks', label: '2 semaines' },
            ].map(v => (
              <button key={v.key} onClick={() => setView(v.key)}
                className="w-full text-left px-3 py-2 rounded-xl text-sm font-medium transition-all mb-1"
                style={view === v.key
                  ? { background: PINK + '15', color: PINK, fontWeight: 600 }
                  : { color: '#6b7280', background: 'transparent' }}>
                {v.label}
              </button>
            ))}
          </div>

          {/* Filtre personne */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 mt-2">Personne</p>
            <button onClick={() => setPersonFilter('all')}
              className="w-full text-left px-3 py-2 rounded-xl text-sm font-medium transition-all mb-1"
              style={activePersonFilter === 'all'
                ? { background: '#11111115', color: '#111', fontWeight: 600 }
                : { color: '#6b7280' }}>
              👥 Tous
            </button>
            {['Arnaud', 'Gabin', 'Guillaume'].map(p => (
              <button key={p} onClick={() => setPersonFilter(p)}
                className="w-full text-left px-3 py-2 rounded-xl text-sm font-medium transition-all mb-1 flex items-center gap-2"
                style={activePersonFilter === p
                  ? { background: PERSON_COLORS[p] + '18', color: PERSON_COLORS[p], fontWeight: 600 }
                  : { color: '#6b7280' }}>
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PERSON_COLORS[p] }} />
                {p}
              </button>
            ))}
          </div>

          {/* Stats rapides */}
          <div className="mt-4 p-3 rounded-2xl" style={{ background: PINK + '0A' }}>
            <p className="text-xs font-semibold mb-2" style={{ color: PINK }}>
              {activeCount} tâche{activeCount > 1 ? 's' : ''} active{activeCount > 1 ? 's' : ''}
            </p>
            {['Arnaud', 'Gabin', 'Guillaume'].map(p => {
              const n = sorted.filter(t => t.responsible === p && t.status === 'active').length
              if (!n) return null
              return (
                <div key={p} className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500">{p}</span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                    style={{ background: PERSON_COLORS[p] }}>{n}</span>
                </div>
              )
            })}
          </div>
        </aside>

        {/* ── Liste tâches ── */}
        <div className="flex-1 min-w-0">
          {/* Bouton "Nouvelle tâche" desktop */}
          <div className="hidden md:flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-gray-700">
              {activePersonFilter === 'all' ? 'Toutes les tâches' : `Tâches de ${activePersonFilter}`}
              {activeCount > 0 && <span className="ml-2 text-xs text-gray-400 font-normal">{activeCount} active{activeCount > 1 ? 's' : ''}</span>}
            </p>
            <button onClick={() => { setEditingTask(null); setShowForm(true) }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: PINK }}>
              + Nouvelle tâche
            </button>
          </div>

          <div className="space-y-2" style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}>
            {loading ? (
              <div className="text-center py-16 text-gray-400 text-sm">Chargement...</div>
            ) : sorted.length === 0 ? (
              <div className="text-center py-20">
                <div className="text-4xl mb-3">✅</div>
                <p className="text-gray-400 text-sm">Rien pour cette période !</p>
              </div>
            ) : (
              sorted.map(task => (
                <TaskCard key={task.id} task={task} currentUser={currentUser}
                  onToggle={handleToggle} onEdit={handleEdit} onDelete={handleDelete} />
              ))
            )}
          </div>
        </div>
      </div>

      {/* FAB mobile uniquement */}
      <button
        onClick={() => { setEditingTask(null); setShowForm(true) }}
        className="fixed right-5 w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white text-2xl font-light active:scale-95 md:hidden"
        style={{ background: PINK, bottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}>
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
