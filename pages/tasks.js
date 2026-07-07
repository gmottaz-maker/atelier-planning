import { useState, useEffect, useCallback } from 'react'
import useSWR from 'swr'
import Head from 'next/head'
import { useAuth } from './_app'
import { useResponsibles } from '../lib/useResponsibles'
import TaskFormDrawer from '../components/TaskFormDrawer'
import { C, FONT, MONO, personChip } from '../lib/theme'

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
  { key: 'overdue',        label: 'En retard',                color: '#c03d2e' },
  { key: 'today',          label: "Aujourd'hui",              color: '#a26a1f' },
  { key: 'tomorrow',       label: 'Demain',                   color: '#a26a1f' },
  { key: 'thisWeek',       label: 'Cette semaine',            color: '#3e6d9e' },
  { key: 'nextWeek',       label: 'Semaine prochaine',        color: '#6b5f65' },
  { key: 'later',          label: 'Plus tard',                color: '#9a8d93' },
  { key: 'noDate',         label: 'Sans date',                color: '#9a8d93' },
  { key: 'completedToday', label: "Terminées aujourd'hui",    color: '#3e8e6e' },
]

// Badge d'échéance mono à droite de la ligne (12a)
function dueBadge(task, days) {
  if (days == null) return null
  if (days < 0)   return { text: `${-days}J DE RETARD`, fg: '#c03d2e', bg: '#f9e7e4' }
  if (days === 0) return { text: "AUJOURD'HUI",         fg: '#a26a1f', bg: '#f5ecda' }
  if (days === 1) return { text: 'DEMAIN',              fg: '#a26a1f', bg: '#f5ecda' }
  if (days <= 14) return { text: `J-${days}`,           fg: '#3e6d9e', bg: '#e5ecf4' }
  return { text: `J-${days}`, fg: '#6b5f65', bg: '#f2eaed' }
}

