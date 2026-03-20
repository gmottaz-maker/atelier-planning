import { useState, useEffect } from 'react'
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function today() {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d
}
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
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
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
  if (d < 0)  return '#dc2626'
  if (d <= 7) return '#f59e0b'
  if (d <= 14) return '#eab308'
  return '#22c55e'
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

// ─── Task item ────────────────────────────────────────────────────────────────

function TaskItem({ task, onToggle }) {
  const todayStr = toDateStr(today())
  const isLate = task.execution_date && task.execution_date < todayStr
  const completed = task.status === 'completed'

  return (
    <div className="flex items-center gap-3 py-2.5 border-b last:border-b-0" style={{ borderColor: '#f3f4f6' }}>
      <button
        onClick={() => onToggle && onToggle(task)}
        className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all"
        style={{ borderColor: completed ? '#22c55e' : '#d1d5db', background: completed ? '#22c55e' : 'white' }}
      >
        {completed && (
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>
      <div className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: PERSON_COLORS[task.responsible] || '#ccc' }} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium leading-snug ${completed ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
          {task.title}
        </p>
        {task.responsible && (
          <p className="text-xs mt-0.5" style={{ color: PERSON_COLORS[task.responsible] || '#9ca3af' }}>
            {task.responsible}
          </p>
        )}
      </div>
      {!completed && isLate && (
        <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
          style={{ background: '#fef2f2', color: '#ef4444' }}>retard</span>
      )}
      {!completed && !isLate && task.execution_date && (
        <span className="text-xs text-gray-400 flex-shrink-0">
          {new Date(...task.execution_date.split('-').map((v,i)=>i===1?v-1:+v))
            .toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
        </span>
      )}
    </div>
  )
}

// ─── Logistics row ────────────────────────────────────────────────────────────

function InfoRow({ label, value }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-2 py-1.5">
      <span className="text-xs text-gray-400 w-20 flex-shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-gray-700 flex-1">{value}</span>
    </div>
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
  const [taskFilter, setTaskFilter] = useState('active') // 'active' | 'all'

  useEffect(() => {
    if (!id || !currentUser) return
    Promise.all([
      fetch(`/api/projects/${id}`).then(r => r.json()),
      fetch('/api/tasks', { headers: { 'x-actor': currentUser } }).then(r => r.json()),
    ]).then(([proj, allTasks]) => {
      setProject(proj)
      if (Array.isArray(allTasks)) {
        setTasks(allTasks.filter(t => String(t.project_id) === String(id)))
      }
    }).catch(console.error)
    .finally(() => setLoading(false))
  }, [id, currentUser])

  // ─── Toggle task ──────────────────────────────────────────────────────────
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
        body: JSON.stringify({ ...taskData, status: newStatus, completed_at: newStatus === 'completed' ? now : null }),
      })
    } catch (err) {
      setTasks(prev => prev.map(t => t.id === task.id ? task : t))
      console.error(err)
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#fafafa' }}>
      <div className="w-6 h-6 rounded-full border-2 animate-spin"
        style={{ borderColor: '#e5e7eb', borderTopColor: PINK }} />
    </div>
  )

  if (!project || project.error) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: '#fafafa' }}>
      <p className="text-gray-500">Projet introuvable.</p>
      <Link href="/" className="text-sm text-blue-500 underline">← Retour aux projets</Link>
    </div>
  )

  const color = getProjectColor(project)
  const daysLeft = getDaysRemaining(project.deadline)
  const activeTasks = tasks.filter(t => t.status === 'active')
  const completedTasks = tasks.filter(t => t.status === 'completed')
  const visibleTasks = taskFilter === 'active'
    ? tasks.filter(t => t.status === 'active')
    : tasks.filter(t => t.status === 'active' || isCompletedToday(t))

  const hasMontage = !!(project.logistics_address || project.logistics_time || project.logistics_contact || project.logistics_notes)
  const hasDemontage = !!(project.disassembly_date || project.disassembly_address || project.disassembly_time || project.disassembly_contact || project.disassembly_notes)
  const hasNotes = !!project.notes && !project.notes.startsWith('todoist:')

  return (
    <div className="min-h-screen" style={{ background: '#fafafa', fontFamily: 'Inter, sans-serif' }}>
      <Head>
        <title>{project.name} — Amazing Lab</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <style>{`* { -webkit-tap-highlight-color: transparent; }`}</style>
      </Head>

      {/* ── Header ── */}
      <header className="sticky top-0 z-10 bg-white border-b" style={{ borderColor: '#f0f0f0' }}>
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Link href="/" className="flex-shrink-0">
              <Logo />
            </Link>
            <span className="text-gray-300 flex-shrink-0">/</span>
            <span className="text-xs text-gray-400 flex-shrink-0 hidden sm:inline">
              <Link href="/" className="hover:text-gray-600 transition-colors">Projets</Link>
            </span>
            <span className="text-gray-300 flex-shrink-0 hidden sm:inline">/</span>
            <span className="font-semibold text-gray-900 text-sm truncate">{project.name}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link href="/home" title="Accueil" className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 text-gray-400 hover:border-gray-400 transition-colors text-base">🏠</Link>
            <Link href="/tasks" title="Tâches" className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 text-gray-400 hover:border-gray-400 transition-colors text-base">✅</Link>
            <Link href="/settings" title="Paramètres" className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 text-gray-400 hover:border-gray-400 transition-colors text-base">⚙️</Link>
            <button
              onClick={() => signOut()}
              className="px-3 py-1.5 rounded-full text-xs font-semibold text-white"
              style={{ background: PERSON_COLORS[currentUser] || PINK }}>
              {currentUser}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6">

        {/* ── Titre + métadonnées ── */}
        <div className="mb-6">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-3 h-3 rounded-full mt-2 flex-shrink-0" style={{ background: color }} />
            <div>
              <h1 className="text-2xl font-bold text-gray-900 leading-tight">
                {project.name}
                {project.client && <span className="text-gray-400 font-normal"> — {project.client}</span>}
              </h1>
            </div>
          </div>

          {/* Chips */}
          <div className="flex flex-wrap items-center gap-2 ml-6">
            {project.deadline && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{ background: color + '22', color }}>
                {daysLeft !== null && daysLeft < 0
                  ? `En retard (${Math.abs(daysLeft)}j)`
                  : daysLeft === 0 ? "Aujourd'hui"
                  : `${fmtDate(project.deadline)} · ${daysLeft}j`}
              </span>
            )}
            {project.delivery_type && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 font-medium">
                {project.delivery_type}
              </span>
            )}
            {project.responsible && (
              <span className="text-xs px-2.5 py-1 rounded-full font-medium"
                style={{ background: (PERSON_COLORS[project.responsible] || '#ccc') + '22', color: PERSON_COLORS[project.responsible] || '#888' }}>
                {project.responsible}
              </span>
            )}
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
              project.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
            }`}>
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
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Résumé du projet</h2>
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{project.description}</p>
            </div>
          </div>
        )}

        {/* ── Two columns ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* ═══ LEFT: Tâches ═══ */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                Tâches du projet
              </h2>
              {completedTasks.length > 0 && (
                <button
                  onClick={() => setTaskFilter(f => f === 'active' ? 'all' : 'active')}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                  {taskFilter === 'active'
                    ? `+ ${completedTasks.length} terminée${completedTasks.length > 1 ? 's' : ''}`
                    : 'Masquer terminées'}
                </button>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 px-4">
              {tasks.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">Aucune tâche pour ce projet.</p>
              ) : visibleTasks.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">Toutes les tâches sont terminées 🎉</p>
              ) : (
                visibleTasks.map(t => <TaskItem key={t.id} task={t} onToggle={toggleTask} />)
              )}
            </div>
          </div>

          {/* ═══ RIGHT: Logistique ═══ */}
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Logistique</h2>

            {!hasMontage && !hasDemontage && !hasNotes ? (
              <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-6 text-center">
                <p className="text-sm text-gray-400">Aucune info logistique renseignée.</p>
                <Link href="/" className="text-xs text-blue-500 hover:underline mt-1 inline-block">
                  Ajouter depuis la liste des projets →
                </Link>
              </div>
            ) : (
              <div className="space-y-3">

                {/* Montage */}
                {hasMontage && (
                  <div className="bg-white rounded-2xl border border-gray-100 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-base">🚚</span>
                      <h3 className="text-sm font-semibold text-gray-900">Montage</h3>
                    </div>
                    <div className="divide-y divide-gray-50">
                      <InfoRow label="Adresse" value={project.logistics_address} />
                      <InfoRow label="Heure" value={project.logistics_time} />
                      <InfoRow label="Contact" value={project.logistics_contact} />
                      <InfoRow label="Notes" value={project.logistics_notes} />
                    </div>
                  </div>
                )}

                {/* Démontage */}
                {hasDemontage && (
                  <div className="bg-white rounded-2xl border border-gray-100 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-base">📦</span>
                      <h3 className="text-sm font-semibold text-gray-900">Démontage</h3>
                    </div>
                    <div className="divide-y divide-gray-50">
                      <InfoRow label="Date" value={project.disassembly_date ? fmtDate(project.disassembly_date) : null} />
                      <InfoRow label="Adresse" value={project.disassembly_address} />
                      <InfoRow label="Heure" value={project.disassembly_time} />
                      <InfoRow label="Contact" value={project.disassembly_contact} />
                      <InfoRow label="Notes" value={project.disassembly_notes} />
                    </div>
                  </div>
                )}

                {/* Infos générales */}
                {hasNotes && (
                  <div className="bg-white rounded-2xl border border-gray-100 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-base">📋</span>
                      <h3 className="text-sm font-semibold text-gray-900">Infos</h3>
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{project.notes}</p>
                  </div>
                )}

              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
