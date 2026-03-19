import { useState, useEffect } from 'react'
import Head from 'next/head'
import Link from 'next/link'

const RESPONSIBLES = ['Arnaud', 'Gabin', 'Arnaud & Gabin', 'Sous-traitant']
const DELIVERY_TYPES = ['Livraison', 'Montage sur place', 'Client vient chercher', 'Enlèvement sur place']
const COLOR_OPTIONS = [
  { value: null,      label: 'Auto (selon urgence)', icon: '🤖' },
  { value: '#22c55e', label: 'Vert',   icon: '🟢' },
  { value: '#f59e0b', label: 'Orange', icon: '🟡' },
  { value: '#ef4444', label: 'Rouge',  icon: '🔴' },
  { value: '#3b82f6', label: 'Bleu',   icon: '🔵' },
  { value: '#8b5cf6', label: 'Violet', icon: '🟣' },
  { value: '#64748b', label: 'Gris',   icon: '⚫' },
]

const PINK = '#FF4D6D'
const PERSON_COLORS = {
  Arnaud: '#3b82f6',
  Gabin: '#8b5cf6',
  Guillaume: '#FF4D6D',
  'Sous-traitant': '#64748b',
}

function getDaysRemaining(deadline) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(deadline)
  d.setHours(0, 0, 0, 0)
  return Math.ceil((d - today) / (1000 * 60 * 60 * 24))
}

function getAutoColor(deadline) {
  const days = getDaysRemaining(deadline)
  if (days < 0)  return '#dc2626'
  if (days < 7)  return '#ef4444'
  if (days < 14) return '#f59e0b'
  return '#22c55e'
}

function getProjectColor(project) {
  return project.color_override || getAutoColor(project.deadline)
}

function isFromTodoist(project) {
  return project.notes && project.notes.startsWith('todoist:')
}

function needsCompletion(project) {
  return project.client === 'À définir'
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const [year, month, day] = dateStr.split('-')
  return `${day}.${month}.${year}`
}

function DaysChip({ deadline }) {
  const days = getDaysRemaining(deadline)
  if (days < 0)  return <span style={{ background: '#fee2e2', color: '#dc2626' }} className="px-2 py-0.5 rounded-full text-xs font-bold">En retard ({Math.abs(days)}j)</span>
  if (days === 0) return <span style={{ background: '#fee2e2', color: '#dc2626' }} className="px-2 py-0.5 rounded-full text-xs font-bold">Aujourd'hui !</span>
  if (days === 1) return <span style={{ background: '#fff7ed', color: '#ea580c' }} className="px-2 py-0.5 rounded-full text-xs font-bold">Demain</span>
  if (days < 7)  return <span style={{ background: '#fff7ed', color: '#ea580c' }} className="px-2 py-0.5 rounded-full text-xs font-bold">{days}j restants</span>
  if (days < 14) return <span style={{ background: '#fefce8', color: '#ca8a04' }} className="px-2 py-0.5 rounded-full text-xs font-bold">{days}j restants</span>
  return <span style={{ background: '#f0fdf4', color: '#16a34a' }} className="px-2 py-0.5 rounded-full text-xs font-semibold">{days}j restants</span>
}

// SVG logo atom Amazing Lab style
function AtomLogo({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="20" cy="20" rx="18" ry="7" stroke={PINK} strokeWidth="2" fill="none" />
      <ellipse cx="20" cy="20" rx="18" ry="7" stroke={PINK} strokeWidth="2" fill="none" transform="rotate(60 20 20)" />
      <ellipse cx="20" cy="20" rx="18" ry="7" stroke={PINK} strokeWidth="2" fill="none" transform="rotate(120 20 20)" />
      <circle cx="20" cy="20" r="3" fill={PINK} />
    </svg>
  )
}

// ─── Modal tâches d'un projet ──────────────────────────────────────────────

