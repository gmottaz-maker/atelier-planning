import { useState, useEffect, useRef } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useAuth } from './_app'
import NavBar from '../components/NavBar'

const RESPONSIBLES  = ['Arnaud', 'Gabin', 'Arnaud & Gabin', 'Sous-traitant']
const DELIVERY_TYPES = ['Livraison', 'Montage sur place', 'Client vient chercher', 'Enlèvement sur place']
const COLOR_OPTIONS  = [
  { value: null,      label: 'Auto (selon urgence)', icon: '🤖' },
  { value: '#22c55e', label: 'Vert',   icon: '🟢' },
  { value: '#f59e0b', label: 'Orange', icon: '🟡' },
  { value: '#ef4444', label: 'Rouge',  icon: '🔴' },
  { value: '#3b82f6', label: 'Bleu',   icon: '🔵' },
  { value: '#8b5cf6', label: 'Violet', icon: '🟣' },
  { value: '#64748b', label: 'Gris',   icon: '⚫' },
]
const PINK = '#FF4D6D'
const PERSON_COLORS = { Arnaud: '#3b82f6', Gabin: '#8b5cf6', Guillaume: '#FF4D6D', 'Sous-traitant': '#64748b' }

// ─── Helpers ────────────────────────────────────────────────────────────────

function getDaysRemaining(deadline) {
  const today = new Date(); today.setHours(0,0,0,0)
  const d = new Date(deadline); d.setHours(0,0,0,0)
  return Math.ceil((d - today) / 86400000)
}
function getAutoColor(deadline) {
  const d = getDaysRemaining(deadline)
  if (d < 0)  return '#dc2626'
  if (d < 7)  return '#ef4444'
  if (d < 14) return '#f59e0b'
  return '#22c55e'
}
function getProjectColor(p) { return p.color_override || getAutoColor(p.deadline) }
function isFromTodoist(p)   { return p.notes && p.notes.startsWith('todoist:') }
function needsCompletion(p) { return p.client === 'À définir' }
function formatDate(s) {
  if (!s) return ''
  const [y,m,d] = s.split('-')
  return `${d}.${m}.${y}`
}
function formatDateShort(s) {
  if (!s) return ''
  const [,m,d] = s.split('-')
  return `${d}.${m}`
}

// ─── DaysChip ────────────────────────────────────────────────────────────────

function DaysChip({ deadline }) {
  const d = getDaysRemaining(deadline)
  if (d < 0)  return <span style={{ background:'#fee2e2',color:'#dc2626' }} className="px-2 py-0.5 rounded-full text-xs font-bold">En retard ({Math.abs(d)}j)</span>
  if (d === 0) return <span style={{ background:'#fee2e2',color:'#dc2626' }} className="px-2 py-0.5 rounded-full text-xs font-bold">Aujourd'hui !</span>
  if (d === 1) return <span style={{ background:'#fff7ed',color:'#ea580c' }} className="px-2 py-0.5 rounded-full text-xs font-bold">Demain</span>
  if (d < 7)  return <span style={{ background:'#fff7ed',color:'#ea580c' }} className="px-2 py-0.5 rounded-full text-xs font-bold">{d}j restants</span>
  if (d < 14) return <span style={{ background:'#fefce8',color:'#ca8a04' }} className="px-2 py-0.5 rounded-full text-xs font-bold">{d}j restants</span>
  return <span style={{ background:'#f0fdf4',color:'#16a34a' }} className="px-2 py-0.5 rounded-full text-xs font-semibold">{d}j restants</span>
}

// ─── AtomLogo ────────────────────────────────────────────────────────────────

function AtomLogo({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <ellipse cx="20" cy="20" rx="18" ry="7" stroke={PINK} strokeWidth="2" fill="none" />
      <ellipse cx="20" cy="20" rx="18" ry="7" stroke={PINK} strokeWidth="2" fill="none" transform="rotate(60 20 20)" />
      <ellipse cx="20" cy="20" rx="18" ry="7" stroke={PINK} strokeWidth="2" fill="none" transform="rotate(120 20 20)" />
      <circle cx="20" cy="20" r="3" fill={PINK} />
    </svg>
  )
}

