import { useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useAuth } from './_app'
import { useResponsibles } from '../lib/useResponsibles'
import { C, FONT, MONO, personChip } from '../lib/theme'

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
function fmtDateShort(dateStr) {
  const d = parseDate(dateStr)
  if (!d) return '—'
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}
function fmtDayCount(days) {
  if (days === null) return ''
  if (days < 0) return `RETARD DE ${Math.abs(days)}J`
  if (days === 0) return "AUJOURD'HUI"
  if (days === 1) return 'DEMAIN'
  return `DANS ${days}J`
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
        fetch('/api/tasks').then(r => r.json()),
      ])
      setProjects(Array.isArray(pRes) ? pRes : [])
      setTasks(Array.isArray(tRes) ? tRes : [])
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
    <div className="min-h-screen" style={{ background: C.pageBg, fontFamily: FONT, color: C.ink }}>
      <Head>
        <title>Meeting — Maze Project</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <style>{`
          @media print {
            body { background: white !important; }
            .no-print { display: none !important; }
            .meeting-doc { padding: 0 !important; }
          }
        `}</style>
      </Head>

      <main className="meeting-doc" style={{ padding: '26px 40px' }}>
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
            onRegenerate={generate}
            loading={loading}
          />
        )}
      </main>
    </div>
  )
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState({ onGenerate, loading }) {
  return (
    <div style={{ textAlign: 'center', padding: '96px 0' }}>
      <p style={{ font: `600 10px ${MONO}`, letterSpacing: '.14em', color: C.accent, marginBottom: 10 }}>BRIEF DE MEETING</p>
      <h2 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-.4px', marginBottom: 12 }}>Préparer un meeting</h2>
      <p style={{ color: C.muted, marginBottom: 28, maxWidth: 440, marginLeft: 'auto', marginRight: 'auto', fontSize: 14 }}>
        Génère un brief instantané : projets en cours, commandes en attente, sous-traitances, livraisons à venir et tâches en retard.
      </p>
      <button onClick={onGenerate} disabled={loading}
        style={{ padding: '11px 22px', borderRadius: 5, font: `600 13px ${FONT}`, color: C.accentOnDark, background: C.ink, border: 'none', cursor: 'pointer', opacity: loading ? 0.5 : 1 }}>
        {loading ? 'Génération…' : 'Générer une structure de meeting'}
      </button>
    </div>
  )
}

// ─── Brief ───────────────────────────────────────────────────────────────────

