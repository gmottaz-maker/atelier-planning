import { useState, useEffect, useCallback } from 'react'
import useSWR from 'swr'
import Head from 'next/head'
import { useAuth } from './_app'
import { useResponsibles } from '../lib/useResponsibles'
import TaskFormDrawer from '../components/TaskFormDrawer'
import { AL, C, FONT, MONO, R, personChip } from '../lib/theme'
import ButtonPill from '../components/ButtonPill'
import useIsAdmin from '../lib/useIsAdmin'

const PINK = AL.black
const PEOPLE = ['Arnaud', 'Guillaume', 'Gabin', 'non défini']  // valeur par défaut, surchargée par useResponsibles()
// Aligné sur PERSON de lib/theme.js — une seule source pour la couleur des gens.
const PERSON_COLORS = {
  Arnaud: personChip('Arnaud').fg,
  Gabin: personChip('Gabin').fg,
  Guillaume: personChip('Guillaume').fg,
  'Sous-traitant': C.muted,
  'non défini': C.muted,
  'Coople': C.muted,
}

function colorForName(name) {
  if (PERSON_COLORS[name]) return PERSON_COLORS[name]
  if (!name) return C.muted
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return `hsl(${Math.abs(hash) % 360}, 45%, 48%)`
}

// Couleurs de groupe. Le handoff les annonce comme « reprises du code », mais
// le code portait encore la palette de juillet : elles passent au système v2 là
// où un équivalent existe. Le bleu de « cette semaine » n'a pas d'équivalent —
// il reste, et c'est le même que la chip d'Arnaud, que le design system porte.
const SECTIONS = [
  { key: 'overdue',        label: 'En retard',                color: C.danger },
  { key: 'today',          label: "Aujourd'hui",              color: C.warning },
  { key: 'tomorrow',       label: 'Demain',                   color: C.warning },
  { key: 'thisWeek',       label: 'Cette semaine',            color: C.info },
  { key: 'nextWeek',       label: 'Semaine prochaine',        color: C.muted },
  { key: 'later',          label: 'Plus tard',                color: C.muted },
  { key: 'noDate',         label: 'Sans date',                color: C.muted },
  { key: 'completedToday', label: "Terminées aujourd'hui",    color: C.success },
]

// Badge d'échéance mono à droite de la ligne (12a)
function dueBadge(task, days) {
  if (days == null) return null
  if (days < 0)   return { text: `${-days}j de retard`, fg: C.danger }
  if (days === 0) return { text: "aujourd'hui",         fg: C.warning }
  if (days === 1) return { text: 'demain',              fg: C.warning }
  if (days <= 14) return { text: `J-${days}`,           fg: C.info }
  return { text: `J-${days}`, fg: C.muted }
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
  if (days < 0) { bg = C.dangerBg; color = C.danger; label = `${Math.abs(days)}j de retard` }
  else if (days === 0) { bg = C.dangerBg; color = C.danger; label = "aujourd'hui" }
  else if (days === 1) { bg = C.warningBg; color = C.warning; label = 'demain' }
  else if (days <= 7) { bg = C.warningBg; color = C.warning; label = `J-${days}` }
  else { bg = C.successBg; color = C.success; label = `J-${days}` }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px',
      borderRadius: R.pill, fontSize: 11, fontWeight: 500, background: bg, color }}>
      {hasDueDate && <span title="Date d'échéance">⏰</span>}
      {label}
    </span>
  )
}

// ─── Composant TaskCard ───────────────────────────────────────────────────

