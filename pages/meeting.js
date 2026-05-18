import { useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useAuth } from './_app'
import NavBar from '../components/NavBar'
import { useResponsibles } from '../lib/useResponsibles'

// ─── Helpers ────────────────────────────────────────────────────────────────

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function parseDate(str) {
  if (!str) return null
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m-1, d)
}

function daysBetween(dateStr) {
  const d = parseDate(dateStr)
  if (!d) return null
  return Math.ceil((d - startOfToday()) / 86400000)
}

function fmtDate(dateStr) {
  const d = parseDate(dateStr)
  if (!d) return '—'
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
}

function fmtDateShort(dateStr) {
  const d = parseDate(dateStr)
  if (!d) return '—'
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}

function fmtDayCount(days) {
  if (days === null) return ''
  if (days < 0) return `en retard de ${Math.abs(days)}j`
  if (days === 0) return "aujourd'hui"
  if (days === 1) return 'demain'
  return `dans ${days}j`
}

function colorForName(name) {
  const map = { Arnaud: '#3b82f6', Gabin: '#8b5cf6', Guillaume: '#111827' }
  if (map[name]) return map[name]
  if (!name) return '#9ca3af'
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return `hsl(${Math.abs(hash) % 360}, 45%, 48%)`
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function MeetingPage() {
  const { user } = useAuth()
  const { responsibles } = useResponsibles()
  const currentUser = user?.name || ''

  const [generated, setGenerated] = useState(null)
  const [projects, setProjects] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(false)
  const [participants, setParticipants] = useState([])

  async function generate() {
    setLoading(true)
    try {
      const [pRes, tRes] = await Promise.all([
        fetch('/api/projects').then(r => r.json()),
        fetch('/api/tasks', { headers: { 'x-actor': currentUser } }).then(r => r.json()),
      ])
      setProjects(Array.isArray(pRes) ? pRes : [])
      setTasks(Array.isArray(tRes) ? tRes : [])
      // Pré-cocher tous les responsables connus comme participants
      const known = (Array.isArray(responsibles) ? responsibles : []).filter(r => r !== 'non défini')
      setParticipants(known)
      setGenerated(new Date())
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }

  function toggleParticipant(name) {
    setParticipants(p => p.includes(name) ? p.filter(x => x !== name) : [...p, name])
  }

  return (
    <div className="min-h-screen" style={{ background: '#fafafa', fontFamily: 'Inter, sans-serif' }}>
      <Head>
        <title>Meeting — Maze Project</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <style>{`
          body { font-family: 'Inter', sans-serif; }
          input:focus { border-color: #9ca3af !important; box-shadow: 0 0 0 3px rgba(17,24,39,0.06) !important; outline: none; }
          @media print {
            body { background: white !important; }
            .no-print { display: none !important; }
            .meeting-doc { padding: 0 !important; }
          }
        `}</style>
      </Head>

      <NavBar title="Meeting">
        {generated && (
          <button onClick={() => window.print()}
            className="no-print px-3 py-2 rounded-md text-sm font-medium border border-gray-200 text-gray-700 hover:border-gray-400 transition-colors">
            Imprimer
          </button>
        )}
        <button onClick={generate} disabled={loading}
          className="no-print px-4 py-2 rounded-md text-sm font-medium text-white disabled:opacity-50"
          style={{ background: '#111827' }}>
          {loading ? 'Génération…' : generated ? 'Régénérer' : 'Générer une structure'}
        </button>
      </NavBar>

      <main className="max-w-5xl mx-auto px-8 py-10 meeting-doc">
        {!generated ? (
          <EmptyState onGenerate={generate} loading={loading} />
        ) : (
          <MeetingBrief
            projects={projects}
            tasks={tasks}
            generatedAt={generated}
            participants={participants}
            allResponsibles={responsibles}
            onToggleParticipant={toggleParticipant}
          />
        )}
      </main>
    </div>
  )
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState({ onGenerate, loading }) {
  return (
    <div className="text-center py-24">
      <h2 className="text-2xl font-semibold text-gray-900 mb-3">Préparer un meeting</h2>
      <p className="text-gray-500 mb-8 max-w-md mx-auto">
        Génère un brief instantané : projets en cours, commandes en attente, sous-traitances,
        livraisons à venir et tâches en retard.
      </p>
      <button onClick={onGenerate} disabled={loading}
        className="px-6 py-3 rounded-md text-sm font-medium text-white disabled:opacity-50"
        style={{ background: '#111827' }}>
        {loading ? 'Génération…' : 'Générer une structure de meeting'}
      </button>
    </div>
  )
}

// ─── Brief ───────────────────────────────────────────────────────────────────

function MeetingBrief({ projects, tasks, generatedAt, participants, allResponsibles, onToggleParticipant }) {
  const todayStr = toDateStr(startOfToday())
  const activeProjects = projects.filter(p => p.status === 'active')
  const activeTasks = tasks.filter(t => t.status === 'active')

  // Cette semaine : projets dont la deadline est dans 0-7 jours
  const thisWeek = activeProjects
    .filter(p => {
      const d = daysBetween(p.deadline)
      return d !== null && d >= 0 && d <= 7
    })
    .sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''))

  // En retard : projets dont la deadline est passée
  const overdueProjects = activeProjects
    .filter(p => {
      const d = daysBetween(p.deadline)
      return d !== null && d < 0
    })
    .sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''))

  const overdueTasks = activeTasks
    .filter(t => t.execution_date && t.execution_date < todayStr)
    .sort((a, b) => (a.execution_date || '').localeCompare(b.execution_date || ''))

  // Commandes en cours (non réceptionnées)
  const pendingOrders = activeTasks
    .filter(t => t.category === 'commande')
    .sort((a, b) => {
      const da = a.category_data?.expected_date || ''
      const db = b.category_data?.expected_date || ''
      return da.localeCompare(db)
    })

  // Sous-traitances en cours, groupées par état
  const subActive = activeTasks.filter(t => t.category === 'sous_traitance')
  const subReady = subActive.filter(t => t.category_data?.ready_at)
  const subInProgress = subActive.filter(t => !t.category_data?.ready_at)

  // Stats
  const stats = [
    { label: 'Projets actifs',         value: activeProjects.length },
    { label: 'Cette semaine',          value: thisWeek.length },
    { label: 'En retard',              value: overdueProjects.length + overdueTasks.length },
    { label: 'Commandes en attente',   value: pendingOrders.length },
    { label: 'Sous-traitances',        value: subActive.length },
  ]

  return (
    <div className="space-y-10">
      {/* Header */}
      <header className="border-b border-gray-200 pb-6">
        <p className="text-xs uppercase tracking-wider text-gray-400 mb-2">Brief de meeting</p>
        <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">
          {generatedAt.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Généré à {generatedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </p>

        {/* Participants */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500 mr-2">Participants :</span>
          {(allResponsibles || []).filter(r => r !== 'non défini').map(name => {
            const active = participants.includes(name)
            return (
              <button key={name} onClick={() => onToggleParticipant(name)}
                className="no-print text-xs font-medium px-3 py-1 rounded-full border transition-colors"
                style={{
                  borderColor: active ? colorForName(name) : '#e5e7eb',
                  background: active ? colorForName(name) + '15' : 'white',
                  color: active ? colorForName(name) : '#9ca3af',
                }}>
                {name}
              </button>
            )
          })}
          {participants.length === 0 && (
            <span className="text-xs text-gray-400 italic">aucun</span>
          )}
        </div>
      </header>

      {/* Stats */}
      <section className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {stats.map(s => (
          <div key={s.label} className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-2xl font-semibold text-gray-900 tabular-nums">{s.value}</div>
            <div className="text-xs text-gray-500 mt-1">{s.label}</div>
          </div>
        ))}
      </section>

      {/* En retard */}
      {(overdueProjects.length > 0 || overdueTasks.length > 0) && (
        <Section title="En retard" tone="danger">
          {overdueProjects.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-medium text-gray-500 mb-2">Projets</p>
              <ul className="divide-y divide-gray-100">
                {overdueProjects.map(p => (
                  <ProjectRow key={p.id} project={p} />
                ))}
              </ul>
            </div>
          )}
          {overdueTasks.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">Tâches</p>
              <ul className="divide-y divide-gray-100">
                {overdueTasks.map(t => <TaskRow key={t.id} task={t} projects={projects} />)}
              </ul>
            </div>
          )}
        </Section>
      )}

      {/* Cette semaine */}
      <Section title="À surveiller cette semaine" subtitle={`${thisWeek.length} projet${thisWeek.length > 1 ? 's' : ''}`}>
        {thisWeek.length === 0 ? (
          <p className="text-sm text-gray-400">Aucune deadline dans les 7 prochains jours.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {thisWeek.map(p => <ProjectRow key={p.id} project={p} />)}
          </ul>
        )}
      </Section>

      {/* Commandes en attente */}
      <Section title="Commandes en attente" subtitle={`${pendingOrders.length}`}>
        {pendingOrders.length === 0 ? (
          <p className="text-sm text-gray-400">Aucune commande en attente.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {pendingOrders.map(t => <OrderRow key={t.id} task={t} projects={projects} />)}
          </ul>
        )}
      </Section>

      {/* Sous-traitances */}
      <Section title="Sous-traitances" subtitle={`${subActive.length}`}>
        {subActive.length === 0 ? (
          <p className="text-sm text-gray-400">Aucune sous-traitance en cours.</p>
        ) : (
          <>
            {subReady.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-medium mb-2" style={{ color: '#d97706' }}>Prêt à récupérer ({subReady.length})</p>
                <ul className="divide-y divide-gray-100">
                  {subReady.map(t => <SubRow key={t.id} task={t} projects={projects} />)}
                </ul>
              </div>
            )}
            {subInProgress.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Chez le sous-traitant ({subInProgress.length})</p>
                <ul className="divide-y divide-gray-100">
                  {subInProgress.map(t => <SubRow key={t.id} task={t} projects={projects} />)}
                </ul>
              </div>
            )}
          </>
        )}
      </Section>

      {/* Tous les projets actifs */}
      <Section title="Tous les projets actifs" subtitle={`${activeProjects.length}`}>
        {activeProjects.length === 0 ? (
          <p className="text-sm text-gray-400">Aucun projet actif.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {[...activeProjects]
              .sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''))
              .map(p => <ProjectRow key={p.id} project={p} compact />)}
          </ul>
        )}
      </Section>

      <footer className="text-xs text-gray-400 pt-4 border-t border-gray-200">
        Maze Project — Brief généré le {generatedAt.toLocaleString('fr-FR')}
      </footer>
    </div>
  )
}

