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

const LOGISTICS_SECTIONS = [
  { key: 'montage',     label: 'Montage',    icon: '🔨', hasDate: false },
  { key: 'livraison',   label: 'Livraison',  icon: '🚚', hasDate: false },
  { key: 'envoi_dhl',   label: 'Envoi DHL',  icon: '✈️', hasDate: false },
  { key: 'demontage',   label: 'Démontage',  icon: '🔧', hasDate: true  },
  { key: 'recuperation',label: 'Récupération',icon: '↩️', hasDate: true  },
]

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

// Init logistics from project (backward compat with old columns)
function initLogistics(project) {
  const base = { ...(project.logistics_data || {}) }
  // Migrate old montage fields if not yet in logistics_data
  if (!base.montage && (project.logistics_address || project.logistics_time)) {
    base.montage = {
      address: project.logistics_address || '',
      time:    project.logistics_time    || '',
      contact: project.logistics_contact || '',
      notes:   project.logistics_notes   || '',
    }
  }
  // Migrate old demontage fields
  if (!base.demontage && (project.disassembly_address || project.disassembly_date)) {
    base.demontage = {
      date:    project.disassembly_date    || '',
      address: project.disassembly_address || '',
      time:    project.disassembly_time    || '',
      contact: project.disassembly_contact || '',
      notes:   project.disassembly_notes   || '',
    }
  }
  return base
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

// ─── TaskItem ─────────────────────────────────────────────────────────────────
function TaskItem({ task, onToggle }) {
  const todayStr = toDateStr(today())
  const isLate = task.execution_date && task.execution_date < todayStr
  const completed = task.status === 'completed'
  return (
    <div className="flex items-center gap-2.5 py-2 border-b last:border-b-0" style={{ borderColor: '#f3f4f6' }}>
      <button
        onClick={() => onToggle(task)}
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

  // Logistics state
  const [logistics, setLogistics] = useState({})
  const [logisticsDirty, setLogisticsDirty] = useState(false)
  const [logisticsSaving, setLogisticsSaving] = useState(false)

  // Task state
  const [addingCategory, setAddingCategory] = useState(null)

  // ── Load data ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id || !currentUser) return
    Promise.all([
      fetch(`/api/projects/${id}`).then(r => r.json()),
      fetch('/api/tasks', { headers: { 'x-actor': currentUser } }).then(r => r.json()),
    ]).then(([proj, allTasks]) => {
      if (proj && !proj.error) {
        setProject(proj)
        setLogistics(initLogistics(proj))
      }
      if (Array.isArray(allTasks)) {
        setTasks(allTasks.filter(t => String(t.project_id) === String(id)))
      }
    }).catch(console.error)
    .finally(() => setLoading(false))
  }, [id, currentUser])

  // ── Logistics helpers ────────────────────────────────────────────────────
  function setLogisticsField(sectionKey, field, value) {
    setLogistics(prev => ({
      ...prev,
      [sectionKey]: { ...(prev[sectionKey] || {}), [field]: value },
    }))
    setLogisticsDirty(true)
  }

  async function saveLogistics() {
    setLogisticsSaving(true)
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-actor': currentUser },
        body: JSON.stringify({ ...project, logistics_data: logistics }),
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
    <div className="min-h-screen" style={{ background: '#fafafa', fontFamily: 'Inter, sans-serif' }}>
      <Head>
        <title>{project.name} — Amazing Lab</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <style>{`
          * { -webkit-tap-highlight-color: transparent; }
          input[type=time]::-webkit-calendar-picker-indicator { opacity: 0.4; }
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
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Résumé du projet</p>
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{project.description}</p>
            </div>
          </div>
        )}

        {/* ── Two columns ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

          {/* ════ LEFT: Tâches groupées ════ */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Tâches du projet</p>
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
                      {catTasks.map(t => <TaskItem key={t.id} task={t} onToggle={toggleTask} />)}
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
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Logistique</p>
              {logisticsDirty && (
                <button
                  onClick={saveLogistics}
                  disabled={logisticsSaving}
                  className="text-xs font-semibold px-3 py-1.5 rounded-full text-white disabled:opacity-60 transition-opacity"
                  style={{ background: PINK }}>
                  {logisticsSaving ? 'Enregistrement...' : '💾 Sauvegarder'}
                </button>
              )}
            </div>

            <div className="space-y-3">
              {LOGISTICS_SECTIONS.map(section => {
                const data = logistics[section.key] || {}
                const hasContent = Object.values(data).some(v => v && v.trim?.() !== '')
                return (
                  <div key={section.key}
                    className="bg-white rounded-2xl border overflow-hidden"
                    style={{ borderColor: hasContent ? '#e5e7eb' : '#f3f4f6' }}>

                    {/* Section header */}
                    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-50">
                      <span className="text-sm">{section.icon}</span>
                      <span className="text-xs font-bold text-gray-700">{section.label}</span>
                      {hasContent && <span className="text-xs text-gray-400">✓</span>}
                    </div>

                    {/* Fields */}
                    <div className="px-4 py-3 space-y-2.5">
                      {section.hasDate && (
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Date</label>
                          <input type="date" value={data.date || ''} style={{ fontSize: 14 }}
                            onChange={e => setLogisticsField(section.key, 'date', e.target.value)}
                            className={inp} />
                        </div>
                      )}
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Adresse</label>
                        <input type="text" value={data.address || ''} placeholder="Rue, ville..." style={{ fontSize: 14 }}
                          onChange={e => setLogisticsField(section.key, 'address', e.target.value)}
                          className={inp} />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Heure prévue</label>
                        <TimeRangeInput
                          value={data.time || ''}
                          onChange={v => setLogisticsField(section.key, 'time', v)} />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Contact</label>
                        <input type="text" value={data.contact || ''} placeholder="Nom + téléphone" style={{ fontSize: 14 }}
                          onChange={e => setLogisticsField(section.key, 'contact', e.target.value)}
                          className={inp} />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Notes</label>
                        <textarea rows={2} value={data.notes || ''} placeholder="Accès, remarques..." style={{ fontSize: 14, resize: 'none' }}
                          onChange={e => setLogisticsField(section.key, 'notes', e.target.value)}
                          className={inp} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
