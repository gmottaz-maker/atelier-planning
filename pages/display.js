import { useState, useEffect, useCallback } from 'react'
import Head from 'next/head'
import Link from 'next/link'

const REFRESH_INTERVAL = 60 * 1000
const PINK = '#FF4D6D'

// ─── Thèmes ────────────────────────────────────────────────────────────────

const DARK = {
  bg:           '#0d0d0d',
  headerBg:     '#111111',
  headerBorder: '#1f1f1f',
  cardBg:       '#161616',
  textPrimary:  '#ffffff',
  textSecondary:'#9ca3af',
  textMuted:    '#4b5563',
  gridLine:     '#1f1f1f',
  todayLine:    PINK + '55',
  todayBg:      PINK + '08',
  weekendBg:    '#141414',
  scrollbar:    '#333 #111',
  toggleBg:     '#1a1a1a',
  btnBg:        '#1a1a1a',
  btnText:      '#666666',
  legendText:   '#6b7280',
  overdueBg:    '#1a0508',
  overdueBorder:'#7f1d1d',
}

const LIGHT = {
  bg:           '#f0f0f0',
  headerBg:     '#ffffff',
  headerBorder: '#e5e7eb',
  cardBg:       '#ffffff',
  textPrimary:  '#111827',
  textSecondary:'#374151',
  textMuted:    '#9ca3af',
  gridLine:     '#e5e7eb',
  todayLine:    PINK + '66',
  todayBg:      PINK + '10',
  weekendBg:    '#f3f4f6',
  scrollbar:    '#ccc #f0f0f0',
  toggleBg:     '#f3f4f6',
  btnBg:        '#f3f4f6',
  btnText:      '#6b7280',
  legendText:   '#6b7280',
  overdueBg:    '#fff1f2',
  overdueBorder:'#fca5a5',
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function getDaysRemaining(deadline) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(deadline)
  d.setHours(0, 0, 0, 0)
  return Math.ceil((d - today) / (1000 * 60 * 60 * 24))
}

function getAutoColor(deadline, dark) {
  const days = getDaysRemaining(deadline)
  if (dark) {
    if (days < 0)  return { bg: '#2d0a10', border: '#7f1d1d', text: '#fca5a5', badge: '#ef4444' }
    if (days < 7)  return { bg: '#1f0a0a', border: '#991b1b', text: '#fca5a5', badge: '#ef4444' }
    if (days < 14) return { bg: '#1c1000', border: '#92400e', text: '#fcd34d', badge: '#f59e0b' }
    return          { bg: '#071a10', border: '#166534', text: '#86efac', badge: '#22c55e' }
  } else {
    if (days < 0)  return { bg: '#fff1f2', border: '#fca5a5', text: '#9f1239', badge: '#ef4444' }
    if (days < 7)  return { bg: '#fff1f2', border: '#fca5a5', text: '#b91c1c', badge: '#ef4444' }
    if (days < 14) return { bg: '#fffbeb', border: '#fde68a', text: '#92400e', badge: '#f59e0b' }
    return          { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534', badge: '#22c55e' }
  }
}

function getProjectColors(project, dark) {
  if (!project.color_override) return getAutoColor(project.deadline, dark)
  const c = project.color_override
  return dark
    ? { bg: c + '18', border: c, text: '#ffffff', badge: c }
    : { bg: c + '18', border: c, text: c, badge: c }
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const [year, month, day] = dateStr.split('-')
  return `${day}.${month}.${year}`
}

function formatDayLabel(date) {
  return date.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

function isWeekend(date) {
  const d = date.getDay()
  return d === 0 || d === 6
}

// ─── Logo ──────────────────────────────────────────────────────────────────

function AtomLogo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <ellipse cx="20" cy="20" rx="18" ry="7" stroke={PINK} strokeWidth="2" fill="none" />
      <ellipse cx="20" cy="20" rx="18" ry="7" stroke={PINK} strokeWidth="2" fill="none" transform="rotate(60 20 20)" />
      <ellipse cx="20" cy="20" rx="18" ry="7" stroke={PINK} strokeWidth="2" fill="none" transform="rotate(120 20 20)" />
      <circle cx="20" cy="20" r="3" fill={PINK} />
    </svg>
  )
}

// ─── Timeline ─────────────────────────────────────────────────────────────

const COL_W = 96   // largeur colonne jour
const ROW_H = 56   // hauteur ligne projet
const LABEL_W = 260 // largeur colonne infos