// ─── AddressInput — Google Maps (nouvelle API) ou Nominatim en fallback ──────

function AddressInput({ value, onChange, placeholder, className, style }) {
  const debounceRef  = useRef(null)
  const sessionRef   = useRef(null)
  const mapsKey      = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY

  const [suggestions, setSuggestions] = useState([])
  const [open, setOpen]               = useState(false)
  const [active, setActive]           = useState(-1)

  // ── Charger le script Google Maps (nouvelle méthode loading=async) ─────────
  useEffect(() => {
    if (!mapsKey || document.getElementById('gmaps-script')) return
    const s = document.createElement('script')
    s.id    = 'gmaps-script'
    s.src   = `https://maps.googleapis.com/maps/api/js?key=${mapsKey}&loading=async`
    s.async = true
    document.head.appendChild(s)
  }, [mapsKey])

  // ── Suggestions Google Maps (nouvelle API AutocompleteSuggestion) ──────────
  async function fetchGoogleSuggestions(q) {
    try {
      if (!window.google?.maps?.importLibrary) return null
      const { AutocompleteSuggestion, AutocompleteSessionToken } =
        await window.google.maps.importLibrary('places')
      if (!sessionRef.current) sessionRef.current = new AutocompleteSessionToken()
      const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: q,
        sessionToken: sessionRef.current,
      })
      return suggestions.map(s => s.placePrediction.text.toString())
    } catch { return null }
  }

  // ── Suggestions Nominatim (OpenStreetMap, fallback gratuit) ───────────────
  async function fetchNominatimSuggestions(q) {
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=6&addressdetails=0`,
        { headers: { 'Accept-Language': 'fr,en' } }
      )
      const d = await r.json()
      return d.map(x => x.display_name)
    } catch { return [] }
  }

  function handleChange(e) {
    const q = e.target.value
    onChange(q)
    clearTimeout(debounceRef.current)
    setActive(-1)
    if (q.length < 3) { setSuggestions([]); setOpen(false); return }
    debounceRef.current = setTimeout(async () => {
      let results = null
      if (mapsKey) results = await fetchGoogleSuggestions(q)
      if (!results || results.length === 0) results = await fetchNominatimSuggestions(q)
      setSuggestions(results || [])
      setOpen((results?.length || 0) > 0)
    }, 350)
  }

  function pick(addr) {
    onChange(addr)
    setSuggestions([])
    setOpen(false)
    setActive(-1)
    sessionRef.current = null  // reset session token après sélection
  }

  function handleKeyDown(e) {
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, suggestions.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(suggestions[active]) }
    if (e.key === 'Escape') { setOpen(false) }
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        className={className}
        style={style}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <ul style={{
          position: 'absolute', zIndex: 9999, top: '100%', left: 0, right: 0, marginTop: 4,
          background: 'white', border: '1px solid #e5e7eb', borderRadius: 12,
          boxShadow: '0 8px 24px rgba(0,0,0,0.1)', overflow: 'hidden', padding: 0, listStyle: 'none',
        }}>
          {suggestions.map((s, i) => (
            <li key={i} onMouseDown={() => pick(s)}
              style={{
                padding: '9px 14px', fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis', color: '#374151',
                background: i === active ? '#f3f4f6' : 'white',
              }}>
              📍 {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── TimeRangeInput ───────────────────────────────────────────────────────────

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
function fmtTimeRange(start, end) {
  if (!start && !end) return ''
  if (start && end) return `${start} – ${end}`
  return start || end
}
function TimeRangeInput({ value, onChange, baseClass }) {
  const { start, end } = parseTimeRange(value)
  return (
    <div className="flex items-center gap-2">
      <input type="time" value={start}
        onChange={e => onChange(fmtTimeRange(e.target.value, end))}
        className={`flex-1 ${baseClass}`} style={{ fontSize: 16 }} />
      <span className="text-gray-400 text-sm flex-shrink-0">–</span>
      <input type="time" value={end}
        onChange={e => onChange(fmtTimeRange(start, e.target.value))}
        className={`flex-1 ${baseClass}`} style={{ fontSize: 16 }} />
    </div>
  )
}

// ─── Modal logistique (Montage + Démontage) ──────────────────────────────────

function LogisticsModal({ project, onClose, onSave }) {
  const [tab, setTab] = useState('montage') // 'montage' | 'demontage'
  const [form, setForm] = useState({
    logistics_address:   project.logistics_address   || '',
    logistics_time:      project.logistics_time      || '',
    logistics_contact:   project.logistics_contact   || '',
    logistics_notes:     project.logistics_notes     || '',
    disassembly_date:    project.disassembly_date    || '',
    disassembly_address: project.disassembly_address || '',
    disassembly_time:    project.disassembly_time    || '',
    disassembly_contact: project.disassembly_contact || '',
    disassembly_notes:   project.disassembly_notes   || '',
  })
  const [saving, setSaving] = useState(false)

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    await onSave(project.id, form)
    setSaving(false)
    onClose()
  }

  const inp = "w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white transition-all"
  const inpFocus = { fontSize: 16 }

  const hasMontage  = !!form.logistics_address
  const hasDemontage = !!form.disassembly_date || !!form.disassembly_address

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col"
        style={{ maxHeight: '92vh' }}>

        {/* Handle (mobile) */}
        <div className="pt-4 sm:pt-0 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto sm:hidden" />
        </div>

        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b border-gray-100 flex items-start justify-between flex-shrink-0">
          <div>
            <h2 className="font-bold text-gray-900 text-base">🚚 Infos logistiques</h2>
            <p className="text-xs text-gray-400 mt-0.5">{project.name} · {project.delivery_type}</p>
          </div>
          <button onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 text-xl flex-shrink-0">
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-5 pt-3 gap-2 flex-shrink-0">
          <button onClick={() => setTab('montage')}
            className="flex-1 py-2 rounded-xl text-sm font-semibold transition-all"
            style={tab === 'montage'
              ? { background: PINK, color: 'white' }
              : { background: '#f3f4f6', color: '#6b7280' }}>
            🔨 Montage
            {hasMontage && <span className="ml-1 text-xs opacity-70">✓</span>}
          </button>
          <button onClick={() => setTab('demontage')}
            className="flex-1 py-2 rounded-xl text-sm font-semibold transition-all"
            style={tab === 'demontage'
              ? { background: '#8b5cf6', color: 'white' }
              : { background: '#f3f4f6', color: '#6b7280' }}>
            🔧 Démontage
            {hasDemontage && <span className="ml-1 text-xs opacity-70">✓</span>}
          </button>
        </div>

        {/* Form */}
        <div className="overflow-y-auto flex-1 px-5 py-4" style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}>
          <form onSubmit={handleSave} className="space-y-3">
            {/* ── Champs communs : date (démontage seulement), adresse, heure, contact, notes ── */}
            {tab === 'demontage' && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Date de démontage</label>
                <input type="date" value={form.disassembly_date}
                  onChange={e => set('disassembly_date', e.target.value)}
                  className={inp} style={inpFocus} />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Adresse</label>
              <AddressInput
                value={tab === 'montage' ? form.logistics_address : form.disassembly_address}
                onChange={v => set(tab === 'montage' ? 'logistics_address' : 'disassembly_address', v)}
                placeholder="Rue, ville..." className={inp} style={inpFocus} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Heure prévue</label>
              <TimeRangeInput
                value={tab === 'montage' ? form.logistics_time : form.disassembly_time}
                onChange={v => set(tab === 'montage' ? 'logistics_time' : 'disassembly_time', v)}
                baseClass={inp} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Contact sur place</label>
              <input type="text"
                value={tab === 'montage' ? form.logistics_contact : form.disassembly_contact}
                onChange={e => set(tab === 'montage' ? 'logistics_contact' : 'disassembly_contact', e.target.value)}
                placeholder="Nom + téléphone" className={inp} style={inpFocus} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Commentaires</label>
              <textarea rows={3}
                value={tab === 'montage' ? form.logistics_notes : form.disassembly_notes}
                onChange={e => set(tab === 'montage' ? 'logistics_notes' : 'disassembly_notes', e.target.value)}
                placeholder="Accès, matériel, remarques..." className={inp} style={{ ...inpFocus, resize: 'none' }} />
            </div>

            <button type="submit" disabled={saving}
              className="w-full py-3 rounded-2xl text-white font-semibold text-sm disabled:opacity-50 transition-opacity"
              style={{ background: tab === 'montage' ? PINK : '#8b5cf6' }}>
              {saving ? 'Enregistrement...' : 'Sauvegarder'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

// ─── Modal tâches d'un projet ─────────────────────────────────────────────────

function ProjectTasksModal({ project, tasks, onClose }) {
  const projectTasks = tasks.filter(t => t.project_id === project.id)
  const active = projectTasks.filter(t => t.status === 'active')
    .sort((a, b) => (a.execution_date || '').localeCompare(b.execution_date || ''))
  const done   = projectTasks.filter(t => t.status === 'completed')
  const color  = getProjectColor(project)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col"
        style={{ maxHeight: '80vh' }}>
        <div className="pt-4 sm:pt-0 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto sm:hidden mt-0 mb-2" />
        </div>
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
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PERSON_COLORS[task.responsible] || '#64748b' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {task.is_private && <span className="mr-1">🔒</span>}{task.title}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {task.responsible}{task.execution_date && ` · ${task.execution_date.split('-').reverse().slice(0,2).join('.')}`}
                    </p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                    style={{ background: (PERSON_COLORS[task.responsible] || '#64748b') + '22', color: PERSON_COLORS[task.responsible] || '#64748b' }}>
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
        <div className="px-5 pb-6 pt-3 border-t border-gray-100 flex-shrink-0">
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

// ─── Formulaire projet ────────────────────────────────────────────────────────

const emptyForm = {
  name: '', client: '', description: '', deadline: '',
  delivery_type: 'Livraison', responsible: 'Arnaud', color_override: null, notes: '',
}

// ─── Page Admin ───────────────────────────────────────────────────────────────

export default function Admin() {
  const { user, signOut } = useAuth()

  const [projects, setProjects]         = useState([])
  const [tasks, setTasks]               = useState([])
  const [loading, setLoading]           = useState(true)
  const [showForm, setShowForm]         = useState(false)
  const [editingProject, setEditingProject] = useState(null)
  const [form, setForm]                 = useState(emptyForm)
  const [saving, setSaving]             = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [feedback, setFeedback]         = useState(null)
  const [selectedProjectId, setSelectedProjectId] = useState(null)
  const [logisticsProject, setLogisticsProject]   = useState(null)

  useEffect(() => { fetchProjects(); fetchTasks() }, [])

  function actorHeaders() {
    return { 'Content-Type': 'application/json', 'x-actor': user?.name || '' }
  }

  async function fetchProjects() {
    setLoading(true)
    const res  = await fetch('/api/projects')
    const data = await res.json()
    setProjects(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  async function fetchTasks() {
    const res  = await fetch('/api/tasks')
    const data = await res.json()
    setTasks(Array.isArray(data) ? data : [])
  }

  async function handleSaveLogistics(projectId, logisticsData) {
    const project = projects.find(p => p.id === projectId)
    await fetch(`/api/projects/${projectId}`, {
      method: 'PUT',
      headers: actorHeaders(),
      body: JSON.stringify({ ...project, ...logisticsData }),
    })
    showFeedback('Infos logistiques sauvegardées ✓')
    fetchProjects()
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
        headers: actorHeaders(),
        body: JSON.stringify({ ...body, status: editingProject.status }),
      })
      if (res.ok) showFeedback('Projet mis à jour !')
      else showFeedback('Erreur lors de la mise à jour', 'error')
    } else {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: actorHeaders(),
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
    await fetch(`/api/projects/${project.id}`, { method: 'DELETE', headers: actorHeaders() })
    showFeedback('Projet supprimé')
    fetchProjects()
  }

  async function handleArchive(project) {
    await fetch(`/api/projects/${project.id}`, {
      method: 'PUT',
      headers: actorHeaders(),
      body: JSON.stringify({ ...project, status: 'archived' }),
    })
    showFeedback('Projet archivé')
    fetchProjects()
  }

  async function handleRestore(project) {
    await fetch(`/api/projects/${project.id}`, {
      method: 'PUT',
      headers: actorHeaders(),
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

  const activeProjects   = projects.filter(p => p.status === 'active').sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
  const archivedProjects = projects.filter(p => p.status !== 'active')
  const inputClass = "w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none transition-colors bg-white"

  return (
    <div className="min-h-screen" style={{ background: '#fafafa' }}>
      <Head>
        <title>Maze Project — Projets</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <style>{`
          body { font-family: 'Inter', sans-serif; }
          input:focus, select:focus, textarea:focus { border-color: ${PINK} !important; box-shadow: 0 0 0 3px ${PINK}22 !important; }
          * { -webkit-tap-highlight-color: transparent; }
          button, a { touch-action: manipulation; }
          @media (max-width: 768px) { input, select, textarea { font-size: 16px !important; } }
          .pac-container { z-index: 99999 !important; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.12); }
        `}</style>
      </Head>

      {/* Header */}
      <NavBar title="projets">
        <button onClick={() => { resetForm(); setShowForm(true) }}
          style={{ background: PINK, color: '#fff' }}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-full hover:opacity-90 transition-opacity">
          <span className="text-lg leading-none">+</span><span className="hidden sm:inline"> Nouveau projet</span>
        </button>
      </NavBar>

      {/* Feedback toast */}
      {feedback && (
        <div className="fixed top-20 right-5 z-50 px-4 py-2.5 rounded-2xl shadow-lg text-sm font-medium"
          style={{ background: feedback.type === 'error' ? '#ef4444' : PINK, color: '#fff' }}>
          {feedback.msg}
        </div>
      )}

      <main className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-8">

        {/* Formulaire Add/Edit */}
        {showForm && (
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 text-base">
                {editingProject
                  ? <><span style={{ color: PINK }}>Modifier</span> — {editingProject.name}</>
                  : <><span style={{ color: PINK }}>Nouveau</span> projet</>}
              </h2>
              <button onClick={resetForm}
                className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 transition-colors text-xl">
                ×
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Nom du projet *</label>
                  <input type="text" required value={form.name}
                    onChange={e => handleFieldChange('name', e.target.value)}
                    placeholder="Ex: Bar comptoir EventX" className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Client *</label>
                  <input type="text" required value={form.client}
                    onChange={e => handleFieldChange('client', e.target.value)}
                    placeholder="Ex: Hôtel du Lac" className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Description</label>
                  <input type="text" value={form.description}
                    onChange={e => handleFieldChange('description', e.target.value)}
                    placeholder="Ex: 2 bars LED + podium" className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Date de livraison *</label>
                  <input type="date" required value={form.deadline}
                    onChange={e => handleFieldChange('deadline', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Mode de livraison</label>
                  <select value={form.delivery_type} onChange={e => handleFieldChange('delivery_type', e.target.value)} className={inputClass}>
                    {DELIVERY_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Responsable</label>
                  <select value={form.responsible} onChange={e => handleFieldChange('responsible', e.target.value)} className={inputClass}>
                    {RESPONSIBLES.map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Couleur de la carte</label>
                  <select value={form.color_override ?? 'null'}
                    onChange={e => handleFieldChange('color_override', e.target.value === 'null' ? null : e.target.value)} className={inputClass}>
                    {COLOR_OPTIONS.map(c => <option key={String(c.value)} value={c.value ?? 'null'}>{c.icon} {c.label}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Notes internes</label>
                  <input type="text" value={form.notes}
                    onChange={e => handleFieldChange('notes', e.target.value)}
                    placeholder="Info logistique, remarques..." className={inputClass} />
                </div>
              </div>
              <div className="mt-5 flex items-center gap-3">
                <button type="submit" disabled={saving}
                  style={{ background: PINK, color: '#fff' }}
                  className="px-6 py-2.5 rounded-full text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity">
                  {saving ? 'Enregistrement...' : editingProject ? 'Mettre à jour' : 'Créer le projet'}
                </button>
                <button type="button" onClick={resetForm} className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-800">
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

          {/* Bannière Todoist */}
          {activeProjects.some(needsCompletion) && (
            <div className="mb-4 px-4 py-3 rounded-2xl border flex items-center gap-3"
              style={{ background: '#fff8f0', borderColor: '#fed7aa' }}>
              <span className="text-lg">🔔</span>
              <p className="text-sm text-orange-800">
                <strong>{activeProjects.filter(needsCompletion).length} projet{activeProjects.filter(needsCompletion).length > 1 ? 's' : ''}</strong> importé{activeProjects.filter(needsCompletion).length > 1 ? 's' : ''} depuis Todoist — clique sur ✏️ pour compléter les infos.
              </p>
            </div>
          )}

          {loading ? (
            <div className="text-center py-16 text-gray-400 text-sm">Chargement...</div>
          ) : activeProjects.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-3xl border border-gray-100">
              <div className="text-4xl mb-3">🛠️</div>
              <p className="text-gray-400 text-sm">Aucun projet actif.</p>
            </div>
          ) : (
            // ─── Desktop : grille 2 colonnes, Mobile : liste ───────────────
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {activeProjects.map(project => {
                const color      = getProjectColor(project)
                const fromTodoist = isFromTodoist(project)
                const incomplete  = needsCompletion(project)
                const taskCount   = tasks.filter(t => t.project_id === project.id && t.status === 'active').length
                const nextTask    = tasks
                  .filter(t => t.project_id === project.id && t.status === 'active')
                  .sort((a, b) => (a.execution_date || '').localeCompare(b.execution_date || ''))[0]

                return (
                  <div key={project.id}
                    className="bg-white rounded-2xl border hover:shadow-sm transition-all overflow-hidden flex flex-col"
                    style={{ borderColor: incomplete ? '#fed7aa' : '#f3f4f6' }}>
                    <div className="flex items-stretch flex-1">
                      {/* Barre couleur */}
                      <div className="w-1 flex-shrink-0 rounded-l-2xl" style={{ backgroundColor: color }} />

                      {/* Contenu */}
                      <div className="flex-1 px-4 py-4 min-w-0">
                        {/* Ligne 1: nom + actions */}
                        <div className="flex items-start justify-between gap-2">
                          <Link href={`/projects/${project.id}`} className="flex-1 min-w-0 cursor-pointer hover:opacity-80 transition-opacity">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-gray-900 text-sm leading-tight">{project.name}</span>
                              {fromTodoist && (
                                <span className="px-1.5 py-0.5 rounded-full text-xs font-medium"
                                  style={{ background: '#e8f5e9', color: '#2e7d32' }}>Todoist</span>
                              )}
                              {taskCount > 0 && (
                                <span className="px-1.5 py-0.5 rounded-full text-xs font-bold"
                                  style={{ background: PINK + '18', color: PINK }}>
                                  {taskCount} tâche{taskCount > 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                            <p className={`text-sm mt-0.5 ${incomplete ? 'font-semibold' : 'text-gray-500'}`}
                              style={incomplete ? { color: '#ea580c' } : {}}>
                              {project.client}
                            </p>
                            {project.description && (
                              <p className="text-xs text-gray-400 mt-0.5 leading-snug">{project.description}</p>
                            )}
                          </Link>

                          {/* Actions */}
                          <div className="flex items-center gap-0.5 flex-shrink-0">
                            <button onClick={() => handleEdit(project)} title="Modifier"
                              className="p-2 text-gray-300 hover:text-gray-600 hover:bg-gray-50 rounded-xl transition-colors text-sm">✏️</button>
                            <button onClick={() => handleArchive(project)} title="Archiver"
                              className="p-2 text-gray-300 hover:text-green-600 hover:bg-green-50 rounded-xl transition-colors text-sm">✅</button>
                            <button onClick={() => handleDelete(project)} title="Supprimer"
                              className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors text-sm">🗑️</button>
                          </div>
                        </div>

                        {/* Ligne 2: chips d'info */}
                        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                          <span className="text-xs text-gray-500">
                            📅 <strong>{formatDate(project.deadline)}</strong>
                          </span>
                          {!incomplete && <DaysChip deadline={project.deadline} />}
                          {incomplete && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold"
                              style={{ background: '#fff7ed', color: '#ea580c' }}>À compléter</span>
                          )}
                          <button
                            onClick={e => { e.stopPropagation(); setLogisticsProject(project) }}
                            className="text-xs rounded-full px-2 py-0.5 transition-colors"
                            style={{
                              background: project.logistics_address ? '#f0fdf4' : '#f9fafb',
                              color: project.logistics_address ? '#16a34a' : '#9ca3af',
                              border: project.logistics_address ? '1px solid #bbf7d0' : '1px solid transparent',
                            }}>
                            🚚 {project.delivery_type}{project.logistics_address && ' ✓'}
                          </button>
                          {project.disassembly_date && (
                            <span className="text-xs rounded-full px-2 py-0.5"
                              style={{ background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe' }}>
                              🔧 {formatDateShort(project.disassembly_date)}
                            </span>
                          )}
                          <span className="text-xs text-gray-400">👤 {project.responsible}</span>
                        </div>

                        {/* Ligne 3: prochaine tâche */}
                        {nextTask && (
                          <div className="flex items-center gap-2 mt-2.5 pt-2 border-t" style={{ borderColor: '#f3f4f6' }}>
                            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                              style={{ background: PERSON_COLORS[nextTask.responsible] || '#64748b' }} />
                            <span className="text-xs text-gray-500 flex-1 truncate">{nextTask.title}</span>
                            <span className="text-xs font-semibold flex-shrink-0"
                              style={{ color: PERSON_COLORS[nextTask.responsible] || '#64748b' }}>
                              {nextTask.responsible}
                            </span>
                            {nextTask.execution_date && (
                              <span className="text-xs text-gray-300 flex-shrink-0">{formatDateShort(nextTask.execution_date)}</span>
                            )}
                          </div>
                        )}
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
            <button onClick={() => setShowArchived(v => !v)}
              className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600 transition-colors mb-4">
              <span>{showArchived ? '▾' : '▸'}</span>
              Projets archivés ({archivedProjects.length})
            </button>
            {showArchived && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                {archivedProjects.map(project => (
                  <div key={project.id} className="bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden opacity-50 hover:opacity-70 transition-opacity">
                    <div className="flex items-stretch">
                      <div className="w-1 flex-shrink-0 rounded-l-2xl bg-gray-200" />
                      <div className="flex-1 px-4 py-3 flex items-center justify-between">
                        <div>
                          <span className="font-medium text-gray-500 text-sm">{project.name}</span>
                          <span className="mx-2 text-gray-300">·</span>
                          <span className="text-sm text-gray-400">{project.client}</span>
                          <span className="ml-3 text-xs text-gray-400">{formatDate(project.deadline)}</span>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => handleRestore(project)} title="Remettre en cours"
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors text-sm">↩️</button>
                          <button onClick={() => handleDelete(project)} title="Supprimer définitivement"
                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors text-sm">🗑️</button>
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
          <span>amazing lab — maze project</span>
        </div>
      </main>

      {/* Modal logistique */}
      {logisticsProject && (
        <LogisticsModal project={logisticsProject} onClose={() => setLogisticsProject(null)} onSave={handleSaveLogistics} />
      )}

      {/* Modal tâches projet */}
      {selectedProjectId && (() => {
        const proj = projects.find(p => p.id === selectedProjectId)
        return proj ? (
          <ProjectTasksModal project={proj} tasks={tasks} onClose={() => setSelectedProjectId(null)} />
        ) : null
      })()}
    </div>
  )
}
