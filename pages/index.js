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

function formatDate(dateStr) {
  if (!dateStr) return ''
  const [year, month, day] = dateStr.split('-')
  return `${day}.${month}.${year}`
}

function DaysChip({ deadline }) {
  const days = getDaysRemaining(deadline)
  if (days < 0)  return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">En retard ({Math.abs(days)}j)</span>
  if (days === 0) return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">Aujourd'hui !</span>
  if (days === 1) return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700">Demain</span>
  if (days < 7)  return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700">{days}j restants</span>
  if (days < 14) return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-yellow-100 text-yellow-700">{days}j restants</span>
  return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">{days}j restants</span>
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
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingProject, setEditingProject] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [feedback, setFeedback] = useState(null)

  useEffect(() => { fetchProjects() }, [])

  async function fetchProjects() {
    setLoading(true)
    const res = await fetch('/api/projects')
    const data = await res.json()
    setProjects(Array.isArray(data) ? data : [])
    setLoading(false)
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
      notes: project.notes || '',
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

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>Atelier Planning — Admin</title>
      </Head>

      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center">
              <span className="text-white text-sm font-bold">AP</span>
            </div>
            <div>
              <h1 className="text-base font-semibold text-gray-900">Atelier Planning</h1>
              <p className="text-xs text-gray-500">Interface Admin</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/display"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              target="_blank"
            >
              <span>📺</span> Vue Atelier
            </Link>
            <button
              onClick={() => { resetForm(); setShowForm(true) }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-700 transition-colors"
            >
              <span>+</span> Nouveau projet
            </button>
          </div>
        </div>
      </header>

      {/* Feedback toast */}
      {feedback && (
        <div className={`fixed top-16 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-sm font-medium transition-all ${
          feedback.type === 'error' ? 'bg-red-500 text-white' : 'bg-green-500 text-white'
        }`}>
          {feedback.msg}
        </div>
      )}

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* Formulaire Add/Edit */}
        {showForm && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">
                {editingProject ? `Modifier — ${editingProject.name}` : 'Nouveau projet'}
              </h2>
              <button onClick={resetForm} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Nom du projet */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Nom du projet *</label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={e => handleFieldChange('name', e.target.value)}
                    placeholder="Ex: Bar comptoir EventX"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  />
                </div>

                {/* Client */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Client *</label>
                  <input
                    type="text"
                    required
                    value={form.client}
                    onChange={e => handleFieldChange('client', e.target.value)}
                    placeholder="Ex: Hôtel du Lac"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Description / Ce qu'on fabrique</label>
                  <input
                    type="text"
                    value={form.description}
                    onChange={e => handleFieldChange('description', e.target.value)}
                    placeholder="Ex: 2 bars en bois + 4 bacs bar LED"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  />
                </div>

                {/* Deadline */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Date de livraison *</label>
                  <input
                    type="date"
                    required
                    value={form.deadline}
                    onChange={e => handleFieldChange('deadline', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  />
                </div>

                {/* Type de livraison */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Mode de livraison</label>
                  <select
                    value={form.delivery_type}
                    onChange={e => handleFieldChange('delivery_type', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  >
                    {DELIVERY_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>

                {/* Responsable */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Responsable</label>
                  <select
                    value={form.responsible}
                    onChange={e => handleFieldChange('responsible', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  >
                    {RESPONSIBLES.map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>

                {/* Couleur */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Couleur de la carte</label>
                  <select
                    value={form.color_override ?? 'null'}
                    onChange={e => handleFieldChange('color_override', e.target.value === 'null' ? null : e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  >
                    {COLOR_OPTIONS.map(c => (
                      <option key={String(c.value)} value={c.value ?? 'null'}>
                        {c.icon} {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Notes internes</label>
                  <input
                    type="text"
                    value={form.notes}
                    onChange={e => handleFieldChange('notes', e.target.value)}
                    placeholder="Info logistique, remarques..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="mt-4 flex items-center gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Enregistrement...' : editingProject ? 'Mettre à jour' : 'Créer le projet'}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                  Annuler
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Projets actifs */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900">
              Projets en cours
              <span className="ml-2 text-sm font-normal text-gray-500">({activeProjects.length})</span>
            </h2>
          </div>

          {loading ? (
            <div className="text-center py-12 text-gray-400 text-sm">Chargement...</div>
          ) : activeProjects.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
              <p className="text-gray-400 text-sm">Aucun projet actif. Créez votre premier projet !</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeProjects.map(project => {
                const color = getProjectColor(project)
                const days = getDaysRemaining(project.deadline)
                return (
                  <div
                    key={project.id}
                    className="bg-white rounded-xl border border-gray-200 hover:border-gray-300 transition-colors overflow-hidden"
                  >
                    <div className="flex items-stretch">
                      {/* Barre couleur */}
                      <div className="w-1.5 flex-shrink-0" style={{ backgroundColor: color }} />

                      {/* Contenu */}
                      <div className="flex-1 px-4 py-3">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-gray-900 text-sm">{project.name}</span>
                              <span className="text-gray-400 text-xs">•</span>
                              <span className="text-sm text-gray-600">{project.client}</span>
                              <DaysChip deadline={project.deadline} />
                            </div>
                            {project.description && (
                              <p className="text-xs text-gray-500 mt-0.5">{project.description}</p>
                            )}
                            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                              <span className="text-xs text-gray-500">
                                📅 <strong>{formatDate(project.deadline)}</strong>
                              </span>
                              <span className="text-xs text-gray-400">·</span>
                              <span className="text-xs text-gray-500">
                                🚚 {project.delivery_type}
                              </span>
                              <span className="text-xs text-gray-400">·</span>
                              <span className="text-xs text-gray-500">
                                👤 {project.responsible}
                              </span>
                              {project.notes && (
                                <>
                                  <span className="text-xs text-gray-400">·</span>
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
                              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-sm"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => handleArchive(project)}
                              title="Archiver (projet terminé)"
                              className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors text-sm"
                            >
                              ✅
                            </button>
                            <button
                              onClick={() => handleDelete(project)}
                              title="Supprimer"
                              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors text-sm"
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
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-3"
            >
              <span>{showArchived ? '▾' : '▸'}</span>
              Projets archivés ({archivedProjects.length})
            </button>
            {showArchived && (
              <div className="space-y-2">
                {archivedProjects.map(project => (
                  <div key={project.id} className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden opacity-60">
                    <div className="flex items-stretch">
                      <div className="w-1.5 flex-shrink-0 bg-gray-300" />
                      <div className="flex-1 px-4 py-3 flex items-center justify-between">
                        <div>
                          <span className="font-medium text-gray-600 text-sm">{project.name}</span>
                          <span className="mx-2 text-gray-400">·</span>
                          <span className="text-sm text-gray-500">{project.client}</span>
                          <span className="ml-3 text-xs text-gray-400">{formatDate(project.deadline)}</span>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleRestore(project)}
                            title="Remettre en cours"
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors text-sm"
                          >
                            ↩️
                          </button>
                          <button
                            onClick={() => handleDelete(project)}
                            title="Supprimer définitivement"
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors text-sm"
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
      </main>
    </div>
  )
}