// ─── Section wrapper ─────────────────────────────────────────────────────────

function Section({ title, subtitle, tone, children }) {
  const accent = tone === 'danger' ? '#dc2626' : '#111827'
  return (
    <section>
      <div className="flex items-baseline gap-3 mb-4">
        <h2 className="text-lg font-semibold tracking-tight" style={{ color: accent }}>{title}</h2>
        {subtitle && <span className="text-sm text-gray-400">{subtitle}</span>}
      </div>
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        {children}
      </div>
    </section>
  )
}

// ─── Row components ──────────────────────────────────────────────────────────

function ProjectRow({ project, compact = false }) {
  const days = daysBetween(project.deadline)
  const respColor = colorForName(project.responsible)
  return (
    <li className="py-2.5 flex items-baseline gap-3">
      <Link href={`/projects/${project.id}`}
        className="flex-1 min-w-0 text-sm text-gray-900 hover:text-gray-600 truncate">
        <span className="font-semibold">{project.name}</span>
        {project.client && <span className="text-gray-400 font-normal"> — {project.client}</span>}
      </Link>
      {!compact && project.description && (
        <span className="hidden sm:inline text-xs text-gray-400 truncate max-w-xs">{project.description}</span>
      )}
      <span className="text-xs text-gray-500 tabular-nums whitespace-nowrap">
        {fmtDateShort(project.deadline)} · {fmtDayCount(days)}
      </span>
      {project.responsible && (
        <span className="text-xs font-medium whitespace-nowrap" style={{ color: respColor }}>
          {project.responsible}
        </span>
      )}
    </li>
  )
}