function Timeline({ projects, viewMode, dark, theme }) {
  const numDays = viewMode === 'month' ? 28 : 14
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const days = Array.from({ length: numDays }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() + i)
    return d
  })

  const overdueProjects = projects.filter(p => getDaysRemaining(p.deadline) < 0)
  const visibleProjects = projects.filter(p => getDaysRemaining(p.deadline) >= 0)

  return (
    <div className="flex-1 overflow-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: theme.scrollbar }}>

      {/* Projets en retard */}
      {overdueProjects.length > 0 && (
        <div className="px-8 pt-5 pb-3">
          <div className="rounded-2xl p-4 border" style={{ background: theme.overdueBg, borderColor: theme.overdueBorder }}>
            <div className="text-sm font-bold uppercase tracking-wider mb-3" style={{ color: PINK }}>⚠ En retard</div>
            <div className="flex flex-wrap gap-3">
              {overdueProjects.map(p => {
                const colors = getAutoColor(p.deadline, dark)
                return (
                  <div key={p.id} className="rounded-xl px-4 py-3 border" style={{ background: colors.bg, borderColor: colors.border }}>
                    <div className="font-bold text-base" style={{ color: theme.textPrimary }}>{p.client}</div>
                    <div className="text-sm mt-0.5" style={{ color: colors.text }}>{p.name}</div>
                    <div className="text-sm mt-1" style={{ color: theme.textMuted }}>Prévu: {formatDate(p.deadline)}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Gantt */}
      <div className="px-8 pt-5 pb-10" style={{ minWidth: numDays * COL_W + LABEL_W + 64 }}>

        {/* Header dates */}
        <div className="flex mb-3" style={{ paddingLeft: LABEL_W }}>
          {days.map((day, i) => {
            const isToday = isSameDay(day, today)
            const weekend = isWeekend(day)
            return (
              <div
                key={i}
                style={{
                  width: COL_W, flexShrink: 0,
                  borderBottomColor: isToday ? PINK : theme.gridLine,
                  borderBottomWidth: isToday ? 2 : 1,
                  borderBottomStyle: 'solid',
                  color: isToday ? PINK : weekend ? theme.textMuted : theme.textSecondary,
                }}
                className="text-center text-sm pb-2 font-medium"
              >
                {isToday ? '● Auj.' : formatDayLabel(day)}
              </div>
            )
          })}
        </div>

        {/* Lignes */}
        {visibleProjects.length === 0 ? (
          <div className="text-center py-20 text-lg" style={{ color: theme.textMuted }}>
            Aucun projet à venir dans cette période
          </div>
        ) : (
          <div className="space-y-2.5">
            {visibleProjects.map(project => {
              const colors = getProjectColors(project, dark)
              const daysLeft = getDaysRemaining(project.deadline)
              const barDays = Math.min(daysLeft + 1, numDays)

              return (
                <div key={project.id} className="flex items-center">
                  {/* Infos */}
                  <div style={{ width: LABEL_W, flexShrink: 0 }} className="pr-5">
                    <div className="font-bold text-base leading-tight truncate" style={{ color: theme.textPrimary }}>{project.client}</div>
                    <div className="text-sm mt-0.5 truncate" style={{ color: theme.textSecondary }}>{project.name}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm font-bold" style={{ color: colors.badge }}>
                        {daysLeft === 0 ? "Aujourd'hui !" : `J-${daysLeft}`}
                      </span>
                      {project.responsible && (
                        <span className="text-sm" style={{ color: theme.textMuted }}>· {project.responsible}</span>
                      )}
                    </div>
                  </div>

                  {/* Barre */}
                  <div className="flex-1 relative" style={{ height: ROW_H }}>
                    {/* Fond grille */}
                    <div className="absolute inset-0 flex">
                      {days.map((day, i) => (
                        <div
                          key={i}
                          style={{
                            width: COL_W, flexShrink: 0,
                            borderRight: `1px solid ${isSameDay(day, today) ? theme.todayLine : theme.gridLine}`,
                            background: isSameDay(day, today) ? theme.todayBg : isWeekend(day) ? theme.weekendBg : 'transparent',
                          }}
                        />
                      ))}
                    </div>

                    {/* Barre colorée */}
                    <div
                      className="absolute rounded-2xl flex items-center px-4 overflow-hidden"
                      style={{
                        top: 6, bottom: 6,
                        left: 0,
                        width: barDays * COL_W - 8,
                        backgroundColor: colors.bg,
                        border: `1.5px solid ${colors.border}`,
                      }}
                    >
                      <span className="text-sm font-medium truncate" style={{ color: colors.text }}>
                        {project.delivery_type && `🚚 ${project.delivery_type}`}
                        {project.description && ` · ${project.description}`}
                      </span>
                      <span className="ml-auto text-sm font-bold flex-shrink-0 pl-3" style={{ color: colors.badge }}>
                        {formatDate(project.deadline)}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Cards ─────────────────────────────────────────────────────────────────

function CardView({ projects, dark, theme }) {
  const groups = [
    { label: 'En retard',            color: '#ef4444', items: projects.filter(p => getDaysRemaining(p.deadline) < 0) },
    { label: 'Cette semaine',        color: '#ef4444', items: projects.filter(p => { const d = getDaysRemaining(p.deadline); return d >= 0 && d < 7 }) },
    { label: '2 prochaines semaines',color: '#f59e0b', items: projects.filter(p => { const d = getDaysRemaining(p.deadline); return d >= 7 && d < 14 }) },
    { label: 'Plus tard',            color: '#22c55e', items: projects.filter(p => getDaysRemaining(p.deadline) >= 14) },
  ].filter(g => g.items.length > 0)

  if (groups.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-xl" style={{ color: theme.textMuted }}>
        Aucun projet en cours
      </div>
    )
  }

  return (
    <div
      className="flex-1 overflow-auto p-8 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 content-start"
      style={{ scrollbarWidth: 'thin', scrollbarColor: theme.scrollbar }}
    >
      {groups.map(group => (
        <div key={group.label} className="space-y-4">
          <div className="text-sm font-bold uppercase tracking-widest" style={{ color: group.color }}>
            {group.label}
          </div>
          {group.items.map(project => {
            const colors = getProjectColors(project, dark)
            const daysLeft = getDaysRemaining(project.deadline)
            return (
              <div
                key={project.id}
                className="rounded-2xl p-5 border"
                style={{ backgroundColor: colors.bg, borderColor: colors.border }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div
                    className="text-sm font-bold px-3 py-1 rounded-full"
                    style={{ background: colors.badge + '22', color: colors.badge }}
                  >
                    {daysLeft < 0 ? `En retard de ${Math.abs(daysLeft)}j` :
                     daysLeft === 0 ? "Aujourd'hui !" :
                     `J-${daysLeft}`}
                  </div>
                  <div className="text-sm" style={{ color: theme.textMuted }}>{project.responsible}</div>
                </div>
                <div className="font-bold text-xl leading-snug" style={{ color: theme.textPrimary }}>{project.client}</div>
                <div className="text-base mt-1" style={{ color: theme.textSecondary }}>{project.name}</div>
                {project.description && (
                  <div className="text-sm mt-1.5" style={{ color: theme.textMuted }}>{project.description}</div>
                )}
                <div
                  className="mt-4 pt-3 border-t flex items-center justify-between"
                  style={{ borderColor: colors.border + '66' }}
                >
                  <span className="text-base font-bold" style={{ color: colors.badge }}>
                    📅 {formatDate(project.deadline)}
                  </span>
                  {project.delivery_type && (
                    <span className="text-sm" style={{ color: theme.textMuted }}>{project.delivery_type}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// ─── Page principale ───────────────────────────────────────────────────────

export default function Display() {
  const [projects, setProjects]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [fetchError, setFetchError]   = useState(null)
  const [viewMode, setViewMode]       = useState('weeks')
  const [dark, setDark]               = useState(true)
  const [now, setNow]                 = useState(new Date())
  const [lastRefresh, setLastRefresh] = useState(null)
  const [countdown, setCountdown]     = useState(60)

  const theme = dark ? DARK : LIGHT

  // Persister le mode jour/nuit
  useEffect(() => {
    const saved = localStorage.getItem('displayTheme')
    if (saved === 'light') setDark(false)
  }, [])
  function toggleTheme() {
    const next = !dark
    setDark(next)
    localStorage.setItem('displayTheme', next ? 'dark' : 'light')
  }

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      const active = (Array.isArray(data) ? data : [])
        .filter(p => p.status === 'active')
        .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
      setProjects(active)
      setFetchError(null)
      setLastRefresh(new Date())
      setCountdown(60)
    } catch (err) {
      setFetchError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchProjects() }, [fetchProjects])
  useEffect(() => {
    const interval = setInterval(fetchProjects, REFRESH_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchProjects])
  useEffect(() => {
    const tick = setInterval(() => {
      setNow(new Date())
      setCountdown(c => (c <= 1 ? 60 : c - 1))
    }, 1000)
    return () => clearInterval(tick)
  }, [])

  const dateLabel = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const timeLabel = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: theme.bg, color: theme.textPrimary }}>
      <Head>
        <title>Maze Project — Planning</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <style>{`body { font-family: 'Inter', sans-serif; } * { transition: background-color .2s, border-color .2s, color .15s; }`}</style>
      </Head>

      {/* ── Header ── */}
      <header
        className="flex-shrink-0 px-8 py-4 border-b"
        style={{ background: theme.headerBg, borderColor: theme.headerBorder }}
      >
        <div className="flex items-center justify-between">

          {/* Gauche : logo + heure */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2.5">
              <AtomLogo size={28} />
              <span className="font-bold text-base tracking-tight" style={{ color: theme.textPrimary }}>amazing lab</span>
            </div>
            <div className="w-px h-8" style={{ background: theme.headerBorder }} />
            <div>
              <div className="font-bold text-2xl tabular-nums" style={{ color: PINK }}>{timeLabel}</div>
              <div className="text-sm capitalize mt-0.5" style={{ color: theme.textSecondary }}>{dateLabel}</div>
            </div>
            <div className="hidden md:flex items-center gap-2 pl-1">
              <div className="w-px h-8" style={{ background: theme.headerBorder }} />
              <div className="text-center px-3">
                <div className="text-2xl font-bold" style={{ color: theme.textPrimary }}>{projects.length}</div>
                <div className="text-sm" style={{ color: theme.textMuted }}>projet{projects.length !== 1 ? 's' : ''}</div>
              </div>
            </div>
          </div>

          {/* Centre */}
          <div className="text-center hidden md:block">
            <div className="font-bold text-lg tracking-widest" style={{ color: theme.textSecondary }}>PLANNING ATELIER</div>
          </div>

          {/* Droite : contrôles */}
          <div className="flex items-center gap-2.5">

            {/* Sélecteur de vue */}
            <div className="flex rounded-2xl p-1 gap-0.5" style={{ background: theme.toggleBg }}>
              {[
                { key: 'weeks', label: '2 sem.' },
                { key: 'month', label: 'Mois' },
                { key: 'cards', label: 'Cartes' },
              ].map(v => (
                <button
                  key={v.key}
                  onClick={() => setViewMode(v.key)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                  style={viewMode === v.key
                    ? { background: PINK, color: '#fff' }
                    : { color: theme.btnText, background: 'transparent' }
                  }
                >
                  {v.label}
                </button>
              ))}
            </div>

            {/* Toggle jour/nuit */}
            <button
              onClick={toggleTheme}
              className="px-3.5 py-2.5 rounded-2xl text-lg transition-colors"
              style={{ background: theme.btnBg, color: theme.btnText }}
              title={dark ? 'Passer en mode jour' : 'Passer en mode nuit'}
            >
              {dark ? '☀️' : '🌙'}
            </button>

            {/* Refresh */}
            <button
              onClick={fetchProjects}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl text-sm font-medium transition-colors"
              style={{ background: theme.btnBg, color: theme.btnText }}
              title="Actualiser maintenant"
            >
              <span className="text-base">↻</span>
              <span className="tabular-nums">{countdown}s</span>
            </button>

            {/* Admin */}
            <Link
              href="/"
              className="px-3.5 py-2.5 rounded-2xl text-base transition-colors"
              style={{ background: theme.btnBg, color: theme.btnText }}
              title="Interface admin"
            >
              ⚙️
            </Link>
          </div>
        </div>
      </header>

      {/* ── Contenu ── */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-xl" style={{ color: theme.textMuted }}>
          Chargement…
        </div>
      ) : fetchError ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl mb-4">⚠️</div>
            <div className="text-xl font-bold mb-2" style={{ color: PINK }}>Erreur de chargement</div>
            <div className="text-base mb-6" style={{ color: theme.textSecondary }}>{fetchError}</div>
            <button
              onClick={fetchProjects}
              className="px-6 py-3 rounded-2xl font-semibold text-white"
              style={{ background: PINK }}
            >
              Réessayer
            </button>
          </div>
        </div>
      ) : viewMode === 'cards' ? (
        <CardView projects={projects} dark={dark} theme={theme} />
      ) : (
        <Timeline projects={projects} viewMode={viewMode} dark={dark} theme={theme} />
      )}

      {/* ── Footer ── */}
      <footer
        className="flex-shrink-0 px-8 py-3 flex items-center justify-between border-t"
        style={{ background: theme.headerBg, borderColor: theme.headerBorder }}
      >
        <div className="text-sm" style={{ color: theme.legendText }}>
          Mis à jour : {lastRefresh ? lastRefresh.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—'}
        </div>
        <div className="flex items-center gap-5 text-sm" style={{ color: theme.legendText }}>
          <span className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: '#22c55e' }} />
            &gt; 2 semaines
          </span>
          <span className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: '#f59e0b' }} />
            &lt; 2 semaines
          </span>
          <span className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: '#ef4444' }} />
            &lt; 1 semaine
          </span>
          <span className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: '#7f1d1d' }} />
            En retard
          </span>
        </div>
      </footer>
    </div>
  )
}