function MeetingBrief({ projects, tasks, generatedAt, participants, allResponsibles, onToggleParticipant, onRegenerate, loading }) {
  const todayStr = toDateStr(startOfToday())
  const activeProjects = projects.filter(p => p.status === 'active')
  const activeTasks = tasks.filter(t => t.status === 'active')

  const thisWeek = activeProjects
    .filter(p => { const d = daysBetween(p.deadline); return d !== null && d >= 0 && d <= 7 })
    .sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''))
  const overdueProjects = activeProjects
    .filter(p => { const d = daysBetween(p.deadline); return d !== null && d < 0 })
    .sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''))
  const overdueTasks = activeTasks
    .filter(t => t.execution_date && t.execution_date < todayStr)
    .sort((a, b) => (a.execution_date || '').localeCompare(b.execution_date || ''))
  const pendingOrders = activeTasks
    .filter(t => t.category === 'commande')
    .sort((a, b) => (a.category_data?.expected_date || '').localeCompare(b.category_data?.expected_date || ''))
  const subActive = activeTasks.filter(t => t.category === 'sous_traitance')
  const subReady = subActive.filter(t => t.category_data?.ready_at)
  const subInProgress = subActive.filter(t => !t.category_data?.ready_at)

  const stats = [
    { label: 'Projets actifs',       value: activeProjects.length },
    { label: 'Cette semaine',        value: thisWeek.length },
    { label: 'En retard',            value: overdueProjects.length + overdueTasks.length, danger: true },
    { label: 'Commandes en attente', value: pendingOrders.length },
    { label: 'Sous-traitances',      value: subActive.length },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, borderBottom: `1px solid ${C.border}`, paddingBottom: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ font: `600 10px ${MONO}`, letterSpacing: '.14em', color: C.accent }}>BRIEF DE MEETING</span>
          <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.4px' }}>
            {generatedAt.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
          <span style={{ font: `11px ${MONO}`, color: C.muted }}>GÉNÉRÉ À {generatedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={() => window.print()} className="no-print"
          style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.inkSecondary, font: `600 12.5px ${FONT}`, padding: '9px 16px', borderRadius: 5, cursor: 'pointer' }}>IMPRIMER</button>
        <button onClick={onRegenerate} disabled={loading} className="no-print"
          style={{ border: `1px solid ${C.ink}`, background: C.ink, color: C.accentOnDark, font: `600 12.5px ${FONT}`, padding: '9px 16px', borderRadius: 5, cursor: 'pointer', opacity: loading ? 0.5 : 1 }}>↻ RÉGÉNÉRER</button>
      </div>

      {/* Participants */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <span style={{ font: `10.5px ${MONO}`, color: C.muted }}>PARTICIPANTS</span>
        {(allResponsibles || []).filter(r => r !== 'non défini').map(name => {
          const active = participants.includes(name)
          const chip = personChip(name)
          return (
            <button key={name} onClick={() => onToggleParticipant(name)} className="no-print"
              style={{ fontSize: 11.5, fontWeight: 600, padding: '3px 12px', borderRadius: 99, cursor: 'pointer',
                color: active ? chip.fg : C.muted, background: active ? chip.bg : C.surface,
                border: `1px solid ${active ? chip.fg + '33' : C.border}` }}>
              {name}
            </button>
          )
        })}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
        {stats.map(s => (
          <div key={s.label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ font: `600 22px ${MONO}`, color: s.danger && s.value > 0 ? C.danger : C.ink }}>{s.value}</span>
            <span style={{ fontSize: 11.5, color: C.muted }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {(overdueProjects.length > 0 || overdueTasks.length > 0) && (
          <Section title="En retard" danger meta={`${overdueTasks.length} TÂCHE${overdueTasks.length > 1 ? 'S' : ''} · ${overdueProjects.length} PROJET${overdueProjects.length > 1 ? 'S' : ''}`}>
            {overdueProjects.map((p, i) => <ProjectRow key={p.id} project={p} last={i === overdueProjects.length - 1 && overdueTasks.length === 0} />)}
            {overdueTasks.map((t, i) => <TaskRow key={t.id} task={t} projects={projects} last={i === overdueTasks.length - 1} />)}
          </Section>
        )}

        <Section title="À surveiller cette semaine" meta={`${thisWeek.length} PROJET${thisWeek.length > 1 ? 'S' : ''}`}>
          {thisWeek.length === 0
            ? <Empty>Aucune deadline dans les 7 prochains jours.</Empty>
            : thisWeek.map((p, i) => <ProjectRow key={p.id} project={p} last={i === thisWeek.length - 1} />)}
        </Section>

        <Section title="Commandes en attente" meta={`${pendingOrders.length}`}>
          {pendingOrders.length === 0
            ? <Empty>Aucune commande en attente.</Empty>
            : pendingOrders.map((t, i) => <OrderRow key={t.id} task={t} projects={projects} last={i === pendingOrders.length - 1} />)}
        </Section>

        <Section title="Sous-traitances" meta={`${subReady.length} PRÊTE${subReady.length > 1 ? 'S' : ''} · ${subInProgress.length} EN COURS`}>
          {subActive.length === 0 ? (
            <Empty>Aucune sous-traitance en cours.</Empty>
          ) : (
            <>
              {subReady.length > 0 && <>
                <div style={{ font: `10px ${MONO}`, color: C.warning, letterSpacing: '.1em', padding: '10px 0 2px' }}>PRÊT À RÉCUPÉRER</div>
                {subReady.map((t, i) => <SubRow key={t.id} task={t} projects={projects} last={subInProgress.length === 0 && i === subReady.length - 1} />)}
              </>}
              {subInProgress.length > 0 && <>
                <div style={{ font: `10px ${MONO}`, color: C.muted, letterSpacing: '.1em', padding: '10px 0 2px' }}>CHEZ LE SOUS-TRAITANT</div>
                {subInProgress.map((t, i) => <SubRow key={t.id} task={t} projects={projects} last={i === subInProgress.length - 1} />)}
              </>}
            </>
          )}
        </Section>

        <Section title="Tous les projets actifs" meta={`${activeProjects.length}`}>
          {activeProjects.length === 0
            ? <Empty>Aucun projet actif.</Empty>
            : [...activeProjects].sort((a, b) => (a.deadline || '').localeCompare(b.deadline || '')).map((p, i, arr) => <ProjectRow key={p.id} project={p} last={i === arr.length - 1} />)}
        </Section>
      </div>

      <div style={{ font: `10px ${MONO}`, color: C.faintChevron, borderTop: `1px solid ${C.divider}`, paddingTop: 12, marginTop: 24, textAlign: 'center' }}>
        MAZE PROJECT — BRIEF GÉNÉRÉ LE {generatedAt.toLocaleString('fr-FR')}
      </div>
    </div>
  )
}

// ─── Sous-composants ─────────────────────────────────────────────────────────

function Section({ title, meta, danger, children }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: danger ? C.danger : C.ink }}>{title}</span>
        {meta && <span style={{ font: `11px ${MONO}`, color: C.muted }}>{meta}</span>}
      </div>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 16px' }}>
        {children}
      </div>
    </section>
  )
}