function TaskCard({ task, currentUser, isAdmin, onToggle, onEdit, onDelete }) {
  const completed   = task.status === 'completed'
  const chip        = personChip(task.responsible)
  const projectName = task.projects?.name
  const canDelete   = task.responsible === currentUser || isAdmin
  const badge       = !completed && dueBadge(task, daysRemaining(task))

  return (
    // Ligne, pas carte : le séparateur est un filet HAUT. Les tâches d'un même
    // groupe forment ainsi une liste continue, sans 8 bordures empilées.
    <div className="group" style={{
      display: 'flex', alignItems: 'center', gap: 14, padding: '13px 4px',
      borderTop: `1px solid ${C.border}`, opacity: completed ? 0.6 : 1, fontFamily: FONT,
    }}>
      {/* Case à cocher carrée, filet outline 1.5px */}
      <button onClick={() => onToggle(task)} aria-label="Basculer" style={{
        width: 16, height: 16, borderRadius: 4, flex: 'none', cursor: 'pointer', padding: 0,
        border: completed ? 'none' : `1.5px solid ${C.outline}`,
        background: completed ? C.success : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: AL.white, fontSize: 9,
      }}>{completed && '✓'}</button>

      {/* Corps */}
      <button onClick={() => !completed && onEdit(task)}
        style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: completed ? 'default' : 'pointer', display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {task.is_private && <span style={{ fontSize: 11 }} title="Privée">🔒</span>}
          <span style={{ fontSize: 14.5, fontWeight: 500, color: completed ? C.muted : AL.black, textDecoration: completed ? 'line-through' : 'none' }}>{task.title}</span>
        </span>
        {projectName && <span style={{ fontSize: 12.5, color: C.muted }}>{projectName}</span>}
      </button>

      {/* Chip de personne */}
      <span style={{ fontSize: 12, fontWeight: 500, color: chip.fg, background: chip.bg,
        padding: '5px 12px', borderRadius: R.pill, flex: 'none', whiteSpace: 'nowrap' }}>{task.responsible}</span>

      {/* Échéance, dans la couleur du groupe */}
      <span style={{ fontSize: 13, color: badge ? badge.fg : C.muted, width: 110, textAlign: 'right', flex: 'none', whiteSpace: 'nowrap' }}>
        {badge ? badge.text : '—'}
      </span>

      {/* Actions au survol */}
      {!completed && (
        <span className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ display: 'flex', gap: 12, flex: 'none' }}>
          <button onClick={() => onEdit(task)} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', padding: 0, font: `12px ${FONT}` }}
            onMouseEnter={e => { e.currentTarget.style.color = AL.black }} onMouseLeave={e => { e.currentTarget.style.color = C.muted }}>modifier</button>
          {canDelete && (
            <button onClick={() => onDelete(task)} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', padding: 0, font: `12px ${FONT}` }}
              onMouseEnter={e => { e.currentTarget.style.color = AL.black }} onMouseLeave={e => { e.currentTarget.style.color = C.muted }}>supprimer</button>
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
  if (ref === todayStr) return { label: "Aujourd'hui", color: C.warning }
  const [y, m, d] = ref.split('-').map(Number)
  const date = new Date(y, m-1, d); date.setHours(0,0,0,0)
  const diff = Math.round((date - today()) / 86400000)
  if (diff < 0) return { label: `${Math.abs(diff)}j en retard`, color: C.danger }
  if (diff === 1) return { label: 'Demain', color: C.warning }
  if (diff <= 7) return { label: `Dans ${diff}j`, color: C.info }
  return { label: date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }), color: C.muted }
}


// ─── Sélecteur d'identité ─────────────────────────────────────────────────

function WhoAreYou({ onSelect }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center px-6"
      style={{ background: AL.white }}>
      <div className="mb-8 text-center">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="mx-auto mb-3">
          <ellipse cx="20" cy="20" rx="18" ry="7" stroke={PINK} strokeWidth="2" fill="none" />
          <ellipse cx="20" cy="20" rx="18" ry="7" stroke={PINK} strokeWidth="2" fill="none" transform="rotate(60 20 20)" />
          <ellipse cx="20" cy="20" rx="18" ry="7" stroke={PINK} strokeWidth="2" fill="none" transform="rotate(120 20 20)" />
          <circle cx="20" cy="20" r="3" fill={PINK} />
        </svg>
        <p className="font-bold u-ink text-lg">amazing lab</p>
        <p className="u-muted text-sm mt-1">Qui es-tu ?</p>
      </div>
      <div className="w-full space-y-3 max-w-xs">
        {['Arnaud', 'Gabin', 'Guillaume'].map(p => (
          <button key={p} onClick={() => onSelect(p)}
            className="w-full py-4 u-panel text-white text-lg font-semibold transition-opacity hover:opacity-90"
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
  const isAdmin = useIsAdmin()

  // Données via SWR : cache instantané + revalidation au focus
  const { data: tasks = [], isLoading: tasksLoading, mutate: mutateTasks } = useSWR('/api/tasks')
  const { data: allProjects = [], mutate: mutateProjects } = useSWR('/api/projects?light=1')
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
    // Vérifier la réponse : sans ça, un refus côté base passait pour un succès
    // (« Tâche créée ✓ ») alors que rien n'était enregistré.
    const r = await fetch(id ? `/api/tasks/${id}` : '/api/tasks', {
      method: id ? 'PUT' : 'POST',
      headers: actorHeaders(),
      body: JSON.stringify(body),
    })
    let d = {}
    try { d = await r.json() } catch (_) {}
    if (!r.ok || d.error) {
      showMsg('Erreur : ' + (d.error || `échec ${r.status}`))
      return
    }
    showMsg(id ? 'Tâche mise à jour ✓' : 'Tâche créée ✓')
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
        <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2 px-4 py-2 u-panel shadow-lg text-sm font-medium text-white"
          style={{ background: feedback.type === 'err' ? C.danger : C.ink }}>
          {feedback.msg}
        </div>
      )}

      {/* Header 12a */}
      <div style={{ padding: '32px 40px 0' }}>
        <h1 style={{ fontSize: 38, fontWeight: 500, lineHeight: 1.05, letterSpacing: '-.01em', margin: 0, color: AL.black }}>Tâches</h1>
        <p style={{ fontSize: 18, color: C.muted, margin: '12px 0 32px' }}>
          {activeCount} tâche{activeCount > 1 ? 's' : ''} active{activeCount > 1 ? 's' : ''}
          {' · '}{activePersonFilter === 'all' ? "toute l'équipe" : activePersonFilter.toLowerCase()}
        </p>
      </div>

      {/* Tabs vue + Filtre personne — mobile uniquement */}
      <div className="md:hidden px-4 pb-3 pt-2 space-y-2" style={{ borderBottom: `1px solid ${C.border}`, background: C.surface }}>
        <div className="flex gap-1">
          {[
            { key: 'today', label: "Aujourd'hui" },
            { key: 'week', label: 'Semaine' },
            { key: 'twoweeks', label: '2 semaines' },
          ].map(v => (
            <button key={v.key} onClick={() => setView(v.key)}
              className="flex-1 py-2 text-xs transition-all"
              style={view === v.key ? { background: AL.black, color: AL.white, borderRadius: R.pill } : { background: C.neutralBg, color: C.muted, borderRadius: R.pill }}>
              {v.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          <button onClick={() => setPersonFilter('all')}
            className="px-3 py-1 u-pill text-xs font-medium flex-shrink-0 transition-all"
            style={activePersonFilter === 'all' ? { background: AL.black, color: AL.white } : { background: C.neutralBg, color: C.muted }}>
            Tous
          </button>
          {['Arnaud', 'Gabin', 'Guillaume'].map(p => (
            <button key={p} onClick={() => setPersonFilter(p)}
              className="px-3 py-1 u-pill text-xs font-semibold flex-shrink-0 transition-all"
              style={activePersonFilter === p ? { background: personChip(p).fg, color: AL.white } : { background: personChip(p).bg, color: personChip(p).fg }}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Barre de filtres.
          Le handoff v1 (tour 12a) dessinait un rail de 186px à gauche ; le
          prototype v2 l'a remplacé par des chips en ligne. Le filtre PROJET
          n'existe pas dans la maquette v2 mais existe dans le code : il reste,
          en select pilule, plutôt que de perdre la fonction. */}
      <div style={{ padding: '0 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { key: 'today',    label: "aujourd'hui" },
              { key: 'week',     label: 'cette semaine' },
              { key: 'twoweeks', label: '2 semaines' },
              { key: 'all',      label: 'tout' },
            ].map(v => {
              const actif = view === v.key
              return (
                <button key={v.key} onClick={actif ? undefined : () => setView(v.key)}
                  style={{ fontFamily: FONT, fontSize: 13, fontWeight: actif ? 500 : 400, padding: '8px 16px',
                    borderRadius: R.pill, border: `1.5px solid ${C.outline}`,
                    background: actif ? AL.black : C.surface, color: actif ? AL.white : AL.black,
                    cursor: actif ? 'default' : 'pointer' }}>{v.label}</button>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[{ nom: 'all', label: "toute l'équipe" }, ...(responsibles || []).filter(p => p !== 'non défini').map(p => ({ nom: p, label: p }))].map(p => {
              const actif = activePersonFilter === p.nom
              const chip = p.nom === 'all' ? { fg: C.muted, bg: C.hover } : personChip(p.nom)
              const n = p.nom === 'all' ? 0 : totalActiveByPerson.filter(t => t.responsible === p.nom).length
              return (
                <button key={p.nom} onClick={() => setPersonFilter(p.nom)}
                  style={{ fontFamily: FONT, fontSize: 12, fontWeight: 500, padding: '6px 13px', borderRadius: R.pill,
                    border: actif ? `1.5px solid ${C.outline}` : '1.5px solid transparent',
                    background: chip.bg, color: chip.fg, cursor: 'pointer' }}>
                  {p.label}{n > 0 ? ` ${n}` : ''}
                </button>
              )
            })}
          </div>

          {projectsWithTasks.length > 0 && (
            <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)}
              style={{ fontFamily: FONT, fontSize: 13, padding: '8px 16px', borderRadius: R.pill,
                border: `1.5px solid ${C.outline}`, background: C.surface, color: AL.black, cursor: 'pointer', maxWidth: 220 }}>
              <option value="all">tous les projets</option>
              {projectsWithTasks.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({projectTaskCounts[p.id]})</option>
              ))}
            </select>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {notifStatus !== 'unsupported' && notifStatus !== 'granted' && (
            <button onClick={requestNotifications} title="Activer les notifications"
              style={{ width: 40, height: 40, borderRadius: R.pill, border: `1.5px solid ${C.outline}`,
                background: C.surface, color: C.muted, cursor: 'pointer', fontSize: 15 }}>🔔</button>
          )}
          <ButtonPill onClick={() => { setEditingTask(null); setShowForm(true) }}>+ nouvelle tâche</ButtonPill>
        </div>
      </div>

      <div style={{ padding: '0 40px 104px' }}>
        {/* ── Liste tâches ── */}
        <div style={{ minWidth: 0 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '80px 0', color: C.muted, fontSize: 13 }}>Chargement…</div>
          ) : visibleTasks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
              <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>Aucune tâche dans cette vue.</p>
              <button onClick={() => { setEditingTask(null); setShowForm(true) }}
                style={{ marginTop: 14, font: `12px ${FONT}`, color: C.muted, background: 'none', border: 'none', cursor: 'pointer' }}
                onMouseEnter={e => { e.currentTarget.style.color = AL.black }}
                onMouseLeave={e => { e.currentTarget.style.color = C.muted }}>
                + créer une tâche
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}>
              {SECTIONS.filter(s => sectionsForView.includes(s.key)).map(section => {
                const items = grouped[section.key] || []
                if (items.length === 0) return null
                return (
                  <section key={section.key} style={{ display: 'contents' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 24 }}>
                      <span style={{ font: `700 10.5px ${MONO}`, letterSpacing: '.1em', textTransform: 'uppercase', color: section.color }}>{section.label}</span>
                      <span style={{ font: `11px ${MONO}`, color: C.muted }}>{items.length}</span>
                    </div>
                    {items.map(task => (
                      <TaskCard key={task.id} task={task} currentUser={currentUser} isAdmin={isAdmin}
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
        className="fixed right-5 w-14 h-14 u-pill flex items-center justify-center text-2xl font-light active:scale-95 md:hidden"
        style={{ background: AL.black, color: AL.white, bottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
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
