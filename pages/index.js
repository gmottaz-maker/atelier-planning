import { useState, useEffect, useRef } from 'react'
import useSWR from 'swr'
import Head from 'next/head'
import { quoteStatusMeta, quoteStripe, offreAFaire } from '../lib/quoteStatus'
import Link from 'next/link'
import { useAuth } from './_app'
import { useResponsibles } from '../lib/useResponsibles'
import KDriveFolderPicker from '../components/KDriveFolderPicker'
import BillingContactSelect from '../components/BillingContactSelect'
import { PROJECT_PHASES, phaseMeta, isOngoing } from '../lib/projectPhase'
import { AL, C, FONT, MONO, R } from '../lib/theme'
import { statutProjet, joursRestants } from '../lib/projectStatus'
import ButtonPill from '../components/ButtonPill'
import useIsAdmin from '../lib/useIsAdmin'

const DELIVERY_TYPES = ['Livraison', 'Montage sur place', 'Client vient chercher', 'Enlèvement sur place']
const COLOR_OPTIONS  = [
  { value: null,      label: 'Auto (selon urgence)', icon: '🤖' },
  { value: C.success, label: 'Vert',   icon: '🟢' },
  { value: C.warning, label: 'Orange', icon: '🟡' },
  { value: C.danger, label: 'Rouge',  icon: '🔴' },
  { value: C.info, label: 'Bleu',   icon: '🔵' },
  { value: C.violet, label: 'Violet', icon: '🟣' },
  { value: C.muted, label: 'Gris',   icon: '⚫' },
]
const PINK = AL.black
const PERSON_COLORS = { Arnaud: C.info, Gabin: C.violet, Guillaume: AL.black, 'Sous-traitant': C.muted, 'non défini': C.muted }

function colorForName(name) {
  if (!name) return C.muted
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
// Feu tricolore par échéance : rouge = proche (≤ 2 semaines / en retard),
// orange = 2 à 3 semaines, vert = le reste.
function getAutoColor(deadline) {
  const d = getDaysRemaining(deadline)
  if (d === null) return C.muted   // sans date → gris
  if (d < 0)   return C.danger      // en retard
  if (d < 14)  return C.danger      // proche (< 2 semaines)
  if (d <= 21) return C.warning      // 2 à 3 semaines
  return C.success                   // le reste
}
const SUSPENDED_COLOR = C.muted      // gris ardoise — projet en pause
function getProjectColor(p) {
  if (p.suspended) return SUSPENDED_COLOR   // en pause → gris, jamais « en retard »
  if (p.color_override) return p.color_override
  const pm = phaseMeta(p.phase)
  if (pm) return pm.color              // phase définie → couleur de phase (pas de rouge « retard »)
  return getAutoColor(p.deadline)
}
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

// Badge d'échéance « DANS xJ » (11b). urgent = accent, sinon neutre.
function daysBadge(deadline, phase, suspended) {
  if (suspended) return { text: 'EN PAUSE', kind: 'phase', color: SUSPENDED_COLOR, bg: C.neutralBg }
  const pm = phaseMeta(phase)
  if (pm) return { text: pm.label.toUpperCase(), kind: 'phase', color: pm.color, bg: pm.bg }
  if (!deadline) return { text: 'Sans date', kind: 'none' }
  const d = getDaysRemaining(deadline)
  if (d < 0)  return { text: `RETARD ${-d}J`, kind: 'urgent' }
  if (d <= 7) return { text: `DANS ${d}J`, kind: 'urgent' }
  return { text: `DANS ${d}J`, kind: 'normal' }
}
// Badge de statut : mêmes métriques partout (carte et liste).
function BadgeStatut({ project }) {
  const s = statutProjet(project)
  return (
    <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: '.04em', padding: '3px 10px',
      borderRadius: R.pill, color: s.fg, background: s.bg, whiteSpace: 'nowrap' }}>{s.text}</span>
  )
}

// Barre d'avancement. Le handoff demande explicitement de traiter le cas
// « aucune tâche » : on montre la piste vide, jamais une barre pleine.
function BarreAvancement({ pct, actif }) {
  return (
    <div style={{ width: '100%', height: 4, borderRadius: 2, background: C.border, overflow: 'hidden' }}>
      {actif && pct > 0 && <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: AL.black }} />}
    </div>
  )
}

// Buckets pour les pills de filtre temporel (11b)
function timeBucket(deadline) {
  const d = getDaysRemaining(deadline)
  if (d != null && d < 7)  return 'week'
  if (d != null && d < 14) return 'two'
  return 'later'
}

// ─── Kanban par échéance ─────────────────────────────────────────────────────
const KANBAN_COLUMNS = [
  { key: 'overdue', label: 'En retard',     accent: C.danger },
  { key: 'week',    label: 'Cette semaine', accent: C.warning },
  { key: 'month',   label: 'Ce mois',       accent: C.warning },
  { key: 'later',   label: 'Plus tard',     accent: C.success },
]
function deadlineBucket(deadline) {
  const d = getDaysRemaining(deadline)
  if (d === null) return 'later'   // projets sans date → "Plus tard"
  if (d < 0)  return 'overdue'
  if (d < 7)  return 'week'
  if (d < 30) return 'month'
  return 'later'
}