function Empty({ children }) {
  return <p style={{ fontSize: 13, color: C.muted, padding: '8px 0' }}>{children}</p>
}

function rowStyle(last) {
  return { display: 'flex', alignItems: 'baseline', gap: 10, padding: '10px 0', borderBottom: last ? 'none' : `1px solid ${C.divider}` }
}
const titleStyle = { fontSize: 13.5, fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const metaMono = { font: `11px ${MONO}`, color: C.muted, whiteSpace: 'nowrap' }
function PersonTag({ name }) {
  const chip = personChip(name)
  return <span style={{ fontSize: 11, fontWeight: 600, color: chip.fg, background: chip.bg, padding: '2px 9px', borderRadius: 6, flex: 'none' }}>{name}</span>
}

function ProjectRow({ project, last }) {
  const days = daysBetween(project.deadline)
  return (
    <div style={rowStyle(last)}>
      <Link href={`/projects/${project.id}`} style={{ ...titleStyle, color: C.ink, textDecoration: 'none' }}>
        {project.name}{project.client && <span style={{ fontWeight: 400, color: C.muted }}> — {project.client}</span>}
      </Link>
      <span style={{ flex: 1 }} />
      <span style={metaMono}>{project.deadline ? `${fmtDateShort(project.deadline)} · ${fmtDayCount(days)}` : 'SANS DEADLINE'}</span>
      {project.responsible && <PersonTag name={project.responsible} />}
    </div>
  )
}

function TaskRow({ task, projects, last }) {
  const project = projects.find(p => p.id === task.project_id)
  const days = daysBetween(task.execution_date)
  return (
    <div style={rowStyle(last)}>
      <span style={{ ...titleStyle, color: C.ink }}>
        {task.title}{project && <span style={{ fontWeight: 400, color: C.muted }}> — {project.name}</span>}
      </span>
      <span style={{ flex: 1 }} />
      <span style={metaMono}>{task.execution_date ? `${fmtDateShort(task.execution_date)} · ${fmtDayCount(days)}` : 'SANS DEADLINE'}</span>
      {task.responsible && <PersonTag name={task.responsible} />}
    </div>
  )
}

function OrderRow({ task, projects, last }) {
  const project = projects.find(p => p.id === task.project_id)
  const data = task.category_data || {}
  const days = daysBetween(data.expected_date)
  const ctx = [data.quantity && `×${data.quantity}`, data.vendor].filter(Boolean).join(' · ')
  return (
    <div style={rowStyle(last)}>
      <span style={{ ...titleStyle, color: C.ink }}>
        {task.title}{ctx && <span style={{ fontWeight: 400, color: C.muted }}> · {ctx}</span>}
        {project && <span style={{ fontWeight: 400, color: C.muted }}> — {project.name}</span>}
      </span>
      <span style={{ flex: 1 }} />
      <span style={metaMono}>
        {data.expected_date ? `RÉCEPTION ${fmtDateShort(data.expected_date)} · ${fmtDayCount(days)}` : `COMMANDÉ ${fmtDateShort(data.order_date)}`}
      </span>
    </div>
  )
}

function SubRow({ task, projects, last }) {
  const project = projects.find(p => p.id === task.project_id)
  const data = task.category_data || {}
  return (
    <div style={rowStyle(last)}>
      <span style={{ ...titleStyle, color: C.ink }}>
        {task.title}{data.subcontractor && <span style={{ fontWeight: 400, color: C.muted }}> · {data.subcontractor}</span>}
        {project && <span style={{ fontWeight: 400, color: C.muted }}> — {project.name}</span>}
      </span>
      <span style={{ flex: 1 }} />
      <span style={metaMono}>
        {data.ready_at ? `PRÊT DEPUIS ${fmtDateShort(data.ready_at)}`
          : data.expected_pickup_date ? `RÉCUP PRÉVUE ${fmtDateShort(data.expected_pickup_date)}`
          : data.drop_date ? `DÉPOSÉ ${fmtDateShort(data.drop_date)}` : ''}
      </span>
    </div>
  )
}