// Rail de filtres (12a)
const railLabel = { font: `500 10px ${MONO}`, letterSpacing: '.12em', color: C.muted, padding: '0 10px 6px' }
function railItem(active) {
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '6px 10px', borderRadius: 6, fontSize: 13, textAlign: 'left',
    border: 'none', width: '100%', cursor: 'pointer', marginBottom: 1, fontFamily: FONT,
    background: active ? C.divider : 'transparent',
    color: active ? C.ink : C.inkSecondary, fontWeight: active ? 600 : 400,
  }
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
  const chip        = personChip(task.responsible)
  const projectName = task.projects?.name
  const canDelete   = task.responsible === currentUser || currentUser === 'Guillaume'
  const badge       = !completed && dueBadge(task, daysRemaining(task))

  return (
    <div className="group" style={{
      background: C.surface, border: `1px solid ${completed ? C.divider : C.border}`,
      borderRadius: 8, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 12,
      opacity: completed ? 0.6 : 1, fontFamily: FONT,
    }}>
      {/* Checkbox */}
      <button onClick={() => onToggle(task)} aria-label="Basculer" style={{
        width: 17, height: 17, borderRadius: '50%', flex: 'none', cursor: 'pointer', padding: 0,
        border: completed ? 'none' : `2px solid ${C.faintBorder}`,
        background: completed ? C.success : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 9,
      }}>{completed && '✓'}</button>

      {/* Corps */}
      <button onClick={() => !completed && onEdit(task)}
        style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: completed ? 'default' : 'pointer', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {task.is_private && <span style={{ fontSize: 11 }} title="Privée">🔒</span>}
          <span style={{ fontSize: 13.5, fontWeight: completed ? 400 : 600, color: completed ? C.muted : C.ink, textDecoration: completed ? 'line-through' : 'none' }}>{task.title}</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: chip.fg, background: chip.bg, padding: '2px 9px', borderRadius: 6 }}>{task.responsible}</span>
          {projectName && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: completed ? C.faintChevron : C.muted }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.faint }} />
              {projectName}
            </span>
          )}
        </span>
      </button>

      {/* Badge échéance */}
      {badge && (
        <span style={{ font: `10px ${MONO}`, color: badge.fg, background: badge.bg, padding: '2px 8px', borderRadius: 99, whiteSpace: 'nowrap', flex: 'none' }}>{badge.text}</span>
      )}

      {/* Actions au survol */}
      {!completed && (
        <span className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ display: 'flex', gap: 10, fontSize: 11.5, flex: 'none' }}>
          <button onClick={() => onEdit(task)} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', padding: 0, font: `11.5px ${FONT}` }}>Modifier</button>
          {canDelete && (
            <button onClick={() => onDelete(task)} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', padding: 0, font: `11.5px ${FONT}` }}>Supprimer</button>
          )}
        </span>
      )}
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

  // Données via SWR : cache instantané + revalidation au focus
  const { data: tasks = [], isLoading: tasksLoading, mutate: mutateTasks } = useSWR('/api/tasks')
  const { data: allProjects = [], mutate: mutateProjects } = useSWR('/api/projects')
  const projects = allProjects.filter(p => p.status === 'active')
  const loading = tasksLoading && tasks.length === 0
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

  const fetchAll = useCallback(() => {
    mutateTasks()
    mutateProjects()
  }, [mutateTasks, mutateProjects])

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
    if (!task.execution_date) return 'noDate'
    if (task.status === 'active' && task.execution_date < todayStr) return 'overdue'
    const eff = toDateStr(effectiveDate(task))
    if (eff === todayStr) return 'today'
    if (eff === tomorrowStr) return 'tomorrow'
    if (eff <= weekEnd) return 'thisWeek'
    if (eff <= nextWeekEnd) return 'nextWeek'
    return 'later'
  }

  // Sections visibles selon la vue choisie — "noDate" toujours présent
  const sectionsForView = {
    today:    ['overdue', 'today', 'noDate', 'completedToday'],
    week:     ['overdue', 'today', 'tomorrow', 'thisWeek', 'noDate', 'completedToday'],
    twoweeks: ['overdue', 'today', 'tomorrow', 'thisWeek', 'nextWeek', 'noDate', 'completedToday'],
    all:      ['overdue', 'today', 'tomorrow', 'thisWeek', 'nextWeek', 'later', 'noDate', 'completedToday'],
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
    <div className="min-h-screen" style={{ background: C.pageBg, fontFamily: FONT, color: C.ink }}>
      <Head>
        <title>Tâches — Maze Project</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <style>{`
          * { -webkit-tap-highlight-color: transparent; }
          button, a { touch-action: manipulation; }
          input:focus, select:focus { border-color: ${C.faintBorder} !important; box-shadow: 0 0 0 3px rgba(224,80,110,0.08) !important; outline: none; }
          @media (max-width: 768px) { input, select, textarea { font-size: 16px !important; } }
          body { padding-bottom: env(safe-area-inset-bottom); }
        `}</style>
      </Head>

      {/* Feedback toast */}
      {feedback && (
        <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2 px-4 py-2 rounded-2xl shadow-lg text-sm font-medium text-white"
          style={{ background: feedback.type === 'err' ? C.danger : C.ink }}>
          {feedback.msg}
        </div>
      )}

      {/* Header 12a */}
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '26px 32px 0' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, borderBottom: `1px solid ${C.border}`, paddingBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 23, fontWeight: 700, letterSpacing: '-.4px' }}>Tâches</span>
            <span style={{ font: `11.5px ${MONO}`, color: C.muted }}>
              {activeCount} ACTIVE{activeCount > 1 ? 'S' : ''} · {activePersonFilter === 'all' ? "TOUTE L'ÉQUIPE" : activePersonFilter.toUpperCase()} · {({ today: "AUJOURD'HUI", week: 'CETTE SEMAINE', twoweeks: '2 SEMAINES', all: 'TOUT' })[view]}
            </span>
          </div>
          <div style={{ flex: 1 }} />
          {notifStatus !== 'unsupported' && notifStatus !== 'granted' && (
            <button onClick={requestNotifications} title="Activer les notifications"
              style={{ width: 34, height: 34, borderRadius: '50%', border: `1px solid ${C.border}`, background: C.surface, color: C.muted, cursor: 'pointer', fontSize: 15 }}>🔔</button>
          )}
          <button onClick={() => { setEditingTask(null); setShowForm(true) }}
            style={{ border: `1px solid ${C.ink}`, background: C.ink, color: C.accentOnDark, font: `600 12.5px ${FONT}`, padding: '9px 16px', borderRadius: 5, cursor: 'pointer' }}>
            + NOUVELLE TÂCHE
          </button>
        </div>
      </div>

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

      {/* Layout 12a : rail + liste */}
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '16px 32px 40px', display: 'flex', gap: 28 }}>

        {/* ── Rail de filtres (desktop) ── */}
        <aside className="hidden md:flex" style={{ width: 186, flex: 'none', flexDirection: 'column' }}>
          <div style={railLabel}>PÉRIODE</div>
          {[
            { key: 'today',    label: "Aujourd'hui" },
            { key: 'week',     label: 'Cette semaine' },
            { key: 'twoweeks', label: '2 semaines' },
            { key: 'all',      label: 'Tout' },
          ].map(v => (
            <button key={v.key} onClick={() => setView(v.key)} style={railItem(view === v.key)}>
              <span>{v.label}</span>
            </button>
          ))}

          <div style={{ ...railLabel, paddingTop: 14 }}>PERSONNE</div>
          <button onClick={() => setPersonFilter('all')} style={railItem(activePersonFilter === 'all')}>
            <span>Toute l'équipe</span>
          </button>
          {(responsibles || []).filter(p => p !== 'non défini').map(p => {
            const n = totalActiveByPerson.filter(t => t.responsible === p).length
            return (
              <button key={p} onClick={() => setPersonFilter(p)} style={railItem(activePersonFilter === p)}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: personChip(p).fg }} />
                  {p}
                </span>
                {n > 0 && <span style={{ font: `10.5px ${MONO}`, color: C.faint }}>{n}</span>}
              </button>
            )
          })}

          {projectsWithTasks.length > 0 && (
            <>
              <div style={{ ...railLabel, paddingTop: 14 }}>PROJET</div>
              <button onClick={() => setProjectFilter('all')} style={railItem(projectFilter === 'all')}>
                <span>Tous les projets</span>
              </button>
              {projectsWithTasks.slice(0, 12).map(p => {
                const n = projectTaskCounts[p.id]
                return (
                  <button key={p.id} onClick={() => setProjectFilter(p.id)} style={railItem(projectFilter === p.id)}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                    {n > 0 && <span style={{ font: `10.5px ${MONO}`, color: C.faint, flex: 'none' }}>{n}</span>}
                  </button>
                )
              })}
            </>
          )}
        </aside>

        {/* ── Liste tâches ── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '80px 0', color: C.muted, fontSize: 13 }}>Chargement…</div>
          ) : visibleTasks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 0', background: C.surface, borderRadius: 8, border: `1px solid ${C.border}` }}>
              <p style={{ color: C.muted, fontSize: 13 }}>Aucune tâche dans cette vue.</p>
              <button onClick={() => { setEditingTask(null); setShowForm(true) }}
                style={{ marginTop: 14, font: `600 12px ${FONT}`, color: C.inkSecondary, background: 'none', border: 'none', cursor: 'pointer' }}>
                + Créer une tâche
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}>
              {SECTIONS.filter(s => sectionsForView.includes(s.key)).map(section => {
                const items = grouped[section.key] || []
                if (items.length === 0) return null
                return (
                  <section key={section.key} style={{ display: 'contents' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: section.color, flex: 'none' }} />
                      <span style={{ font: `500 10px ${MONO}`, letterSpacing: '.12em', color: section.color }}>{section.label.toUpperCase()}</span>
                      <span style={{ font: `10px ${MONO}`, color: C.muted }}>{items.length}</span>
                    </div>
                    {items.map(task => (
                      <TaskCard key={task.id} task={task} currentUser={currentUser}
                        onToggle={handleToggle} onEdit={handleEdit} onDelete={handleDelete} />
                    ))}
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
        <TaskFormDrawer task={editingTask} projects={projects} currentUser={currentUser}
          onSave={handleSave} onClose={() => { setShowForm(false); setEditingTask(null) }} />
      )}
    </div>
  )
}