// Colonnes Kanban : En cours · En retard · mois courant · +1 · +2 · Plus tard · En pause
function buildKanbanColumns() {
  const now = new Date()
  const monthAccents = [C.warning, C.warning, C.success]
  // « En cours / livré » ouvre la liste : ce sont les projets sur lesquels on
  // travaille aujourd'hui, ils passent avant tout ce qui n'est encore qu'une
  // échéance. Les colonnes d'échéance suivent, du plus urgent au plus lointain.
  const cols = [
    { key: 'ongoing', label: 'En cours / livré', accent: C.warning },
    { key: 'overdue', label: 'En retard',        accent: C.danger },
  ]
  for (let i = 0; i < 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const name = MONTHS_FR[d.getMonth()]
    cols.push({ key: ym, label: `${name.charAt(0).toUpperCase()}${name.slice(1)}`, accent: monthAccents[i] })
  }
  cols.push({ key: 'later', label: 'Plus tard', accent: C.muted })
  cols.push({ key: 'suspended', label: 'En pause', accent: SUSPENDED_COLOR })     // projets suspendus
  return cols
}
function kanbanColumnKey(deadline, columns, phase, suspended) {
  if (suspended) return 'suspended'         // en pause → hors logique d'échéance
  if (isOngoing(phase)) return 'ongoing'    // phase définie → hors logique d'échéance
  if (!deadline) return 'later'
  if (getDaysRemaining(deadline) < 0) return 'overdue'
  const ym = deadline.slice(0, 7)
  return columns.some(c => c.key === ym) ? ym : 'later'
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

function DaysChip({ deadline, phase, suspended }) {
  if (suspended) return <span style={{ background:C.neutralBg, color: SUSPENDED_COLOR }} className="px-2 py-0.5 u-pill text-xs font-semibold">En pause</span>
  const pm = phaseMeta(phase)
  if (pm) return <span style={{ background: pm.bg, color: pm.color }} className="px-2 py-0.5 u-pill text-xs font-semibold">{pm.label}</span>
  const d = getDaysRemaining(deadline)
  if (d === null) return <span style={{ background:C.neutralBg,color:C.muted }} className="px-2 py-0.5 u-pill text-xs font-medium">Sans date</span>
  if (d < 0)  return <span style={{ background:C.dangerBg,color:C.danger }} className="px-2 py-0.5 u-pill text-xs font-bold">En retard ({Math.abs(d)}j)</span>
  if (d === 0) return <span style={{ background:C.dangerBg,color:C.danger }} className="px-2 py-0.5 u-pill text-xs font-bold">Aujourd'hui !</span>
  if (d === 1) return <span style={{ background:C.warningBg,color:C.warning }} className="px-2 py-0.5 u-pill text-xs font-bold">Demain</span>
  if (d < 7)  return <span style={{ background:C.warningBg,color:C.warning }} className="px-2 py-0.5 u-pill text-xs font-bold">{d}j restants</span>
  if (d < 14) return <span style={{ background:C.warningBg,color:C.warning }} className="px-2 py-0.5 u-pill text-xs font-bold">{d}j restants</span>
  return <span style={{ background:C.successBg,color:C.success }} className="px-2 py-0.5 u-pill text-xs font-semibold">{d}j restants</span>
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
    <div className="u-surface u-panel border u-line overflow-hidden">
      <style>{`@keyframes maze-shimmer { 0% { opacity:.55 } 50% { opacity:1 } 100% { opacity:.55 } }`}</style>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5 border-b u-line last:border-0"
          style={{ animation: 'maze-shimmer 1.3s ease-in-out infinite', animationDelay: `${i * 0.08}s` }}>
          <div className="w-1 h-9 u-pill u-fill flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="h-3.5 u-fill rounded w-1/3 mb-2" />
            <div className="h-2.5 u-fill rounded w-1/5" />
          </div>
          <div className="w-7 h-7 u-pill u-fill flex-shrink-0" />
          <div className="h-5 u-fill u-pill w-20 flex-shrink-0" />
          <div className="h-2 u-fill rounded w-24 flex-shrink-0 hidden md:block" />
        </div>
      ))}
    </div>
  )
}

// ─── Menu d'actions compact (⋯) ─────────────────────────────────────────────