function ProjectTasksModal({ project, tasks, onClose }) {
  const projectTasks = tasks.filter(t => t.project_id === project.id)
  const active = projectTasks.filter(t => t.status === 'active')
    .sort((a, b) => (a.execution_date || '').localeCompare(b.execution_date || ''))
  const done = projectTasks.filter(t => t.status === 'completed')
  const color = getProjectColor(project)

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-t-3xl overflow-hidden flex flex-col" style={{ maxHeight: '80vh' }}>
        {/* Handle */}
        <div className="pt-4 pb-2 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto" />
        </div>

        {/* Header */}
        <div className="px-5 pb-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                <h2 className="font-bold text-gray-900 text-base leading-snug">{project.name}</h2>
              </div>
              <p className="text-sm text-gray-400">{project.client}</p>
            </div>
            <button onClick={onClose}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 text-xl flex-shrink-0">
              ×
            </button>
          </div>
        </div>

        {/* Tâches */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-2">
          {projectTasks.length === 0 ? (
            <div className="text-center py-10">
              <div className="text-3xl mb-2">📋</div>
              <p className="text-gray-400 text-sm">Aucune tâche liée à ce projet</p>
            </div>
          ) : (
            <>
              {active.map(task => (
                <div key={task.id} className="flex items-center gap-3 py-3 px-3 rounded-2xl bg-gray-50">
                  <div className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: PERSON_COLORS[task.responsible] || '#64748b' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {task.is_private && <span className="mr-1">🔒</span>}{task.title}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {task.responsible}
                      {task.execution_date && ` · ${task.execution_date.split('-').reverse().slice(0,2).join('.')}`}
                    </p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                    style={{ background: PERSON_COLORS[task.responsible] + '22', color: PERSON_COLORS[task.responsible] }}>
                    {task.responsible.split(' ')[0]}
                  </span>
                </div>
              ))}
              {done.length > 0 && (
                <div className="pt-2">
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-2">Terminées</p>
                  {done.map(task => (
                    <div key={task.id} className="flex items-center gap-3 py-2 px-3 rounded-2xl opacity-40">
                      <div className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
                      <p className="text-sm text-gray-500 line-through truncate">{task.title}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-8 pt-3 border-t border-gray-100 flex-shrink-0">
          <Link href="/tasks"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl text-sm font-semibold border-2 transition-opacity hover:opacity-80"
            style={{ borderColor: PINK, color: PINK }}>
            Gérer les tâches →
          </Link>
        </div>
      </div>
    </div>
  )
}

const emptyForm = {
  name: '',
  client: '',
  description: '',
  deadline: '',
  delivery_type: 'Livraison',
  responsible: 'Arnaud',
  color_override: null,
  notes: '',
}

export default function Admin() {
  const [projects, setProjects] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingProject, setEditingProject] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [selectedProjectId, setSelectedProjectId] = useState(null)

  useEffect(() => { fetchProjects(); fetchTasks() }, [])

  async function fetchProjects() {
    setLoading(true)
    const res = await fetch('/api/projects')
    const data = await res.json()
    setProjects(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  async function fetchTasks() {
    const res = await fetch('/api/tasks')
    const data = await res.json()
    setTasks(Array.isArray(data) ? data : [])
  }

  function showFeedback(msg, type = 'success') {
    setFeedback({ msg, type })
    setTimeout(() => setFeedback(null), 3000)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    const body = { ...form }
    if (editingProject) {
      const res = await fetch(`/api/projects/${editingProject.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, status: editingProject.status }),
      })
      if (res.ok) showFeedback('Projet mis à jour !')
      else showFeedback('Erreur lors de la mise à jour', 'error')
    } else {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) showFeedback('Projet créé !')
      else showFeedback('Erreur lors de la création', 'error')
    }
    setSaving(false)
    resetForm()
    fetchProjects()
  }

  async function handleDelete(project) {
    if (!confirm(`Supprimer définitivement "${project.name}" ?`)) return
    await fetch(`/api/projects/${project.id}`, { method: 'DELETE' })
    showFeedback('Projet supprimé')
    fetchProjects()
  }

  async function handleArchive(project) {
    await fetch(`/api/projects/${project.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...project, status: 'archived' }),
    })
    showFeedback('Projet archivé')
    fetchProjects()
  }

  async function handleRestore(project) {
    await fetch(`/api/projects/${project.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...project, status: 'active' }),
    })
    showFeedback('Projet restauré')
    fetchProjects()
  }

  function handleEdit(project) {
    setEditingProject(project)
    setForm({
      name: project.name,
      client: project.client,
      description: project.description || '',
      deadline: project.deadline,
      delivery_type: project.delivery_type || 'Livraison',
      responsible: project.responsible || 'Arnaud',
      color_override: project.color_override || null,
      // Si importé de Todoist, on garde la note interne vide pour l'utilisateur
      notes: isFromTodoist(project) ? '' : (project.notes || ''),
    })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function resetForm() {
    setForm(emptyForm)
    setEditingProject(null)
    setShowForm(false)
  }

  function handleFieldChange(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  const activeProjects = projects
    .filter(p => p.status === 'active')
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
  const archivedProjects = projects.filter(p => p.status !== 'active')

  const inputClass = "w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none transition-colors bg-white"

  return (
    <div className="min-h-screen" style={{ background: '#fafafa' }}>
      <Head>
        <title>Atelier Planning — Admin</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <style>{`
          body { font-family: 'Inter', sans-serif; }
          input:focus, select:focus, textarea:focus {
            border-color: ${PINK} !important;
            box-shadow: 0 0 0 3px ${PINK}22 !important;
          }
          * { -webkit-tap-highlight-color: transparent; }
          button, a { touch-action: manipulation; }
          @media (max-width: 768px) {
            input, select, textarea { font-size: 16px !important; }
          }
        `}</style>
      </Head>

      {/* Header */}
      <header style={{ background: '#fff', borderBottom: '1px solid #f0f0f0' }} className="sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          {/* Logo */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <AtomLogo size={26} />
            <div className="hidden sm:block">
              <span className="font-bold text-gray-900 text-base tracking-tight">amazing lab</span>
              <span className="ml-2 text-xs text-gray-400 font-normal">planning</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5">
            <Link
              href="/tasks"
              style={{ border: '1.5px solid #e5e7eb', color: '#374151' }}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-full hover:border-gray-400 transition-colors bg-white"
            >
              <span>✅</span><span className="hidden sm:inline"> Tâches</span>
            </Link>
            <Link
              href="/display"
              target="_blank"
              style={{ border: '1.5px solid #e5e7eb', color: '#374151' }}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-full hover:border-gray-400 transition-colors bg-white"
            >
              <span>📺</span><span className="hidden sm:inline"> Vue Atelier</span>
            </Link>
            <button
              onClick={() => { resetForm(); setShowForm(true) }}
              style={{ background: PINK, color: '#fff' }}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-full hover:opacity-90 transition-opacity"
            >
              <span className="text-lg leading-none">+</span><span className="hidden sm:inline"> Nouveau projet</span>
            </button>
          </div>
        </div>
      </header>

      {/* Feedback toast */}
      {feedback && (
        <div
          className="fixed top-20 right-5 z-50 px-4 py-2.5 rounded-2xl shadow-lg text-sm font-medium"
          style={{ background: feedback.type === 'error' ? '#ef4444' : PINK, color: '#fff' }}
        >
          {feedback.msg}
        </div>
      )}

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">

        {/* Formulaire Add/Edit */}
        {showForm && (
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-50 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 text-base">
                {editingProject
                  ? <><span style={{ color: PINK }}>Modifier</span> — {editingProject.name}</>
                  : <><span style={{ color: PINK }}>Nouveau</span> projet</>
                }
              </h2>
              <button
                onClick={resetForm}
                className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors text-xl leading-none"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Nom du projet *</label>
                  <input
                    type="text" required value={form.name}
                    onChange={e => handleFieldChange('name', e.target.value)}
                    placeholder="Ex: Bar comptoir EventX"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Client *</label>
                  <input
                    type="text" required value={form.client}
                    onChange={e => handleFieldChange('client', e.target.value)}
                    placeholder="Ex: Hôtel du Lac"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Description / Ce qu'on fabrique</label>
                  <input
                    type="text" value={form.description}
                    onChange={e => handleFieldChange('description', e.target.value)}
                    placeholder="Ex: 2 bars en bois + 4 bacs bar LED"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Date de livraison *</label>
                  <input
                    type="date" required value={form.deadline}
                    onChange={e => handleFieldChange('deadline', e.target.value)}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Mode de livraison</label>
                  <select
                    value={form.delivery_type}
                    onChange={e => handleFieldChange('delivery_type', e.target.value)}
                    className={inputClass}
                  >
                    {DELIVERY_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Responsable</label>
                  <select
                    value={form.responsible}
                    onChange={e => handleFieldChange('responsible', e.target.value)}
                    className={inputClass}
                  >
                    {RESPONSIBLES.map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Couleur de la carte</label>
                  <select
                    value={form.color_override ?? 'null'}
                    onChange={e => handleFieldChange('color_override', e.target.value === 'null' ? null : e.target.value)}
                    className={inputClass}
                  >
                    {COLOR_OPTIONS.map(c => (
                      <option key={String(c.value)} value={c.value ?? 'null'}>
                        {c.icon} {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Notes internes</label>
                  <input
                    type="text" value={form.notes}
                    onChange={e => handleFieldChange('notes', e.target.value)}
                    placeholder="Info logistique, remarques..."
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="mt-6 flex items-center gap-3">
                <button
                  type="submit" disabled={saving}
                  style={{ background: PINK, color: '#fff' }}
                  className="px-6 py-2.5 rounded-full text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {saving ? 'Enregistrement...' : editingProject ? 'Mettre à jour' : 'Créer le projet'}
                </button>
                <button
                  type="button" onClick={resetForm}
                  className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
                >
                  Annuler
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Projets actifs */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-900 text-lg">
              Projets en cours
              <span className="ml-2 text-sm font-normal text-gray-400">({activeProjects.length})</span>
            </h2>
          </div>

          {/* Bannière projets Todoist à compléter */}
          {activeProjects.some(needsCompletion) && (
            <div className="mb-4 px-4 py-3 rounded-2xl border flex items-center gap-3"
              style={{ background: '#fff8f0', borderColor: '#fed7aa' }}>
              <span className="text-lg">🔔</span>
              <p className="text-sm text-orange-800">
                <strong>{activeProjects.filter(needsCompletion).length} projet{activeProjects.filter(needsCompletion).length > 1 ? 's' : ''}</strong> importé{activeProjects.filter(needsCompletion).length > 1 ? 's' : ''} depuis Todoist — clique sur ✏️ pour ajouter le client, la date et le mode de livraison.
              </p>
            </div>
          )}

          {loading ? (
            <div className="text-center py-16 text-gray-400 text-sm">Chargement...</div>
          ) : activeProjects.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-3xl border border-gray-100">
              <div className="text-4xl mb-3">🛠️</div>
              <p className="text-gray-400 text-sm">Aucun projet actif. Créez votre premier projet !</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeProjects.map(project => {
                const color = getProjectColor(project)
                const fromTodoist = isFromTodoist(project)
                const incomplete = needsCompletion(project)
                return (
                  <div
                    key={project.id}
                    className="bg-white rounded-2xl border hover:shadow-sm transition-all overflow-hidden"
                    style={{ borderColor: incomplete ? '#fed7aa' : '#f3f4f6' }}
                  >
                    <div className="flex items-stretch">
                      {/* Barre couleur */}
                      <div className="w-1 flex-shrink-0 rounded-l-2xl" style={{ backgroundColor: color }} />

                      {/* Contenu */}
                      <div className="flex-1 px-5 py-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 cursor-pointer flex-1"
                            onClick={() => setSelectedProjectId(project.id)}>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-gray-900 text-sm">{project.name}</span>
                              {fromTodoist && (
                                <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                                  style={{ background: '#e8f5e9', color: '#2e7d32' }}>
                                  Todoist
                                </span>
                              )}
                              <span className="text-gray-300">·</span>
                              <span className={`text-sm ${incomplete ? 'font-semibold' : 'text-gray-500'}`}
                                style={incomplete ? { color: '#ea580c' } : {}}>
                                {project.client}
                              </span>
                              {!incomplete && <DaysChip deadline={project.deadline} />}
                              {incomplete && (
                                <span className="px-2 py-0.5 rounded-full text-xs font-bold"
                                  style={{ background: '#fff7ed', color: '#ea580c' }}>
                                  À compléter
                                </span>
                              )}
                              {(() => {
                                const count = tasks.filter(t => t.project_id === project.id && t.status === 'active').length
                                return count > 0 ? (
                                  <span className="px-2 py-0.5 rounded-full text-xs font-bold"
                                    style={{ background: PINK + '18', color: PINK }}>
                                    {count} tâche{count > 1 ? 's' : ''}
                                  </span>
                                ) : null
                              })()}
                            </div>
                            {project.description && (
                              <p className="text-xs text-gray-400 mt-0.5">{project.description}</p>
                            )}
                            <div className="flex items-center gap-3 mt-2 flex-wrap">
                              <span className="text-xs text-gray-500">
                                📅 <strong>{formatDate(project.deadline)}</strong>
                              </span>
                              <span className="text-gray-200">·</span>
                              <span className="text-xs text-gray-400">🚚 {project.delivery_type}</span>
                              <span className="text-gray-200">·</span>
                              <span className="text-xs text-gray-400">👤 {project.responsible}</span>
                              {project.notes && (
                                <>
                                  <span className="text-gray-200">·</span>
                                  <span className="text-xs text-gray-400 italic">{project.notes}</span>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={() => handleEdit(project)}
                              title="Modifier"
                              className="p-2 text-gray-300 hover:text-gray-600 hover:bg-gray-50 rounded-xl transition-colors text-sm"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => handleArchive(project)}
                              title="Archiver (projet terminé)"
                              className="p-2 text-gray-300 hover:text-green-600 hover:bg-green-50 rounded-xl transition-colors text-sm"
                            >
                              ✅
                            </button>
                            <button
                              onClick={() => handleDelete(project)}
                              title="Supprimer"
                              className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors text-sm"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Projets archivés */}
        {archivedProjects.length > 0 && (
          <div>
            <button
              onClick={() => setShowArchived(v => !v)}
              className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600 transition-colors mb-4"
            >
              <span>{showArchived ? '▾' : '▸'}</span>
              Projets archivés ({archivedProjects.length})
            </button>
            {showArchived && (
              <div className="space-y-2">
                {archivedProjects.map(project => (
                  <div key={project.id} className="bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden opacity-50 hover:opacity-70 transition-opacity">
                    <div className="flex items-stretch">
                      <div className="w-1 flex-shrink-0 rounded-l-2xl bg-gray-200" />
                      <div className="flex-1 px-5 py-3 flex items-center justify-between">
                        <div>
                          <span className="font-medium text-gray-500 text-sm">{project.name}</span>
                          <span className="mx-2 text-gray-300">·</span>
                          <span className="text-sm text-gray-400">{project.client}</span>
                          <span className="ml-3 text-xs text-gray-400">{formatDate(project.deadline)}</span>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleRestore(project)}
                            title="Remettre en cours"
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors text-sm"
                          >
                            ↩️
                          </button>
                          <button
                            onClick={() => handleDelete(project)}
                            title="Supprimer définitivement"
                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors text-sm"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="pt-4 pb-8 flex items-center justify-center gap-2 text-xs text-gray-300">
          <AtomLogo size={16} />
          <span>amazing lab — atelier planning</span>
        </div>
      </main>

      {/* Modal tâches projet */}
      {selectedProjectId && (() => {
        const proj = projects.find(p => p.id === selectedProjectId)
        return proj ? (
          <ProjectTasksModal
            project={proj}
            tasks={tasks}
            onClose={() => setSelectedProjectId(null)}
          />
        ) : null
      })()}
    </div>
  )
}
