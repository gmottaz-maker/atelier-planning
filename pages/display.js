import { useState, useEffect, useCallback } from 'react'
import Head from 'next/head'
import Link from 'next/link'

const REFRESH_INTERVAL = 60 * 1000 // 60 secondes
const PINK = '#FF4D6D'

// ─── Helpers ───────────────────────────────────────────────────────────────

function getDaysRemaining(deadline) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(deadline)
  d.setHours(0, 0, 0, 0)
  return Math.ceil((d - today) / (1000 * 60 * 60 * 24))
}

function getAutoColor(deadline) {
  const days = getDaysRemaining(deadline)
  if (days < 0)  return { bg: '#2d0a10', border: '#7f1d1d', text: '#fca5a5', badge: '#ef4444' }
  if (days < 7)  return { bg: '#1f0a0a', border: '#991b1b', text: '#fca5a5', badge: '#ef4444' }
  if (days < 14) return { bg: '#1c1000', border: '#92400e', text: '#fcd34d', badge: '#f59e0b' }
  return          { bg: '#071a10', border: '#166534', text: '#86efac', badge: '#22c55e' }
}

function getProjectColors(project) {
  if (!project.color_override) return getAutoColor(project.deadline)
  const c = project.color_override
  return { bg: c + '18', border: c, text: '#ffffff', badge: c }
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

// SVG logo atom Amazing Lab style
function AtomLogo({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="20" cy="20" rx="18" ry="7" stroke={PINK} strokeWidth="2" fill="none" />
      <ellipse cx="20" cy="20" rx="18" ry="7" stroke={PINK} strokeWidth="2" fill="none" transform="rotate(60 20 20)" />
      <ellipse cx="20" cy="20" rx="18" ry="7" stroke={PINK} strokeWidth="2" fill="none" transform="rotate(120 20 20)" />
      <circle cx="20" cy="20" r="3" fill={PINK} />
    </svg>
  )
}

// ─── Composant Timeline ───────────────────────────────────────────────────

function Timeline({ projects, viewMode }) {
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
    <div className="flex-1 overflow-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#333 #111' }}>

      {/* Projets en retard */}
      {overdueProjects.length > 0 && (
        <div className="px-6 pt-4 pb-2">
          <div className="rounded-2xl p-3 border" style={{ background: '#1a0508', borderColor: '#7f1d1d' }}>
            <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: PINK }}>⚠ En retard</div>
            <div className="flex flex-wrap gap-2">
              {overdueProjects.map(p => (
                <div key={p.id} className="rounded-xl px-3 py-2 border" style={{ background: '#2d0a10', borderColor: '#991b1b' }}>
                  <div className="text-white text-sm font-bold">{p.client}</div>
                  <div className="text-xs" style={{ color: '#fca5a5' }}>{p.name}</div>
                  <div className="text-xs text-gray-500">Prévu: {formatDate(p.deadline)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Timeline Gantt */}
      <div className="px-6 pt-4 pb-8" style={{ minWidth: numDays * 80 + 220 }}>

        {/* Header dates */}
        <div className="flex mb-2" style={{ paddingLeft: 220 }}>
          {days.map((day, i) => {
            const isToday = isSameDay(day, today)
            const weekend = isWeekend(day)
            return (
              <div
                key={i}
                style={{ width: 80, flexShrink: 0, borderBottomColor: isToday ? PINK : '#2a2a2a' }}
                className={`text-center text-xs pb-1 border-b ${
                  isToday ? 'font-bold' : weekend ? 'text-gray-600' : 'text-gray-500'
                }`}
              >
                <span style={{ color: isToday ? PINK : undefined }}>
                  {isToday ? '● Auj.' : formatDayLabel(day)}
                </span>
              </div>
            )
          })}
        </div>

        {/* Lignes projets */}
        {visibleProjects.length === 0 ? (
          <div className="text-center py-16 text-gray-600 text-sm">
            Aucun projet à venir dans cette période
          </div>
        ) : (
          <div className="space-y-2 mt-2">
            {visibleProjects.map(project => {
              const colors = getProjectColors(project)
              const daysLeft = getDaysRemaining(project.deadline)
              const barDays = Math.min(daysLeft + 1, numDays)

              return (
                <div key={project.id} className="flex items-center">
                  {/* Infos projet */}
                  <div style={{ width: 220, flexShrink: 0 }} className="pr-4">
                    <div className="text-white text-sm font-bold leading-tight truncate">{project.client}</div>
                    <div className="text-gray-500 text-xs truncate">{project.name}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs font-semibold" style={{ color: colors.badge }}>
                        {daysLeft === 0 ? "Aujourd'hui !" : `J-${daysLeft}`}
                      </span>
                      {project.responsible && (
                        <span className="text-gray-600 text-xs">· {project.responsible}</span>
                      )}
                    </div>
                  </div>

                  {/* Barre de progression */}
                  <div className="flex-1 relative h-11">
                    {/* Grille fond */}
                    <div className="absolute inset-0 flex">
                      {days.map((day, i) => (
                        <div
                          key={i}
                          style={{
                            width: 80, flexShrink: 0,
                            borderRight: `1px solid ${isSameDay(day, today) ? PINK + '44' : '#1f1f1f'}`,
                            background: isSameDay(day, today) ? PINK + '08' : isWeekend(day) ? '#141414' : 'transparent',
                          }}
                          className="h-full"
                        />
                      ))}
                    </div>

                    {/* Barre colorée */}
                    <div
                      className="absolute top-1 bottom-1 rounded-xl flex items-center px-3 overflow-hidden"
                      style={{
                        left: 0,
                        width: barDays * 80 - 6,
                        backgroundColor: colors.bg,
                        border: `1px solid ${colors.border}`,
                      }}
                    >
                      <span className="text-xs font-medium truncate" style={{ color: colors.text }}>
                        {project.delivery_type && `🚚 ${project.delivery_type}`}
                        {project.description && ` · ${project.description}`}
                      </span>
                      <span className="ml-auto text-xs font-bold flex-shrink-0" style={{ color: colors.badge }}>
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

// ─── Composant Cards ──────────────────────────────────────────────────────

function CardView({ projects }) {
  const groups = [
    { label: 'En retard', color: '#ef4444', items: projects.filter(p => getDaysRemaining(p.deadline) < 0) },
    { label: 'Cette semaine', color: '#ef4444', items: projects.filter(p => { const d = getDaysRemaining(p.deadline); return d >= 0 && d < 7 }) },
    { label: '2 prochaines semaines', color: '#f59e0b', items: projects.filter(p => { const d = getDaysRemaining(p.deadline); return d >= 7 && d < 14 }) },
    { label: 'Plus tard', color: '#22c55e', items: projects.filter(p => getDaysRemaining(p.deadline) >= 14) },
  ].filter(g => g.items.length > 0)

  if (groups.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-600 text-lg">
        Aucun projet en cours
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 content-start"
      style={{ scrollbarWidth: 'thin', scrollbarColor: '#333 #111' }}>
      {groups.map(group => (
        <div key={group.label} className="space-y-3">
          <div className="text-xs font-bold uppercase tracking-widest" style={{ color: group.color }}>
            {group.label}
          </div>
          {group.items.map(project => {
            const colors = getProjectColors(project)
            const daysLeft = getDaysRemaining(project.deadline)
            return (
              <div
                key={project.id}
                className="rounded-2xl p-4 border"
                style={{ backgroundColor: colors.bg, borderColor: colors.border }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div
                    className="text-xs font-bold px-2.5 py-1 rounded-full"
                    style={{ background: colors.badge + '25', color: colors.badge }}
                  >
                    {daysLeft < 0 ? `En retard de ${Math.abs(daysLeft)}j` :
                     daysLeft === 0 ? "Aujourd'hui !" :
                     `J-${daysLeft}`}
                  </div>
                  <div className="text-xs text-gray-500">{project.responsible}</div>
                </div>
                <div className="text-white font-bold text-base leading-snug">{project.client}</div>
                <div className="text-gray-400 text-sm mt-0.5">{project.name}</div>
                {project.description && (
                  <div className="text-gray-600 text-xs mt-1">{project.description}</div>
                )}
                <div className="mt-3 pt-3 border-t flex items-center justify-between" style={{ borderColor: colors.border + '55' }}>
                  <span className="text-sm font-bold" style={{ color: colors.badge }}>
                    📅 {formatDate(project.deadline)}
                  </span>
                  {project.delivery_type && (
                    <span className="text-gray-600 text-xs">{project.delivery_type}</span>
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

// ─── Page principale ──────────────────────────────────────────────────────

export default function Display() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState('weeks')
  const [now, setNow] = useState(new Date())
  const [lastRefresh, setLastRefresh] = useState(null)
  const [countdown, setCountdown] = useState(60)

  const fetchProjects = useCallback(async () => {
    const res = await fetch('/api/projects')
    const data = await res.json()
    const active = (Array.isArray(data) ? data : [])
      .filter(p => p.status === 'active')
      .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
    setProjects(active)
    setLoading(false)
    setLastRefresh(new Date())
    setCountdown(60)
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

  const dateLabel = now.toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })
  const timeLabel = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: '#0d0d0d', color: '#fff' }}>
      <Head>
        <title>Atelier — Planning</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <style>{`body { font-family: 'Inter', sans-serif; }`}</style>
      </Head>

      {/* Header */}
      <header className="flex-shrink-0 px-6 py-3 border-b" style={{ background: '#111', borderColor: '#1f1f1f' }}>
        <div className="flex items-center justify-between">

          {/* Logo + heure */}
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2">
              <svg width="22" height="22" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                <ellipse cx="20" cy="20" rx="18" ry="7" stroke={PINK} strokeWidth="2" fill="none" />
                <ellipse cx="20" cy="20" rx="18" ry="7" stroke={PINK} strokeWidth="2" fill="none" transform="rotate(60 20 20)" />
                <ellipse cx="20" cy="20" rx="18" ry="7" stroke={PINK} strokeWidth="2" fill="none" transform="rotate(120 20 20)" />
                <circle cx="20" cy="20" r="3" fill={PINK} />
              </svg>
              <span className="font-bold text-white text-sm tracking-tight">amazing lab</span>
            </div>
            <div className="w-px h-6" style={{ background: '#2a2a2a' }} />
            <div>
              <div className="font-bold text-xl tabular-nums" style={{ color: PINK }}>{timeLabel}</div>
              <div className="text-gray-500 text-xs capitalize">{dateLabel}</div>
            </div>
            <div className="hidden md:flex items-center gap-2 pl-1">
              <div className="w-px h-7" style={{ background: '#2a2a2a' }} />
              <div className="text-center px-2">
                <div className="text-xl font-bold text-white">{projects.length}</div>
                <div className="text-gray-600 text-xs">projet{projects.length !== 1 ? 's' : ''}</div>
              </div>
            </div>
          </div>

          {/* Titre centre */}
          <div className="text-center hidden md:block">
            <div className="text-gray-300 font-semibold text-base tracking-wide">PLANNING ATELIER</div>
          </div>

          {/* Contrôles */}
          <div className="flex items-center gap-2">
            {/* Toggle vue */}
            <div className="flex rounded-2xl p-1 gap-0.5" style={{ background: '#1a1a1a' }}>
              {[
                { key: 'weeks', label: '2 sem.' },
                { key: 'month', label: 'Mois' },
                { key: 'cards', label: 'Cartes' },
              ].map(v => (
                <button
                  key={v.key}
                  onClick={() => setViewMode(v.key)}
                  className="px-3 py-1.5 rounded-xl text-sm font-medium transition-all"
                  style={viewMode === v.key
                    ? { background: PINK, color: '#fff' }
                    : { color: '#666', background: 'transparent' }
                  }
                >
                  {v.label}
                </button>
              ))}
            </div>

            {/* Refresh */}
            <button
              onClick={fetchProjects}
              className="flex items-center gap-1.5 px-3 py-2 rounded-2xl text-sm transition-colors"
              style={{ background: '#1a1a1a', color: '#555' }}
              title="Actualiser maintenant"
            >
              <span>↻</span>
              <span className="text-xs tabular-nums">{countdown}s</span>
            </button>

            {/* Admin */}
            <Link
              href="/"
              className="px-3 py-2 rounded-2xl text-sm transition-colors"
              style={{ background: '#1a1a1a', color: '#555' }}
              title="Interface admin"
            >
              ⚙️
            </Link>
          </div>
        </div>
      </header>

      {/* Contenu principal */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-gray-600 text-lg">Chargement...</div>
        </div>
      ) : viewMode === 'cards' ? (
        <CardView projects={projects} />
      ) : (
        <Timeline projects={projects} viewMode={viewMode} />
      )}

      {/* Footer */}
      <footer className="flex-shrink-0 px-6 py-2.5 flex items-center justify-between border-t" style={{ background: '#111', borderColor: '#1f1f1f' }}>
        <div className="text-gray-600 text-xs">
          Mis à jour : {lastRefresh ? lastRefresh.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—'}
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-700">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full inline-block" style={{ background: '#22c55e' }} /> &gt; 2 semaines</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full inline-block" style={{ background: '#f59e0b' }} /> &lt; 2 semaines</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full inline-block" style={{ background: '#ef4444' }} /> &lt; 1 semaine</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full inline-block" style={{ background: '#7f1d1d' }} /> En retard</span>
        </div>
      </footer>
    </div>
  )
}
