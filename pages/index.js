import { useState, useEffect, useRef } from 'react'
import useSWR from 'swr'
import Head from 'next/head'
import Link from 'next/link'
import { useAuth } from './_app'
import NavBar from '../components/NavBar'
import { useResponsibles } from '../lib/useResponsibles'
import KDriveFolderPicker from '../components/KDriveFolderPicker'

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
const PINK = '#111827'
const PERSON_COLORS = { Arnaud: '#3b82f6', Gabin: '#8b5cf6', Guillaume: '#111827', 'Sous-traitant': '#64748b', 'non défini': '#9ca3af' }

function colorForName(name) {
  if (!name) return '#9ca3af'
  if (PERSON_COLORS[name]) return PERSON_COLORS[name]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return `hsl(${Math.abs(hash) % 360}, 45%, 48%)`
}

function initials(name) {
  if (!name) return '?'
  return name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getDaysRemaining(deadline) {
  if (!deadline) return null
  const today = new Date(); today.setHours(0,0,0,0)
  const d = new Date(deadline); d.setHours(0,0,0,0)
  return Math.ceil((d - today) / 86400000)
}
function getAutoColor(deadline) {
  const d = getDaysRemaining(deadline)
  if (d === null) return '#9ca3af'
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

// ─── Kanban par échéance ─────────────────────────────────────────────────────
const KANBAN_COLUMNS = [
  { key: 'overdue', label: 'En retard',     accent: '#dc2626' },
  { key: 'week',    label: 'Cette semaine', accent: '#ea580c' },
  { key: 'month',   label: 'Ce mois',       accent: '#ca8a04' },
  { key: 'later',   label: 'Plus tard',     accent: '#16a34a' },
]
function deadlineBucket(deadline) {
  const d = getDaysRemaining(deadline)
  if (d === null) return 'later'   // projets sans date → "Plus tard"
  if (d < 0)  return 'overdue'
  if (d < 7)  return 'week'
  if (d < 30) return 'month'
  return 'later'
}

// ─── Regroupement par mois ───────────────────────────────────────────────────
const MONTHS_FR = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']
function monthKey(deadline)   { return deadline ? deadline.slice(0, 7) : 'none' }   // 'YYYY-MM' | 'none'
function monthLabel(deadline) {
  if (!deadline) return 'Sans date'
  const [y, m] = deadline.split('-')
  const name = MONTHS_FR[parseInt(m, 10) - 1] || ''
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${y}`
}
function groupByMonth(projects) {
  const groups = []
  let cur = null
  projects.forEach(p => {
    const key = monthKey(p.deadline)
    if (!cur || cur.key !== key) { cur = { key, label: monthLabel(p.deadline), items: [] }; groups.push(cur) }
    cur.items.push(p)
  })
  return groups
}

// ─── DaysChip ────────────────────────────────────────────────────────────────

function DaysChip({ deadline }) {
  const d = getDaysRemaining(deadline)
  if (d === null) return <span style={{ background:'#f3f4f6',color:'#6b7280' }} className="px-2 py-0.5 rounded-full text-xs font-medium">Sans date</span>
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

// ─── Skeleton de chargement (liste de projets) ──────────────────────────────

function ProjectsSkeleton({ rows = 6 }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <style>{`@keyframes maze-shimmer { 0% { opacity:.55 } 50% { opacity:1 } 100% { opacity:.55 } }`}</style>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5 border-b border-gray-100 last:border-0"
          style={{ animation: 'maze-shimmer 1.3s ease-in-out infinite', animationDelay: `${i * 0.08}s` }}>
          <div className="w-1 h-9 rounded-full bg-gray-200 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="h-3.5 bg-gray-200 rounded w-1/3 mb-2" />
            <div className="h-2.5 bg-gray-100 rounded w-1/5" />
          </div>
          <div className="w-7 h-7 rounded-full bg-gray-200 flex-shrink-0" />
          <div className="h-5 bg-gray-100 rounded-full w-20 flex-shrink-0" />
          <div className="h-2 bg-gray-100 rounded w-24 flex-shrink-0 hidden md:block" />
        </div>
      ))}
    </div>
  )
}

// ─── Menu d'actions compact (⋯) ─────────────────────────────────────────────

function ProjectActionsMenu({ onEdit, onArchive, onDelete }) {
  const [open, setOpen] = useState(false)
  const item = "w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors"
  return (
    <div className="absolute top-3.5 right-2.5 z-10">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
        aria-label="Actions"
        className={`w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition ${open ? 'opacity-100 bg-gray-200' : 'md:opacity-0 md:group-hover:opacity-100'}`}
        style={{ fontSize: 20, lineHeight: 1 }}>⋯</button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 w-44 bg-white rounded-lg border border-gray-200 shadow-lg py-1 z-20" style={{ fontSize: 13 }}>
            <button onClick={() => { setOpen(false); onEdit() }} className={`${item} text-gray-700`}>Modifier</button>
            <button onClick={() => { setOpen(false); onArchive() }} className={`${item} text-gray-700`}>Archiver</button>
            <div className="my-1 border-t border-gray-100" />
            <button onClick={() => { setOpen(false); onDelete() }} className={`${item} text-red-600 hover:bg-red-50`}>Supprimer</button>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Vue Gantt (frise temporelle par échéance) ──────────────────────────────

function GanttView({ projects }) {
  const DAY = 86400000
  const today = new Date(); today.setHours(0, 0, 0, 0)

  const dated   = projects.filter(p => p.deadline).sort((a, b) => a.deadline.localeCompare(b.deadline))
  const undated = projects.filter(p => !p.deadline)

  if (dated.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400 text-sm">
        Aucun projet daté à afficher sur la frise.
      </div>
    )
  }

  // Début d'un projet = sa date de création (sinon aujourd'hui), borné à aujourd'hui
  const startOf = (p) => {
    const s = p.created_at ? new Date(p.created_at) : new Date(today)
    s.setHours(0, 0, 0, 0)
    return Math.min(s.getTime(), today.getTime())
  }
  const endOf = (p) => { const d = new Date(p.deadline); d.setHours(0, 0, 0, 0); return d.getTime() }

  const minStart = Math.min(today.getTime(), ...dated.map(startOf))
  const maxEnd   = Math.max(today.getTime(), ...dated.map(endOf))
  const rangeStart = new Date(new Date(minStart).getFullYear(), new Date(minStart).getMonth(), 1)
  const rangeEndM  = new Date(maxEnd)
  const rangeEnd   = new Date(rangeEndM.getFullYear(), rangeEndM.getMonth() + 1, 0) // dernier jour du mois

  // Colonnes de mois avec décalage cumulé (en jours)
  const months = []
  let offset = 0
  let c = new Date(rangeStart)
  while (c <= rangeEnd) {
    const next = new Date(c.getFullYear(), c.getMonth() + 1, 1)
    const stop = next > rangeEnd ? new Date(rangeEnd.getTime() + DAY) : next
    const days = Math.round((stop - c) / DAY)
    months.push({ key: `${c.getFullYear()}-${c.getMonth()}`, label: `${MONTHS_FR[c.getMonth()].slice(0, 3)} ${String(c.getFullYear()).slice(2)}`, days, offset })
    offset += days
    c = next
  }

  const PX_PER_DAY = 5
  const LABEL_W    = 200
  const trackWidth = offset * PX_PER_DAY
  const x = (ms) => Math.max(0, Math.min(trackWidth, ((ms - rangeStart.getTime()) / DAY) * PX_PER_DAY))
  const todayX = x(today.getTime())

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <div style={{ minWidth: LABEL_W + trackWidth, position: 'relative' }}>

          {/* Séparateurs de mois (verticaux, sur toute la hauteur) */}
          {months.map(m => (
            <div key={`sep-${m.key}`} style={{ position: 'absolute', top: 0, bottom: 0, left: LABEL_W + m.offset * PX_PER_DAY, width: 1, background: '#f3f4f6', zIndex: 0 }} />
          ))}
          {/* Ligne "aujourd'hui" */}
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: LABEL_W + todayX, width: 1.5, background: '#f87171', zIndex: 5 }} />

          {/* En-tête des mois */}
          <div className="flex border-b border-gray-100" style={{ position: 'relative', zIndex: 1 }}>
            <div className="flex-shrink-0" style={{ width: LABEL_W }} />
            {months.map(m => (
              <div key={m.key} className="text-gray-500 uppercase tracking-wide"
                style={{ width: m.days * PX_PER_DAY, fontSize: 10.5, fontWeight: 600, padding: '8px 6px', flexShrink: 0 }}>
                {m.label}
              </div>
            ))}
          </div>

          {/* Lignes projets */}
          <div style={{ position: 'relative', zIndex: 2 }}>
            {dated.map(p => {
              const color = getProjectColor(p)
              const left  = x(startOf(p))
              const right = x(endOf(p))
              const width = Math.max(8, right - left)
              const d = getDaysRemaining(p.deadline)
              return (
                <div key={p.id} className="flex items-center border-b border-gray-50 hover:bg-gray-50/50 transition-colors" style={{ height: 46 }}>
                  <Link href={`/projects/${p.id}`} className="flex-shrink-0 px-4 min-w-0" style={{ width: LABEL_W }}>
                    <div className="font-medium text-gray-900 truncate" style={{ fontSize: 13 }}>{p.name}</div>
                    <div className="text-gray-400 truncate" style={{ fontSize: 11 }}>{p.client}</div>
                  </Link>
                  <div style={{ position: 'relative', width: trackWidth, height: '100%', flexShrink: 0 }}>
                    <div title={`${p.name} — échéance ${formatDate(p.deadline)}`}
                      style={{
                        position: 'absolute', top: '50%', transform: 'translateY(-50%)',
                        left, width, height: 18, borderRadius: 9, background: color,
                        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                        paddingRight: 6, boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                      }}>
                    </div>
                    <span style={{
                      position: 'absolute', top: '50%', transform: 'translateY(-50%)',
                      left: left + width + 8, fontSize: 11, fontWeight: 600,
                      color: d < 0 ? '#dc2626' : '#6b7280', whiteSpace: 'nowrap',
                    }}>
                      {formatDateShort(p.deadline)}{d < 0 ? ` · ${Math.abs(d)}j retard` : d === 0 ? " · auj." : ''}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {undated.length > 0 && (
        <div className="px-4 py-3 border-t border-gray-100 text-gray-400" style={{ fontSize: 12 }}>
          {undated.length} projet{undated.length > 1 ? 's' : ''} sans date — non affiché{undated.length > 1 ? 's' : ''} sur la frise.
        </div>
      )}
    </div>
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
  name: '', client: '', description: '', short_description: '', deadline: '',
  delivery_type: 'Livraison', responsible: 'non défini', color_override: null, notes: '',
  kdrive_folder_id: null, kdrive_folder_path: '',
}

// ─── Page Admin ───────────────────────────────────────────────────────────────

export default function Admin() {
  const { user, signOut } = useAuth()
  const { responsibles } = useResponsibles()

  // Données via SWR : affichage instantané depuis le cache + revalidation auto
  const { data: projects = [], isLoading: projectsLoading, mutate: mutateProjects } = useSWR('/api/projects')
  const { data: tasks = [], mutate: mutateTasks } = useSWR('/api/tasks')
  const fetchProjects = () => mutateProjects()
  const fetchTasks    = () => mutateTasks()
  // On ne montre le skeleton qu'au tout premier chargement (cache vide)
  const loading = projectsLoading && projects.length === 0

  const [showForm, setShowForm]         = useState(false)
  const [editingProject, setEditingProject] = useState(null)
  const [form, setForm]                 = useState(emptyForm)
  const [saving, setSaving]             = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [feedback, setFeedback]         = useState(null)
  const [selectedProjectId, setSelectedProjectId] = useState(null)
  const [logisticsProject, setLogisticsProject]   = useState(null)
  const [pickerOpen, setPickerOpen]               = useState(false)
  const [viewMode, setViewMode]                   = useState('list')

  useEffect(() => {
    const saved = typeof window !== 'undefined' && localStorage.getItem('projectsViewMode')
    if (saved === 'kanban' || saved === 'list' || saved === 'gantt') setViewMode(saved)
  }, [])

  function changeViewMode(mode) {
    setViewMode(mode)
    if (typeof window !== 'undefined') localStorage.setItem('projectsViewMode', mode)
  }

  function actorHeaders() {
    return { 'Content-Type': 'application/json', 'x-actor': user?.name || '' }
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
      short_description: project.short_description || '',
      deadline: project.deadline || '',
      delivery_type: project.delivery_type || 'Livraison',
      responsible: project.responsible || 'non défini',
      color_override: project.color_override || null,
      notes: isFromTodoist(project) ? '' : (project.notes || ''),
      kdrive_folder_id: project.kdrive_folder_id || null,
      kdrive_folder_path: '',
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

  const activeProjects   = projects.filter(p => p.status === 'active').sort((a, b) => {
    if (!a.deadline && !b.deadline) return 0
    if (!a.deadline) return 1
    if (!b.deadline) return -1
    return new Date(a.deadline) - new Date(b.deadline)
  })
  const archivedProjects = projects.filter(p => p.status !== 'active')
  const inputClass = "w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:border-gray-400 transition-colors bg-white"

  function renderProjectCard(project) {
    const color       = getProjectColor(project)
    const fromTodoist = isFromTodoist(project)
    const incomplete  = needsCompletion(project)
    const allTasks    = tasks.filter(t => t.project_id === project.id)
    const doneCount   = allTasks.filter(t => t.status === 'completed').length
    const totalCount  = allTasks.length
    const progress    = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0
    const respColor   = colorForName(project.responsible)
    const nextTask    = allTasks
      .filter(t => t.status === 'active')
      .sort((a, b) => (a.execution_date || '').localeCompare(b.execution_date || ''))[0]

    return (
      <div key={project.id}
        className="group bg-white rounded-xl border hover:border-gray-300 hover:shadow-sm transition-all overflow-hidden flex flex-col"
        style={{ borderColor: incomplete ? '#fed7aa' : '#e5e7eb' }}>

        {/* Urgency stripe */}
        <div className="h-1.5 w-full" style={{ background: color }} />

        <Link href={`/projects/${project.id}`} className="block px-6 py-5 flex-1 hover:bg-gray-50/50 transition-colors">
          {/* Header: title + responsable avatar */}
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900 leading-tight tracking-tight" style={{ fontSize: 18 }}>
                {project.name}
              </h3>
              <p className={`mt-1 ${incomplete ? 'font-medium' : 'text-gray-500'}`}
                style={{ fontSize: 14, ...(incomplete ? { color: '#ea580c' } : {}) }}>
                {project.client}
              </p>
            </div>
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0"
              style={{ background: respColor, fontSize: 13, letterSpacing: '-0.02em' }}
              title={project.responsible}>
              {initials(project.responsible)}
            </div>
          </div>

          {project.description && (
            <p className="text-gray-500 leading-relaxed line-clamp-2 mb-4" style={{ fontSize: 13 }}>{project.description}</p>
          )}

          {/* Deadline — proeminent */}
          <div className="mb-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-semibold text-gray-900" style={{ fontSize: 15 }}>{formatDate(project.deadline)}</span>
              {!incomplete && <DaysChip deadline={project.deadline} />}
              {incomplete && (
                <span className="text-xs font-medium" style={{ color: '#ea580c' }}>À compléter</span>
              )}
            </div>
          </div>

          {/* Meta line */}
          <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mb-4" style={{ fontSize: 12 }}>
            <span className="font-semibold" style={{ color: respColor }}>{project.responsible || 'non défini'}</span>
            <span className="text-gray-300">·</span>
            <span className="text-gray-500">{project.delivery_type}</span>
            {fromTodoist && (
              <>
                <span className="text-gray-300">·</span>
                <span style={{ color: '#16a34a' }}>Todoist</span>
              </>
            )}
          </div>

          {/* Progress bar — bigger */}
          <div>
            <div className="flex items-center justify-between mb-2" style={{ fontSize: 12 }}>
              <span className="text-gray-500">
                {totalCount === 0
                  ? 'Aucune tâche'
                  : `${doneCount} / ${totalCount} tâche${totalCount > 1 ? 's' : ''}`}
              </span>
              <span className="font-semibold tabular-nums" style={{ color: totalCount === 0 ? '#9ca3af' : '#111827', fontSize: 13 }}>
                {totalCount === 0 ? '—' : `${progress}%`}
              </span>
            </div>
            <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: '#f3f4f6' }}>
              <div className="h-full rounded-full transition-all"
                style={{
                  width: `${progress}%`,
                  background: totalCount === 0 ? '#e5e7eb' : progress === 100 ? '#22c55e' : '#111827',
                }} />
            </div>
          </div>

          {/* Next task */}
          {nextTask && (
            <div className="mt-5 pt-4 border-t flex items-center gap-2" style={{ borderColor: '#f3f4f6' }}>
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: colorForName(nextTask.responsible) }} />
              <span className="text-gray-600 flex-1 truncate" style={{ fontSize: 12 }}>{nextTask.title}</span>
              <span className="text-gray-400 flex-shrink-0" style={{ fontSize: 11 }}>
                {nextTask.responsible}{nextTask.execution_date ? ` · ${formatDateShort(nextTask.execution_date)}` : ''}
              </span>
            </div>
          )}
        </Link>

        {/* Actions — toujours visibles mais discrètes */}
        <div className="px-6 py-3 flex items-center gap-3 border-t" style={{ borderColor: '#f3f4f6', fontSize: 12 }}>
          <button onClick={() => handleEdit(project)} className="text-gray-500 hover:text-gray-900 transition-colors">Modifier</button>
          <span className="ml-auto text-gray-200">·</span>
          <button onClick={() => handleArchive(project)} className="text-gray-500 hover:text-gray-900 transition-colors">Archiver</button>
          <span className="text-gray-200">·</span>
          <button onClick={() => handleDelete(project)} className="text-gray-500 hover:text-red-600 transition-colors">Supprimer</button>
        </div>
      </div>
    )
  }

  function renderProjectRow(project) {
    const color       = getProjectColor(project)
    const fromTodoist = isFromTodoist(project)
    const incomplete  = needsCompletion(project)
    const allTasks    = tasks.filter(t => t.project_id === project.id)
    const doneCount   = allTasks.filter(t => t.status === 'completed').length
    const totalCount  = allTasks.length
    const progress    = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0
    const respColor   = colorForName(project.responsible)

    return (
      <div key={project.id} className="group relative flex gap-3.5 px-5 py-5 hover:bg-gray-50/70 transition-colors">
        {/* Accent d'urgence (toute la hauteur) */}
        <span className="w-1 rounded-full flex-shrink-0 self-stretch" style={{ background: color }} />

        <div className="flex-1 min-w-0">
          {/* Ligne 1 — nom · client */}
          <Link href={`/projects/${project.id}`} className="block min-w-0 pr-8 truncate">
            <span className="font-semibold text-gray-900" style={{ fontSize: 15 }}>{project.name}</span>
            <span className={incomplete ? 'font-medium' : 'text-gray-400'}
              style={{ fontSize: 14, ...(incomplete ? { color: '#ea580c' } : {}) }}>
              {'  ·  '}{project.client}
            </span>
            {fromTodoist && <span style={{ color: '#16a34a', fontSize: 12 }}> · Todoist</span>}
          </Link>

          {/* Ligne 2 — méta : responsable · échéance · avancement */}
          <div className="flex items-center flex-wrap gap-x-6 gap-y-2 mt-3" style={{ fontSize: 13 }}>
            {/* Responsable */}
            <span className="inline-flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0"
                style={{ background: respColor, fontSize: 10, letterSpacing: '-0.02em' }}>
                {initials(project.responsible)}
              </span>
              <span className="text-gray-600">{project.responsible || 'non défini'}</span>
            </span>

            {/* Échéance */}
            <span className="inline-flex items-center gap-2">
              <span className="text-gray-500 tabular-nums">{formatDate(project.deadline) || 'Sans date'}</span>
              {!incomplete && <DaysChip deadline={project.deadline} />}
            </span>

            {/* Avancement */}
            {totalCount === 0 ? (
              <span className="text-gray-400">Aucune tâche</span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <span className="inline-block w-24 h-1.5 rounded-full overflow-hidden align-middle" style={{ background: '#f3f4f6' }}>
                  <span className="block h-full rounded-full" style={{ width: `${progress}%`, background: progress === 100 ? '#22c55e' : '#111827' }} />
                </span>
                <span className="font-semibold tabular-nums text-gray-700">{progress}%</span>
                <span className="text-gray-400 tabular-nums">{doneCount}/{totalCount}</span>
              </span>
            )}
          </div>
        </div>

        {/* Menu actions compact */}
        <ProjectActionsMenu
          onEdit={() => handleEdit(project)}
          onArchive={() => handleArchive(project)}
          onDelete={() => handleDelete(project)}
        />
      </div>
    )
  }

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
          input:focus, select:focus, textarea:focus { border-color: #9ca3af !important; box-shadow: 0 0 0 3px rgba(17,24,39,0.06) !important; }
          * { -webkit-tap-highlight-color: transparent; }
          button, a { touch-action: manipulation; }
          @media (max-width: 768px) { input, select, textarea { font-size: 16px !important; } }
          .pac-container { z-index: 99999 !important; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.12); }
        `}</style>
      </Head>

      {/* Header */}
      <NavBar title="Projets">
        <button onClick={() => { resetForm(); setShowForm(true) }}
          style={{ background: '#111827', color: '#fff' }}
          className="px-4 py-2 text-sm font-medium rounded-md hover:opacity-90 transition-opacity">
          Nouveau projet
        </button>
      </NavBar>

      {/* Feedback toast */}
      {feedback && (
        <div className="fixed top-20 right-5 z-50 px-4 py-2.5 rounded-2xl shadow-lg text-sm font-medium"
          style={{ background: feedback.type === 'error' ? '#ef4444' : PINK, color: '#fff' }}>
          {feedback.msg}
        </div>
      )}

      <main className="w-full px-4 md:px-10 py-6 md:py-10 space-y-8 md:space-y-12" style={{ maxWidth: 1800, margin: '0 auto' }}>

        {/* Formulaire Add/Edit */}
        {showForm && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-5 md:px-8 py-4 md:py-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 text-base">
                {editingProject ? `Modifier — ${editingProject.name}` : 'Nouveau projet'}
              </h2>
              <button onClick={resetForm}
                className="w-8 h-8 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 transition-colors text-xl">
                ×
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 md:p-8">
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
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Description courte (vue Atelier)</label>
                  <input type="text" value={form.short_description}
                    onChange={e => handleFieldChange('short_description', e.target.value)}
                    maxLength={80}
                    placeholder="Ex: 2 bars LED + podium"
                    className={inputClass} />
                  <p className="text-xs text-gray-400 mt-1">Visible sur l'écran mural. Max 80 caractères.</p>
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Description longue</label>
                  <textarea value={form.description}
                    onChange={e => handleFieldChange('description', e.target.value)}
                    rows={6}
                    placeholder="Colle ici un mail, des infos détaillées, le brief client…"
                    className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:border-gray-400 transition-colors bg-white resize-y leading-relaxed"
                    style={{ minHeight: 140 }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Date de livraison</label>
                  <input type="date" value={form.deadline}
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
                    {responsibles.map(r => <option key={r}>{r}</option>)}
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
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Dossier kDrive</label>
                  <div className="flex items-center gap-3 flex-wrap">
                    <button type="button" onClick={() => setPickerOpen(true)}
                      className="px-3 py-2 text-sm rounded-md border border-gray-200 hover:border-gray-400 transition-colors text-gray-700 inline-flex items-center gap-2">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
                      </svg>
                      {form.kdrive_folder_id ? 'Changer' : 'Choisir un dossier'}
                    </button>
                    {form.kdrive_folder_id && (
                      <>
                        <span className="text-sm text-gray-600 truncate">
                          {form.kdrive_folder_path || `Dossier #${form.kdrive_folder_id}`}
                        </span>
                        <button type="button"
                          onClick={() => setForm(f => ({ ...f, kdrive_folder_id: null, kdrive_folder_path: '' }))}
                          className="text-xs text-gray-400 hover:text-red-500">
                          retirer
                        </button>
                      </>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">Lie le projet à un dossier existant sur kDrive. Sinon, un dossier sera créé automatiquement au premier upload.</p>
                </div>
              </div>
              <div className="mt-8 flex items-center gap-3">
                <button type="submit" disabled={saving}
                  style={{ background: '#111827', color: '#fff' }}
                  className="px-5 py-2 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
                  {saving ? 'Enregistrement…' : editingProject ? 'Mettre à jour' : 'Créer le projet'}
                </button>
                <button type="button" onClick={resetForm} className="px-3 py-2 text-sm text-gray-500 hover:text-gray-800">
                  Annuler
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Projets actifs */}
        <div className="mx-auto w-full" style={{ maxWidth: viewMode === 'list' ? 1180 : undefined }}>
          <div className="flex items-baseline gap-3 mb-6">
            <h2 className="font-semibold text-gray-900 tracking-tight" style={{ fontSize: 'clamp(20px, 5vw, 28px)' }}>Projets en cours</h2>
            <span className="text-base text-gray-400">{activeProjects.length}</span>
            <div className="ml-auto self-center inline-flex items-center gap-0.5 p-1 rounded-lg bg-gray-100">
              {[
                { key: 'list',   label: 'Liste' },
                { key: 'kanban', label: 'Kanban' },
                { key: 'gantt',  label: 'Gantt' },
              ].map(v => (
                <button key={v.key} onClick={() => changeViewMode(v.key)}
                  className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
                  style={viewMode === v.key
                    ? { background: '#fff', color: '#111827', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }
                    : { background: 'transparent', color: '#6b7280' }}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {/* Résumé d'urgence */}
          {activeProjects.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-5">
              {KANBAN_COLUMNS.map(col => {
                const n = activeProjects.filter(p => deadlineBucket(p.deadline) === col.key).length
                if (!n) return null
                return (
                  <span key={col.key} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                    style={{ background: `${col.accent}14`, color: col.accent, fontSize: 12, fontWeight: 600 }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: col.accent }} />
                    {n} {col.label.toLowerCase()}
                  </span>
                )
              })}
            </div>
          )}

          {/* Bannière Todoist */}
          {activeProjects.some(needsCompletion) && (
            <div className="mb-6 px-5 py-4 rounded-md border"
              style={{ background: '#fff8f0', borderColor: '#fed7aa' }}>
              <p className="text-sm text-orange-800">
                <strong>{activeProjects.filter(needsCompletion).length} projet{activeProjects.filter(needsCompletion).length > 1 ? 's' : ''}</strong> importé{activeProjects.filter(needsCompletion).length > 1 ? 's' : ''} depuis Todoist — clique sur Modifier pour compléter les infos.
              </p>
            </div>
          )}

          {loading ? (
            <ProjectsSkeleton />
          ) : activeProjects.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-lg border border-gray-200">
              <p className="text-gray-400 text-sm">Aucun projet actif.</p>
            </div>
          ) : viewMode === 'gantt' ? (
            <GanttView projects={activeProjects} />
          ) : viewMode === 'kanban' ? (
            <div className="flex gap-5 overflow-x-auto pb-4 -mx-4 px-4 md:-mx-10 md:px-10">
              {KANBAN_COLUMNS.map(col => {
                const colProjects = activeProjects.filter(p => deadlineBucket(p.deadline) === col.key)
                return (
                  <div key={col.key} className="flex-shrink-0 w-80">
                    <div className="flex items-center gap-2 mb-4 px-1">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: col.accent }} />
                      <h3 className="font-semibold text-gray-700 text-sm">{col.label}</h3>
                      <span className="text-xs text-gray-400 tabular-nums">{colProjects.length}</span>
                    </div>
                    <div className="space-y-4">
                      {colProjects.length === 0 ? (
                        <div className="text-center py-10 rounded-xl border border-dashed border-gray-200 text-gray-300 text-xs">
                          Aucun projet
                        </div>
                      ) : colProjects.map(renderProjectCard)}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="divide-y divide-gray-100">
                {groupByMonth(activeProjects).flatMap(g => [
                  <div key={`m-${g.key}`}
                    className="flex items-center gap-2 px-5 py-3 bg-gray-50/80 border-b border-gray-100"
                    style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.06em' }}>
                    <span className="text-gray-700 uppercase">{g.label}</span>
                    <span className="inline-flex items-center justify-center h-4 px-1.5 rounded-full bg-gray-200 text-gray-600 tabular-nums"
                      style={{ fontSize: 10.5, fontWeight: 600 }}>{g.items.length}</span>
                  </div>,
                  ...g.items.map(renderProjectRow),
                ])}
              </div>
            </div>
          )}
        </div>

        {/* Projets archivés */}
        {archivedProjects.length > 0 && (
          <div>
            <button onClick={() => setShowArchived(v => !v)}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors mb-5">
              <span className="text-xs">{showArchived ? '▾' : '▸'}</span>
              Projets archivés ({archivedProjects.length})
            </button>
            {showArchived && (
              <div className="space-y-2">
                {archivedProjects.map(project => (
                  <div key={project.id} className="bg-white rounded-md border border-gray-100 px-5 py-3 flex items-center justify-between hover:border-gray-200 transition-colors">
                    <div className="flex items-baseline gap-3 text-sm">
                      <span className="font-medium text-gray-600">{project.name}</span>
                      <span className="text-gray-400">{project.client}</span>
                      <span className="text-xs text-gray-400">{formatDate(project.deadline)}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <button onClick={() => handleRestore(project)} className="text-gray-500 hover:text-gray-900 transition-colors">Restaurer</button>
                      <span className="text-gray-200">·</span>
                      <button onClick={() => handleDelete(project)} className="text-gray-500 hover:text-red-600 transition-colors">Supprimer</button>
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
          <span>maze project</span>
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

      {/* Picker dossier kDrive */}
      {pickerOpen && (
        <KDriveFolderPicker
          initialFolderId={form.kdrive_folder_id}
          onSelect={({ id, name, path }) => {
            setForm(f => ({ ...f, kdrive_folder_id: id, kdrive_folder_path: path || name }))
            setPickerOpen(false)
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}