// Menu d'actions secondaires. Il était en `position: absolute` calé sur un
// parent `.group.relative` ; il est maintenant EN FLUX, donc utilisable aussi
// bien dans le pied d'une carte que dans une ligne de liste, sans que le
// conteneur ait à se déclarer positionné.
function ProjectActionsMenu({ items = [] }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'relative', flex: 'none' }}>
      <button onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }} aria-label="Actions"
        style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: R.pill, border: 'none', background: open ? C.hover : 'transparent',
          color: open ? AL.black : C.muted, cursor: 'pointer', fontSize: 18, lineHeight: 1,
          transition: 'background .15s ease, color .15s ease' }}
        onMouseEnter={e => { e.currentTarget.style.background = C.hover; e.currentTarget.style.color = AL.black }}
        onMouseLeave={e => { if (!open) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.muted } }}>
        ⋯
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'absolute', right: 0, top: 32, zIndex: 20, minWidth: 176,
            background: C.surface, borderRadius: R.panel, border: `1.5px solid ${C.outline}`,
            padding: 6, display: 'flex', flexDirection: 'column', fontFamily: FONT }}>
            {items.map(it => (
              <button key={it.label} onClick={() => { setOpen(false); it.onClick() }}
                style={{ textAlign: 'left', padding: '8px 12px', borderRadius: R.pill, border: 'none',
                  background: 'transparent', color: it.danger ? C.danger : AL.black,
                  fontSize: 13, fontFamily: FONT, cursor: 'pointer' }}
                onMouseEnter={e => { e.currentTarget.style.background = it.danger ? C.dangerBg : C.hover }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                {it.label}
              </button>
            ))}
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
      <div className="u-surface u-panel border u-line p-10 text-center u-muted text-sm">
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
    <div className="u-surface u-panel border u-line overflow-hidden">
      <div className="overflow-x-auto">
        <div style={{ minWidth: LABEL_W + trackWidth, position: 'relative' }}>

          {/* Séparateurs de mois (verticaux, sur toute la hauteur) */}
          {months.map(m => (
            <div key={`sep-${m.key}`} style={{ position: 'absolute', top: 0, bottom: 0, left: LABEL_W + m.offset * PX_PER_DAY, width: 1, background: C.neutralBg, zIndex: 0 }} />
          ))}
          {/* Ligne "aujourd'hui" */}
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: LABEL_W + todayX, width: 1.5, background: C.danger, zIndex: 5 }} />

          {/* En-tête des mois */}
          <div className="flex border-b u-line" style={{ position: 'relative', zIndex: 1 }}>
            <div className="flex-shrink-0" style={{ width: LABEL_W }} />
            {months.map(m => (
              <div key={m.key} className="u-muted uppercase tracking-wide"
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
              // Un projet suspendu (ou avec une phase en cours) n'est pas « en retard ».
              const neutral = p.suspended || isOngoing(p.phase)
              const d = getDaysRemaining(p.deadline)
              return (
                <div key={p.id} className="flex items-center border-b u-line hover:u-fill/50 transition-colors" style={{ height: 46 }}>
                  <Link href={`/projects/${p.id}`} className="flex-shrink-0 px-4 min-w-0" style={{ width: LABEL_W }}>
                    <div className="font-medium u-ink truncate" style={{ fontSize: 13 }}>{p.name}</div>
                    <div className="u-muted truncate" style={{ fontSize: 11 }}>{p.client}</div>
                  </Link>
                  <div style={{ position: 'relative', width: trackWidth, height: '100%', flexShrink: 0 }}>
                    <div title={`${p.name} — échéance ${formatDate(p.deadline)}`}
                      style={{
                        position: 'absolute', top: '50%', transform: 'translateY(-50%)',
                        left, width, height: 18, borderRadius: R.panel, background: color,
                        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                        paddingRight: 6, boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                      }}>
                    </div>
                    <span style={{
                      position: 'absolute', top: '50%', transform: 'translateY(-50%)',
                      left: left + width + 8, fontSize: 11, fontWeight: 600,
                      color: (!neutral && d < 0) ? C.danger : C.muted, whiteSpace: 'nowrap',
                    }}>
                      {formatDateShort(p.deadline)}{neutral ? (p.suspended ? ' · pause' : '') : d < 0 ? ` · ${Math.abs(d)}j retard` : d === 0 ? " · auj." : ''}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {undated.length > 0 && (
        <div className="px-4 py-3 border-t u-line u-muted" style={{ fontSize: 12 }}>
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
          background: 'white', border: `1px solid ${C.border}`, borderRadius: R.panel,
          boxShadow: '0 8px 24px rgba(0,0,0,0.1)', overflow: 'hidden', padding: 0, listStyle: 'none',
        }}>
          {suggestions.map((s, i) => (
            <li key={i} onMouseDown={() => pick(s)}
              style={{
                padding: '9px 14px', fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis', color: AL.black,
                background: i === active ? C.neutralBg : 'white',
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
      <span className="u-muted text-sm flex-shrink-0">–</span>
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

  const inp = "w-full px-3 py-2.5 border u-line u-panel text-sm u-surface transition-all"
  const inpFocus = { fontSize: 16 }

  const hasMontage  = !!form.logistics_address
  const hasDemontage = !!form.disassembly_date || !!form.disassembly_address

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="u-surface w-full sm:max-w-lg rounded-t-3xl sm:u-panel overflow-hidden flex flex-col"
        style={{ maxHeight: '92vh' }}>

        {/* Handle (mobile) */}
        <div className="pt-4 sm:pt-0 flex-shrink-0">
          <div className="w-10 h-1 u-fill u-pill mx-auto sm:hidden" />
        </div>

        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b u-line flex items-start justify-between flex-shrink-0">
          <div>
            <h2 className="font-bold u-ink text-base">🚚 Infos logistiques</h2>
            <p className="text-xs u-muted mt-0.5">{project.name} · {project.delivery_type}</p>
          </div>
          <button onClick={onClose}
            className="w-9 h-9 flex items-center justify-center u-pill u-fill u-muted text-xl flex-shrink-0">
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-5 pt-3 gap-2 flex-shrink-0">
          <button onClick={() => setTab('montage')}
            className="flex-1 py-2 u-panel text-sm font-semibold transition-all"
            style={tab === 'montage'
              ? { background: PINK, color: 'white' }
              : { background: C.neutralBg, color: C.muted }}>
            🔨 Montage
            {hasMontage && <span className="ml-1 text-xs opacity-70">✓</span>}
          </button>
          <button onClick={() => setTab('demontage')}
            className="flex-1 py-2 u-panel text-sm font-semibold transition-all"
            style={tab === 'demontage'
              ? { background: C.violet, color: 'white' }
              : { background: C.neutralBg, color: C.muted }}>
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
                <label className="block text-xs font-medium u-muted mb-1 uppercase tracking-wide">Date de démontage</label>
                <input type="date" value={form.disassembly_date}
                  onChange={e => set('disassembly_date', e.target.value)}
                  className={inp} style={inpFocus} />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium u-muted mb-1 uppercase tracking-wide">Adresse</label>
              <AddressInput
                value={tab === 'montage' ? form.logistics_address : form.disassembly_address}
                onChange={v => set(tab === 'montage' ? 'logistics_address' : 'disassembly_address', v)}
                placeholder="Rue, ville..." className={inp} style={inpFocus} />
            </div>
            <div>
              <label className="block text-xs font-medium u-muted mb-1 uppercase tracking-wide">Heure prévue</label>
              <TimeRangeInput
                value={tab === 'montage' ? form.logistics_time : form.disassembly_time}
                onChange={v => set(tab === 'montage' ? 'logistics_time' : 'disassembly_time', v)}
                baseClass={inp} />
            </div>
            <div>
              <label className="block text-xs font-medium u-muted mb-1 uppercase tracking-wide">Contact sur place</label>
              <input type="text"
                value={tab === 'montage' ? form.logistics_contact : form.disassembly_contact}
                onChange={e => set(tab === 'montage' ? 'logistics_contact' : 'disassembly_contact', e.target.value)}
                placeholder="Nom + téléphone" className={inp} style={inpFocus} />
            </div>
            <div>
              <label className="block text-xs font-medium u-muted mb-1 uppercase tracking-wide">Commentaires</label>
              <textarea rows={3}
                value={tab === 'montage' ? form.logistics_notes : form.disassembly_notes}
                onChange={e => set(tab === 'montage' ? 'logistics_notes' : 'disassembly_notes', e.target.value)}
                placeholder="Accès, matériel, remarques..." className={inp} style={{ ...inpFocus, resize: 'none' }} />
            </div>

            <button type="submit" disabled={saving}
              className="w-full py-3 u-panel text-white font-semibold text-sm disabled:opacity-50 transition-opacity"
              style={{ background: tab === 'montage' ? PINK : C.violet }}>
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
      <div className="u-surface w-full sm:max-w-lg rounded-t-3xl sm:u-panel overflow-hidden flex flex-col"
        style={{ maxHeight: '80vh' }}>
        <div className="pt-4 sm:pt-0 flex-shrink-0">
          <div className="w-10 h-1 u-fill u-pill mx-auto sm:hidden mt-0 mb-2" />
        </div>
        <div className="px-5 pb-4 border-b u-line flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <div className="w-2.5 h-2.5 u-pill flex-shrink-0" style={{ background: color }} />
                <h2 className="font-bold u-ink text-base leading-snug">{project.name}</h2>
              </div>
              <p className="text-sm u-muted">{project.client}</p>
            </div>
            <button onClick={onClose}
              className="w-9 h-9 flex items-center justify-center u-pill u-fill u-muted text-xl flex-shrink-0">
              ×
            </button>
          </div>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-2">
          {projectTasks.length === 0 ? (
            <div className="text-center py-10">
              <div className="text-3xl mb-2">📋</div>
              <p className="u-muted text-sm">Aucune tâche liée à ce projet</p>
            </div>
          ) : (
            <>
              {active.map(task => (
                <div key={task.id} className="flex items-center gap-3 py-3 px-3 u-panel u-fill">
                  <div className="w-2 h-2 u-pill flex-shrink-0" style={{ background: PERSON_COLORS[task.responsible] || C.muted }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold u-ink truncate">
                      {task.is_private && <span className="mr-1">🔒</span>}{task.title}
                    </p>
                    <p className="text-xs u-muted mt-0.5">
                      {task.responsible}{task.execution_date && ` · ${task.execution_date.split('-').reverse().slice(0,2).join('.')}`}
                    </p>
                  </div>
                  <span className="text-xs px-2 py-0.5 u-pill font-medium flex-shrink-0"
                    style={{ background: (PERSON_COLORS[task.responsible] || C.muted) + '22', color: PERSON_COLORS[task.responsible] || C.muted }}>
                    {task.responsible.split(' ')[0]}
                  </span>
                </div>
              ))}
              {done.length > 0 && (
                <div className="pt-2">
                  <p className="text-xs u-muted uppercase tracking-wide font-medium mb-2">Terminées</p>
                  {done.map(task => (
                    <div key={task.id} className="flex items-center gap-3 py-2 px-3 u-panel opacity-40">
                      <div className="w-2 h-2 u-pill u-ok-bg flex-shrink-0" />
                      <p className="text-sm u-muted line-through truncate">{task.title}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <div className="px-5 pb-6 pt-3 border-t u-line flex-shrink-0">
          <Link href="/tasks"
            className="flex items-center justify-center gap-2 w-full py-3 u-panel text-sm font-semibold border-2 transition-opacity hover:opacity-80"
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
  name: '', client: '', client_address: '', client_contact_id: null, reference: '',
  description: '', short_description: '', deadline: '', phase: '',
  delivery_type: 'Livraison', responsible: 'non défini', color_override: null, notes: '',
  kdrive_folder_id: null, kdrive_folder_path: '',
}

// ─── Page Admin ───────────────────────────────────────────────────────────────

export default function Admin() {
  const { user, signOut } = useAuth()
  const { responsibles } = useResponsibles()

  // Données via SWR : affichage instantané depuis le cache + revalidation auto
  const { data: projects = [], isLoading: projectsLoading, mutate: mutateProjects } = useSWR('/api/projects?light=1')
  const { data: tasks = [], mutate: mutateTasks } = useSWR('/api/tasks')
  // Les factures clients ne servent qu'à marquer les projets déjà facturés.
  // Elles ne sont chargées que pour l'admin : la route les refuserait de toute
  // façon à un membre, et rien ne justifie de les faire transiter.
  const isAdmin = useIsAdmin()
  const { data: invoices = [] } = useSWR(isAdmin ? '/api/customer-invoices' : null)
  const invoiceProjectIds = new Set((Array.isArray(invoices) ? invoices : []).map(i => String(i.project_id)))
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
  const [archiveTarget, setArchiveTarget]         = useState(null)
  const [pickerOpen, setPickerOpen]               = useState(false)
  const [viewMode, setViewMode]                   = useState('list')

  useEffect(() => {
    const saved = typeof window !== 'undefined' && localStorage.getItem('projectsViewMode')
    if (saved === 'cards' || saved === 'kanban' || saved === 'list' || saved === 'gantt') setViewMode(saved)
  }, [])

  function changeViewMode(mode) {
    setViewMode(mode)
    if (typeof window !== 'undefined') localStorage.setItem('projectsViewMode', mode)
  }

  function actorHeaders() {
    return { 'Content-Type': 'application/json', 'x-actor': user?.name || '' }
  }

  async function handleSaveLogistics(projectId, logisticsData) {
    // On n'envoie QUE ce qui change. Renvoyer `{ ...project }` renvoyait aussi
    // le `quote_data` allégé par `?light=1` — c'est-à-dire `{ status }` — et
    // le serveur écrasait l'offre entière avec ça. Cf. le garde-fou ajouté
    // dans pages/api/projects/[id].js.
    await fetch(`/api/projects/${projectId}`, {
      method: 'PUT',
      headers: actorHeaders(),
      body: JSON.stringify(logisticsData),
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

  async function patchPhase(project, phase) {
    mutateProjects(projects.map(p => p.id === project.id ? { ...p, phase } : p), false)
    await fetch(`/api/projects/${project.id}`, {
      method: 'PUT', headers: actorHeaders(),
      body: JSON.stringify({ phase }),
    }).catch(() => {})
    mutateProjects()
  }

  async function patchSuspended(project, suspended) {
    mutateProjects(projects.map(p => p.id === project.id ? { ...p, suspended } : p), false)
    await fetch(`/api/projects/${project.id}`, {
      method: 'PUT', headers: actorHeaders(),
      body: JSON.stringify({ suspended }),
    }).catch(() => {})
    mutateProjects()
  }

  async function doArchive(project) {
    // Mise à jour optimiste immédiate (le projet quitte la liste active tout de suite)
    mutateProjects((projects || []).map(p => p.id === project.id ? { ...p, status: 'archived' } : p), false)
    const res = await fetch(`/api/projects/${project.id}`, {
      method: 'PUT',
      headers: actorHeaders(),
      body: JSON.stringify({ status: 'archived' }),
    }).catch(() => null)
    if (res && res.ok) showFeedback('Projet archivé')
    else showFeedback('Erreur lors de l\'archivage', 'error')
    fetchProjects()
  }

  function handleArchive(project) {
    // Avertissement si aucune facture liée → modale in-app (confirm() natif peu fiable en webview)
    if (invoiceProjectIds.has(String(project.id))) doArchive(project)
    else setArchiveTarget(project)
  }

  async function handleRestore(project) {
    await fetch(`/api/projects/${project.id}`, {
      method: 'PUT',
      headers: actorHeaders(),
      body: JSON.stringify({ status: 'active' }),
    })
    showFeedback('Projet restauré')
    fetchProjects()
  }

  function handleEdit(project) {
    setEditingProject(project)
    setForm({
      name: project.name,
      client: project.client,
      client_address: project.client_address || '',
      client_contact_id: project.client_contact_id || null,
      reference: project.reference || '',
      phase: project.phase || '',
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
  // Les trois chiffres du bandeau sont dérivés de la liste déjà chargée —
  // le handoff insiste sur ce point : pas de nouvel endpoint.
  const stats = (() => {
    const echeanceProche = activeProjects.filter(p => {
      const d = getDaysRemaining(p.deadline)
      return d !== null && d >= 0 && d <= 7
    }).length
    const pourcentages = activeProjects.map(p => {
      const t = tasks.filter(x => x.project_id === p.id)
      return t.length ? Math.round((t.filter(x => x.status === 'completed').length / t.length) * 100) : null
    }).filter(v => v !== null)
    const avancementMoyen = pourcentages.length
      ? Math.round(pourcentages.reduce((a, b) => a + b, 0) / pourcentages.length)
      : 0
    return { echeanceProche, avancementMoyen }
  })()

  const archivedProjects = projects.filter(p => p.status !== 'active')
  const inputClass = "w-full px-3 py-2 border u-line u-pill text-sm focus:outline-none focus:u-line transition-colors u-surface"
  // Un champ multiligne ne prend JAMAIS le rayon pill. À 999px sur une boîte de
  // 140px de haut, les deux coins se rejoignent et le champ devient une ellipse.
  // Les textareas sont des panneaux (15px), comme dans la modale logistique.
  const textareaClass = inputClass.replace('u-pill', 'u-panel')

  // ── Carte de projet (vue cartes) ───────────────────────────────────────────
  // v2 : carte d'information dense, SANS imagerie. Le handoff a abandonné la
  // vignette photo de la première itération faute de photos disponibles : la
  // place sert à porter de l'information utile plutôt qu'un placeholder.
  function renderProjectCard(project) {
    const fromTodoist = isFromTodoist(project)
    const incomplete  = needsCompletion(project)
    const allTasks    = tasks.filter(t => t.project_id === project.id)
    const doneCount   = allTasks.filter(t => t.status === 'completed').length
    const totalCount  = allTasks.length
    const progress    = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0
    const nextTask    = allTasks
      .filter(t => t.status === 'active')
      .sort((a, b) => (a.execution_date || '').localeCompare(b.execution_date || ''))[0]
    const s = statutProjet(project)
    // Deux signaux, deux sens : le liseré HAUT dit l'échéance et la phase, la
    // PASTILLE dit où en est l'offre. Elle vaut `null` quand il n'y a rien à
    // signaler (offre envoyée, en attente de réponse) — on n'affiche alors
    // rien du tout : l'avatar est aligné à droite, il ne bouge pas.
    const offre = quoteStripe(project.quote_data)
    // Fond teinté quand rien n'est parti au client : ni offre, ni offre sortie
    // du brouillon. La pastille dit l'état exact, le fond rend la carte
    // repérable d'un coup d'œil dans une colonne de kanban.
    //
    // Bleu et non rouge : un projet sans offre n'est pas une anomalie, c'est du
    // travail qui attend. Le rouge est déjà pris par le retard, sur le liseré
    // haut et sur le badge — deux rouges de sens différents sur la même carte
    // ne se lisent plus.
    const aFaire = offreAFaire(project.quote_data)
    const offreTitre = project.quote_data?.status
      ? `Offre ${quoteStatusMeta(project.quote_data.status).label.toLowerCase()}`
      : 'Offre à faire'
    const lienAction = { background: 'none', border: 'none', padding: 0, cursor: 'pointer',
      font: `12px ${FONT}`, color: C.muted, transition: 'color .15s ease' }
    const survolAction = {
      onMouseEnter: e => { e.currentTarget.style.color = AL.black },
      onMouseLeave: e => { e.currentTarget.style.color = C.muted },
    }

    return (
      <div key={project.id}
        style={{ background: aFaire ? C.infoBg : C.surface, borderRadius: R.panel, padding: 22,
          borderTop: `3px solid ${s.stripe}`,
          display: 'flex', flexDirection: 'column', gap: 14, fontFamily: FONT }}>

        {/* En-tête : nom + client, pastille d'offre, avatar du responsable */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <Link href={`/projects/${project.id}`} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, textDecoration: 'none' }}>
            <span style={{ fontSize: 19, fontWeight: 500, lineHeight: 1.15, letterSpacing: '-.01em', color: AL.black }}>{project.name}</span>
            <span style={{ fontSize: 13, color: incomplete ? C.accent : C.muted }}>
              {project.client}{incomplete ? ' — à compléter' : ''}
            </span>
          </Link>
          {offre && (
            <div title={offreTitre} aria-label={offreTitre}
              style={{ width: 30, height: 30, borderRadius: R.pill, background: offre, flex: 'none' }} />
          )}
          <div title={project.responsible}
            style={{ width: 30, height: 30, borderRadius: R.pill, background: AL.black, color: AL.white,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 500, flex: 'none' }}>
            {initials(project.responsible)}
          </div>
        </div>

        {/* Échéance + badge de statut */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: project.deadline ? AL.black : C.muted }}>
            {formatDate(project.deadline) || 'Sans date'}
          </span>
          <BadgeStatut project={project} />
        </div>

        {/* Méta : responsable · mode · devis */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12.5, color: C.muted }}>
          <span style={{ fontWeight: 500, color: AL.black }}>{project.responsible || 'non défini'}</span>
          <span>·</span>
          <span>{fromTodoist ? 'todoist' : project.delivery_type}</span>
          {project.quote_data?.status && (() => {
            const m = quoteStatusMeta(project.quote_data.status)
            return (<>
              <span>·</span>
              <span style={{ padding: '2px 8px', borderRadius: R.pill, background: C.neutralBg, color: AL.black,
                fontSize: 10.5, fontWeight: 500, letterSpacing: '.04em', textTransform: 'uppercase' }}>
                devis · {m.label}
              </span>
            </>)
          })()}
        </div>

        {/* Avancement */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: C.muted }}>
            <span>{totalCount === 0 ? 'aucune tâche' : `${doneCount} / ${totalCount} tâches`}</span>
            <span style={{ fontWeight: 500, color: totalCount === 0 ? C.muted : AL.black }}>
              {totalCount === 0 ? '—' : `${progress}%`}
            </span>
          </div>
          <BarreAvancement pct={progress} actif={totalCount > 0} />
        </div>

        {/* Prochaine tâche — seulement si elle existe */}
        {nextTask && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderTop: `1px solid ${C.border}`, paddingTop: 11, fontSize: 12, color: C.muted }}>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nextTask.title}</span>
            <span style={{ fontSize: 11, flex: 'none' }}>
              {nextTask.responsible}{nextTask.execution_date ? ` · ${formatDateShort(nextTask.execution_date)}` : ''}
            </span>
          </div>
        )}

        {/* Pied : phase du projet à gauche, actions à droite.
            La maquette n'affiche que « modifier » et « archiver » ; le code en a
            quatre. Les deux nommées restent en clair, les deux autres passent
            dans le menu ⋯ — sinon le pied déborde sur deux lignes dès 300px. */}
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: C.muted }}>
          <select value={project.phase || ''} onChange={e => patchPhase(project, e.target.value)} title="Phase du projet"
            style={{ border: 'none', background: 'none', color: C.muted, font: `12px ${FONT}`, padding: 0, cursor: 'pointer', maxWidth: 104, minWidth: 0 }}>
            <option value="">en préparation</option>
            {PROJECT_PHASES.map(ph => <option key={ph.key} value={ph.key}>{ph.label.toLowerCase()}</option>)}
          </select>
          <div style={{ flex: 1 }} />
          <button onClick={() => handleEdit(project)} style={lienAction} {...survolAction}>modifier</button>
          <button onClick={() => handleArchive(project)} style={lienAction} {...survolAction}>archiver</button>
          <ProjectActionsMenu items={[
            { label: project.suspended ? 'réactiver' : 'suspendre', onClick: () => patchSuspended(project, !project.suspended) },
            { label: 'supprimer', onClick: () => handleDelete(project), danger: true },
          ]} />
        </div>
      </div>
    )
  }

  // ── Ligne de projet (vue liste) ────────────────────────────────────────────
  // Trois colonnes : projet (flex), statut (auto), avancement (120px, à droite).
  // Le séparateur est un filet HAUT sur chaque ligne — pas de carte bordée.
  function renderProjectRow(project) {
    const incomplete = needsCompletion(project)
    const allTasks   = tasks.filter(t => t.project_id === project.id)
    const doneCount  = allTasks.filter(t => t.status === 'completed').length
    const totalCount = allTasks.length
    const progress   = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0

    return (
      <div key={project.id}
        style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '20px 4px',
          borderTop: `1px solid ${C.border}`, fontFamily: FONT }}>

        <Link href={`/projects/${project.id}`}
          style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, textDecoration: 'none' }}>
          <span style={{ fontSize: 20, fontWeight: 500, color: AL.black, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {project.name}
          </span>
          <span style={{ fontSize: 13, color: incomplete ? C.accent : C.muted }}>
            {project.client}{incomplete ? ' — à compléter' : ''}
          </span>
        </Link>

        <div style={{ flex: 'none' }}><BadgeStatut project={project} /></div>

        <div style={{ width: 120, flex: 'none', display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end' }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: totalCount === 0 ? C.muted : AL.black }}>
            {totalCount === 0 ? '—' : `${progress}%`}
          </span>
          <BarreAvancement pct={progress} actif={totalCount > 0} />
        </div>

        <ProjectActionsMenu items={[
          { label: 'modifier',  onClick: () => handleEdit(project) },
          { label: project.suspended ? 'réactiver' : 'suspendre', onClick: () => patchSuspended(project, !project.suspended) },
          { label: 'archiver',  onClick: () => handleArchive(project) },
          { label: 'supprimer', onClick: () => handleDelete(project), danger: true },
        ]} />
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: C.pageBg, fontFamily: FONT, color: C.ink }}>
      <Head>
        <title>Maze Project — Projets</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <style>{`
          input:focus, select:focus, textarea:focus { border-color: ${C.faintBorder} !important; box-shadow: 0 0 0 3px rgba(224,80,110,0.08) !important; }
          * { -webkit-tap-highlight-color: transparent; }
          button, a { touch-action: manipulation; }
          @media (max-width: 768px) { input, select, textarea { font-size: 16px !important; } }
          .pac-container { z-index: 99999 !important; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.12); }
        `}</style>
      </Head>

      {/* Feedback toast */}
      {feedback && (
        <div className="fixed top-5 right-5 z-50 px-4 py-2.5 u-panel shadow-lg text-sm font-medium"
          style={{ background: feedback.type === 'error' ? C.danger : C.ink, color: AL.white }}>
          {feedback.msg}
        </div>
      )}

      <main className="w-full" style={{ padding: '32px 40px 104px', display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* Formulaire Add/Edit — en SURCOUCHE, pas en tête de page.
            Inséré dans le flux, il repoussait la liste des projets vers le bas :
            on cliquait sur « + nouveau projet » et le contenu sautait. */}
        {showForm && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(12,12,12,.35)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 24, overflowY: 'auto' }}
            onClick={e => { if (e.target === e.currentTarget) resetForm() }}>
          <div className="u-surface u-panel" style={{ width: '100%', maxWidth: 1100, marginTop: 24, border: `1.5px solid ${C.outline}`, overflow: 'hidden' }}>
            <div className="px-5 md:px-8 py-4 md:py-5 border-b u-line flex items-center justify-between">
              <h2 className="font-semibold u-ink text-base">
                {editingProject ? `Modifier — ${editingProject.name}` : 'Nouveau projet'}
              </h2>
              <button onClick={resetForm}
                className="w-8 h-8 flex items-center justify-center u-pill u-muted hover:u-fill transition-colors text-xl">
                ×
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 md:p-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium u-muted mb-1.5 uppercase tracking-wide">Nom du projet *</label>
                  <input type="text" required value={form.name}
                    onChange={e => handleFieldChange('name', e.target.value)}
                    placeholder="Ex: Bar comptoir EventX" className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium u-muted mb-1.5 uppercase tracking-wide">Client *</label>
                  <BillingContactSelect
                    key={editingProject?.id || 'new'}
                    initialContactId={editingProject?.client_contact_id}
                    onChange={vals => setForm(f => ({ ...f, ...vals }))} />
                  <input type="text" required value={form.client}
                    onChange={e => handleFieldChange('client', e.target.value)}
                    placeholder="Nom / société (auto, modifiable)" className={inputClass} style={{ marginTop: 6 }} />
                  <textarea rows={3} value={form.client_address || ''}
                    onChange={e => handleFieldChange('client_address', e.target.value)}
                    placeholder="Adresse postale (à l'att. de…, rue, NPA ville)"
                    className={textareaClass} style={{ marginTop: 6, resize: 'none' }} />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="block text-xs font-medium u-muted mb-1.5 uppercase tracking-wide">Description courte (vue Atelier)</label>
                  <input type="text" value={form.short_description}
                    onChange={e => handleFieldChange('short_description', e.target.value)}
                    maxLength={80}
                    placeholder="Ex: 2 bars LED + podium"
                    className={inputClass} />
                  <p className="text-xs u-muted mt-1">Visible sur l'écran mural. Max 80 caractères.</p>
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="block text-xs font-medium u-muted mb-1.5 uppercase tracking-wide">Description longue</label>
                  <textarea value={form.description}
                    onChange={e => handleFieldChange('description', e.target.value)}
                    rows={6}
                    placeholder="Colle ici un mail, des infos détaillées, le brief client…"
                    className={`${textareaClass} resize-y leading-relaxed`}
                    style={{ minHeight: 140 }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium u-muted mb-1.5 uppercase tracking-wide">Date de livraison</label>
                  <input type="date" value={form.deadline}
                    onChange={e => handleFieldChange('deadline', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium u-muted mb-1.5 uppercase tracking-wide">Référence</label>
                  <input type="text" value={form.reference}
                    onChange={e => handleFieldChange('reference', e.target.value)}
                    placeholder="Réf. client / commande (sur l'offre & la facture)" className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium u-muted mb-1.5 uppercase tracking-wide">Mode de livraison</label>
                  <select value={form.delivery_type} onChange={e => handleFieldChange('delivery_type', e.target.value)} className={inputClass}>
                    {DELIVERY_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium u-muted mb-1.5 uppercase tracking-wide">Phase</label>
                  <select value={form.phase} onChange={e => handleFieldChange('phase', e.target.value)} className={inputClass}>
                    <option value="">En préparation</option>
                    {PROJECT_PHASES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                  </select>
                  <p className="text-xs u-muted mt-1">Une phase définie retire le projet des « en retard ».</p>
                </div>
                <div>
                  <label className="block text-xs font-medium u-muted mb-1.5 uppercase tracking-wide">Responsable</label>
                  <select value={form.responsible} onChange={e => handleFieldChange('responsible', e.target.value)} className={inputClass}>
                    {responsibles.map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium u-muted mb-1.5 uppercase tracking-wide">Couleur de la carte</label>
                  <select value={form.color_override ?? 'null'}
                    onChange={e => handleFieldChange('color_override', e.target.value === 'null' ? null : e.target.value)} className={inputClass}>
                    {COLOR_OPTIONS.map(c => <option key={String(c.value)} value={c.value ?? 'null'}>{c.icon} {c.label}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium u-muted mb-1.5 uppercase tracking-wide">Notes internes</label>
                  <input type="text" value={form.notes}
                    onChange={e => handleFieldChange('notes', e.target.value)}
                    placeholder="Info logistique, remarques..." className={inputClass} />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="block text-xs font-medium u-muted mb-1.5 uppercase tracking-wide">Dossier kDrive</label>
                  <div className="flex items-center gap-3 flex-wrap">
                    <button type="button" onClick={() => setPickerOpen(true)}
                      className="px-3 py-2 text-sm u-pill border u-line hover:u-line transition-colors u-ink inline-flex items-center gap-2">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
                      </svg>
                      {form.kdrive_folder_id ? 'Changer' : 'Choisir un dossier'}
                    </button>
                    {form.kdrive_folder_id && (
                      <>
                        <span className="text-sm u-ink truncate">
                          {form.kdrive_folder_path || `Dossier #${form.kdrive_folder_id}`}
                        </span>
                        <button type="button"
                          onClick={() => setForm(f => ({ ...f, kdrive_folder_id: null, kdrive_folder_path: '' }))}
                          className="text-xs u-muted hover:u-ko">
                          retirer
                        </button>
                      </>
                    )}
                  </div>
                  <p className="text-xs u-muted mt-1.5">Lie le projet à un dossier existant sur kDrive. Sinon, un dossier sera créé automatiquement au premier upload.</p>
                </div>
              </div>
              <div className="mt-8 flex items-center gap-3">
                <button type="submit" disabled={saving}
                  style={{ background: AL.black, color: AL.white }}
                  className="px-5 py-2 u-pill text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
                  {saving ? 'Enregistrement…' : editingProject ? 'Mettre à jour' : 'Créer le projet'}
                </button>
                <button type="button" onClick={resetForm} className="px-3 py-2 text-sm u-muted hover:u-ink">
                  Annuler
                </button>
              </div>
            </form>
          </div>
          </div>
        )}

        {/* Projets actifs */}
        <div className="w-full">
          {/* Titre display — le second mot en corail. C'est le seul endroit de
              l'écran où l'accent apparaît, et il est bien au-dessus de 24px. */}
          <h1 style={{ fontSize: '7vw', fontWeight: 400, lineHeight: 1, letterSpacing: '-.01em', margin: '24px 0 0', color: AL.black }}>
            vos <span style={{ color: C.accent }}>projets</span>
          </h1>
          <p style={{ fontSize: 18, color: C.muted, margin: '16px 0 40px' }}>
            {activeProjects.length} projet{activeProjects.length > 1 ? 's' : ''} actif{activeProjects.length > 1 ? 's' : ''}
            {' · '}
            {stats.echeanceProche} échéance{stats.echeanceProche > 1 ? 's' : ''} sous 7 jours
          </p>

          {/* Bandeau de stats — panneaux noirs. La profondeur vient de
              l'inversion de fond, pas d'une ombre : il n'y en a aucune.
              Les trois chiffres sont DÉRIVÉS de la liste déjà chargée, pas
              d'un nouvel endpoint. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 64 }}>
            {[
              { valeur: activeProjects.length, label: 'projets actifs' },
              { valeur: stats.echeanceProche,  label: 'échéance sous 7 jours' },
              { valeur: `${stats.avancementMoyen}%`, label: 'avancement moyen' },
            ].map(s => (
              <div key={s.label} style={{ background: AL.black, borderRadius: R.panel, padding: 24, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 40, fontWeight: 500, lineHeight: 1, color: AL.white }}>{s.valeur}</span>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,.6)' }}>{s.label}</span>
              </div>
            ))}
          </div>

          {/* Barre de contrôles : bascule de vue à gauche, action à droite.
              Le handoff ne dessine que cartes/liste ; kanban et gantt existent
              dans le code et sont conservés, au même format de pill. */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 32 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                { key: 'cards',  label: 'cartes' },
                { key: 'list',   label: 'liste' },
                { key: 'kanban', label: 'kanban' },
                { key: 'gantt',  label: 'gantt' },
              ].map(v => {
                const actif = viewMode === v.key
                return (
                  <button key={v.key} onClick={actif ? undefined : () => changeViewMode(v.key)}
                    style={{ fontFamily: FONT, fontSize: 13, fontWeight: actif ? 500 : 400, padding: '9px 18px',
                      borderRadius: R.pill, border: `1.5px solid ${C.outline}`,
                      background: actif ? AL.black : C.surface, color: actif ? AL.white : AL.black,
                      cursor: actif ? 'default' : 'pointer' }}>
                    {v.label}
                  </button>
                )
              })}
            </div>
            <ButtonPill onClick={() => { resetForm(); setShowForm(true) }}>+ nouveau projet</ButtonPill>
          </div>

          {/* Bannière Todoist */}
          {activeProjects.some(needsCompletion) && (
            <div style={{ marginBottom: 24, padding: '16px 20px', borderRadius: R.panel, background: C.warningBg }}>
              <p style={{ margin: 0, fontSize: 13, color: C.warning }}>
                <strong style={{ fontWeight: 500 }}>{activeProjects.filter(needsCompletion).length} projet{activeProjects.filter(needsCompletion).length > 1 ? 's' : ''}</strong> importé{activeProjects.filter(needsCompletion).length > 1 ? 's' : ''} depuis Todoist — clique sur « modifier » pour compléter les infos.
              </p>
            </div>
          )}

          {loading ? (
            <ProjectsSkeleton />
          ) : activeProjects.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
              <p style={{ color: C.muted, fontSize: 13 }}>Aucun projet actif.</p>
            </div>
          ) : viewMode === 'cards' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 24, alignContent: 'start' }}>
              {activeProjects.map(renderProjectCard)}
            </div>
          ) : viewMode === 'gantt' ? (
            <GanttView projects={activeProjects} />
          ) : viewMode === 'kanban' ? (
            <div className="flex gap-5 overflow-x-auto pb-4 -mx-4 px-4 md:-mx-10 md:px-10">
              {(() => {
                const kanbanCols = buildKanbanColumns()
                return kanbanCols.map(col => {
                  // Le rangement se fait sur la liste COMPLÈTE des colonnes :
                  // `kanbanColumnKey` renvoie « Plus tard » quand le mois d'une
                  // échéance n'est pas dans la liste. Filtrer avant de ranger
                  // déplacerait des projets d'une colonne à l'autre.
                  const colProjects = activeProjects.filter(p => kanbanColumnKey(p.deadline, kanbanCols, p.phase, p.suspended) === col.key)
                  // Une colonne vide ne montre plus « Aucun projet » : elle
                  // disparaît. Le calcul est refait à chaque rendu, donc elle
                  // revient d'elle-même dès qu'un projet tombe dans ce mois.
                  if (colProjects.length === 0) return null
                  return (
                    <div key={col.key} className="flex-shrink-0 w-80">
                      <div className="flex items-center gap-2 mb-4 px-1">
                        <span className="w-2 h-2 u-pill flex-shrink-0" style={{ background: col.accent }} />
                        <h3 className="font-semibold u-ink text-sm">{col.label}</h3>
                        <span className="text-xs u-muted tabular-nums">{colProjects.length}</span>
                      </div>
                      <div className="space-y-4">
                        {colProjects.map(renderProjectCard)}
                      </div>
                    </div>
                  )
                })
              })()}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {/* En-tête de colonnes. Capitales assumées : le handoff excepte
                  explicitement les en-têtes de la règle des minuscules. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '0 4px 12px',
                fontSize: 11, fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: C.muted }}>
                <span style={{ flex: 1 }}>projet</span>
                <span style={{ flex: 'none' }}>statut</span>
                <span style={{ width: 120, flex: 'none', textAlign: 'right' }}>avancement</span>
                <span style={{ width: 28, flex: 'none' }} />
              </div>
              {/* Le regroupement par mois ne vient pas du handoff — il vient du
                  code existant, et il reste utile dès qu'on dépasse la douzaine
                  de projets. Seule son habillage change. */}
              {groupByMonth(activeProjects).flatMap(g => [
                <div key={`m-${g.key}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '28px 4px 8px',
                    fontSize: 11, fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: C.muted }}>
                  <span>{g.label}</span>
                  <span style={{ font: `10px ${MONO}` }}>{g.items.length}</span>
                </div>,
                ...g.items.map(renderProjectRow),
              ])}
            </div>
          )}
        </div>

        {/* Projets archivés */}
        {archivedProjects.length > 0 && (
          <div>
            <button onClick={() => setShowArchived(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, padding: 0,
                border: 'none', background: 'none', cursor: 'pointer', font: `13px ${FONT}`, color: C.muted }}
              onMouseEnter={e => { e.currentTarget.style.color = AL.black }}
              onMouseLeave={e => { e.currentTarget.style.color = C.muted }}>
              <span style={{ fontSize: 11 }}>{showArchived ? '▾' : '▸'}</span>
              projets archivés ({archivedProjects.length})
            </button>
            {showArchived && (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {archivedProjects.map(project => (
                  <div key={project.id}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
                      padding: '14px 4px', borderTop: `1px solid ${C.border}`, fontSize: 13 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, minWidth: 0 }}>
                      <span style={{ fontWeight: 500, color: C.muted }}>{project.name}</span>
                      <span style={{ color: C.muted }}>{project.client}</span>
                      <span style={{ fontSize: 12, color: C.muted }}>{formatDate(project.deadline)}</span>
                    </div>
                    <ProjectActionsMenu items={[
                      { label: 'restaurer', onClick: () => handleRestore(project) },
                      { label: 'supprimer', onClick: () => handleDelete(project), danger: true },
                    ]} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="pt-4 pb-8 flex items-center justify-center gap-2 text-xs u-muted">
          <AtomLogo size={16} />
          <span>maze project</span>
        </div>
      </main>

      {/* Modal logistique */}
      {logisticsProject && (
        <LogisticsModal project={logisticsProject} onClose={() => setLogisticsProject(null)} onSave={handleSaveLogistics} />
      )}

      {/* Avertissement archivage sans facture liée */}
      {archiveTarget && (
        <div onMouseDown={() => setArchiveTarget(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,.45)', zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onMouseDown={e => e.stopPropagation()} style={{ background: AL.white, borderRadius: R.panel, maxWidth: 420, width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,.25)', padding: 24, fontFamily: FONT }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.ink, marginBottom: 8 }}>Archiver sans facture ?</div>
            <p style={{ fontSize: 14, color: C.inkSecondary, lineHeight: 1.55, margin: 0 }}>
              « <strong>{archiveTarget.name}</strong> » n'a aucune facture liée. Archiver quand même ?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
              <button onClick={() => setArchiveTarget(null)}
                style={{ padding: '9px 16px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: C.inkSecondary, font: `600 13px ${FONT}`, cursor: 'pointer' }}>Annuler</button>
              <button onClick={() => { const p = archiveTarget; setArchiveTarget(null); doArchive(p) }}
                style={{ padding: '9px 16px', borderRadius: 6, border: 'none', background: C.ink, color: AL.white, font: `600 13px ${FONT}`, cursor: 'pointer' }}>Archiver</button>
            </div>
          </div>
        </div>
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