function TaskRow({ task, projects }) {
  const project = projects.find(p => p.id === task.project_id)
  const days = daysBetween(task.execution_date)
  const respColor = colorForName(task.responsible)
  return (
    <li className="py-2.5 flex items-baseline gap-3">
      <span className="flex-1 min-w-0 text-sm text-gray-900 truncate">
        {task.title}
        {project && (
          <Link href={`/projects/${project.id}`} className="text-gray-400 hover:text-gray-600"> — {project.name}</Link>
        )}
      </span>
      <span className="text-xs text-gray-500 tabular-nums whitespace-nowrap">
        {fmtDateShort(task.execution_date)} · {fmtDayCount(days)}
      </span>
      {task.responsible && (
        <span className="text-xs font-medium whitespace-nowrap" style={{ color: respColor }}>
          {task.responsible}
        </span>
      )}
    </li>
  )
}

function OrderRow({ task, projects }) {
  const project = projects.find(p => p.id === task.project_id)
  const data = task.category_data || {}
  const days = daysBetween(data.expected_date)
  return (
    <li className="py-2.5 flex items-baseline gap-3 flex-wrap">
      <span className="text-sm font-medium text-gray-900">{task.title}</span>
      {data.quantity && <span className="text-xs text-gray-500">· {data.quantity}</span>}
      {data.vendor && <span className="text-xs text-gray-500">· {data.vendor}</span>}
      {project && (
        <Link href={`/projects/${project.id}`} className="text-xs text-gray-400 hover:text-gray-600">— {project.name}</Link>
      )}
      <span className="ml-auto text-xs text-gray-500 tabular-nums whitespace-nowrap">
        {data.expected_date
          ? <>Réception {fmtDateShort(data.expected_date)} · {fmtDayCount(days)}</>
          : <>Commandé {fmtDateShort(data.order_date)}</>}
      </span>
    </li>
  )
}

function SubRow({ task, projects }) {
  const project = projects.find(p => p.id === task.project_id)
  const data = task.category_data || {}
  return (
    <li className="py-2.5 flex items-baseline gap-3 flex-wrap">
      <span className="text-sm font-medium text-gray-900">{task.title}</span>
      {data.subcontractor && <span className="text-xs text-gray-500">· {data.subcontractor}</span>}
      {project && (
        <Link href={`/projects/${project.id}`} className="text-xs text-gray-400 hover:text-gray-600">— {project.name}</Link>
      )}
      <span className="ml-auto text-xs text-gray-500 tabular-nums whitespace-nowrap">
        {data.ready_at
          ? <span style={{ color: '#d97706' }}>Prêt depuis {fmtDateShort(data.ready_at)}</span>
          : data.expected_pickup_date
            ? <>Récup prévue {fmtDateShort(data.expected_pickup_date)}</>
            : data.drop_date && <>Déposé {fmtDateShort(data.drop_date)}</>}
      </span>
    </li>
  )
}
