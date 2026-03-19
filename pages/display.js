import { useState, useEffect, useCallback } from 'react'
import Head from 'next/head'
import Link from 'next/link'

const REFRESH_INTERVAL = 60 * 1000 // 60 secondes

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
  if (days < 0)  return { bg: '#7f1d1d', border: '#991b1b', text: '#fca5a5', badge: '#dc2626' }
  if (days < 7)  return { bg: '#450a0a', border: '#ef4444', text: '#fca5a5', badge: '#ef4444' }
  if (days < 14) return { bg: '#431407', border: '#f59e0b', text: '#fcd34d', badge: '#f59e0b' }
  return          { bg: '#052e16', border: '#22c55e', text: '#86efac', badge: '#22c55e' }
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r}, ${g}, ${b}`
}

function getProjectColors(project) {
  if (!project.color_override) return getAutoColor(project.deadline)
  const c = project.color_override
  return { bg: c + '22', border: c, text: '#ffffff', badge: c }
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

  // Séparer projets dans la fenêtre vs en retard
  const overdueProjects = projects.filter(p => getDaysRemaining(p.deadline) < 0)
  const visibleProjects = projects.filter(p => getDaysRemaining(p.deadline) >= 0)

  return (
    <div className="flex-1 overflow-auto dark-scroll">

      {/* Projets en retard */}
      {overdueProjects.length > 0 && (
        <div className="px-4 pt-4 pb-2">
          <div className="bg-red-950 border border-red-800 rounded-xl p-3">
            <div className="text-red-400 text-xs font-bold uppercase tracking-wider mb-2">⚠ En retard</div>
            <div className="flex flex-wrap gap-2">
              {overdueProjects.map(p => (
                <div key={p.id} className="bg-red-900 border border-red-700 rounded-lg px-3 py-1.5">
                  <div className="text-red-200 text-sm font-bold">{p.client}</div>
                  <div className="text-red-300 text-xs">{p.name}</div>
                  <div className="text-red-400 text-xs">Prévu: {formatDate(p.deadline)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Timeline Gantt */}
      <div className="px-4 pt-3 pb-6" style={{ minWidth: numDays * 80 + 220 }}>

        {/* Header dates */}
        <div className="flex mb-2" style={{ paddingLeft: 220 }}>
          {days.map((day, i) => {
            const isToday = isSameDay(day, today)
            const weekend = isWeekend(day)
            return (
              <div
                key={i}
                style={{ width: 80, flexShrink: 0 }}
                className={`text-center text-xs pb-1 border-b ${
                  isToday
                    ? 'text-yellow-400 font-bold border-yellow-400'
                    : weekend
                    ? 'text-gray-600 border-gray-700'
                    : 'text-gray-400 border-gray-700'
                }`}
              >
                {isToday ? '📍 Auj.' : formatDayLabel(day)}
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
              const barDays = Math.min(daysLeft + 1, numDays) // +1 pour inclure le jour J

              return (
                <div key={project.id} className="flex items-center">
                  {/* Infos projet (colonne gauche fixe) */}
                  <div
                    style={{ width: 220, flexShrink: 0 }}
                    className="pr-3"
                  >
                    <div className="text-white text-sm font-bold leading-tight truncate">{project.client}</div>
                    <div className="text-gray-400 text-xs truncate">{project.name}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs" style={{ color: colors.badge }}>
                        {daysLeft === 0 ? 'Aujourd\'hui !' : `J-${daysLeft}`}
                      </span>
                      {project.responsible && (
                        <span className="text-gray-600 text-xs">· {project.responsible}</span>
                      )}
                    </div>
                  </div>

                  {/* Barre de progression */}
                  <div className="flex-1 relative h-10">
                    {/* Grille en fond */}
                    <div className="absolute inset-0 flex">
                      {days.map((day, i) => (
                        <div
                          key={i}
                          style={{ width: 80, flexShrink: 0 }}
                          className={`h-full border-r ${
                            isSameDay(day, today)
                              ? 'border-yellow-500 bg-yellow-900/10'
                              : isWeekend(day)
                              ? 'border-gray-800 bg-gray-900/50'
                              : 'border-gray-800'
                          }`}
                        />
                      ))}
                    </div>

                    {/* Barre colorée */}
                    <div
                      className="absolute top-1 bottom-1 rounded-lg flex items-center px-3 overflow-hidden"
                      style={{
                        left: 0,
                        width: barDays * 80 - 4,
                        backgroundColor: colors.bg,
                        border: `1px solid ${colors.border}`,
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="text-xs font-semibold truncate"
                          style={{ color: colors.text }}
                        >
                          {project.delivery_type && `🚚 ${project.delivery_type}`}
                          {project.description && ` · ${project.description}`}
                        </span>
                      </div>
                      {/* Badge deadline à droite de la barre */}
                      <span
                        className="ml-auto text-xs font-bold flex-shrink-0"
                        style={{ color: colors.badge }}
                      >
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
    { label: 'En retard', color: 'red', items: projects.filter(p => getDaysRemaining(p.deadline) < 0) },
    { label: 'Cette semaine', color: 'red', items: projects.filter(p => { const d = getDaysRemaining(p.deadline); return d >= 0 && d < 7 }) },
    { label: '2 prochaines semaines', color: 'orange', items: projects.filter(p => { const d = getDaysRemaining(p.deadline); return d >= 7 && d < 14 }) },
    { label: 'Plus tard', color: 'green', items: projects.filter(p => getDaysRemaining(p.deadline) >= 14) },
  ].filter(g => g.items.length > 0)

  if (groups.every(g => g.items.length === 0)) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-600 text-lg">
        Aucun projet en cours
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto dark-scroll p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 content-start">
      {groups.map(group => (
        <div key={group.label} className="space-y-3">
          <div className={`text-xs font-bold uppercase tracking-wider ${
            group.color === 'red' ? 'text-red-500' :
            group.color === 'orange' ? 'text-orange-400' :
            'text-green-500'
          }`}>
            {group.label}
          </div>
          {group.items.map(project => {
            const colors = getProjectColors(project)
            const daysLeft = getDaysRemaining(project.deadline)
            return (
              <div
                key={project.id}
                className="rounded-xl p-4 border"
                style={{ backgroundColor: colors.bg, borderColor: colors.border }}
              >
                <div className="flex items-start justify-between mb-2">
                  <div
                    className="text-xs font-bold px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: colors.badge + '33', color: colors.badge }}
                  >
                    {daysLeft < 0 ? `En retard de ${Math.abs(daysLeft)}j` :
                     daysLeft === 0 ? 'Aujourd\'hui !' :
                     `J-${daysLeft}`}
                  </div>
                  <div className="text-xs text-gray-400">{project.responsible}</div>
                </div>
                <div className="text-white font-bold text-base leading-tight">{project.client}</div>
                <div className="text-gray-300 text-sm mt-0.5">{project.name}</div>
                {project.description && (
                  <div className="text-gray-500 text-xs mt-1">{project.description}</div>
                )}
                <div className="mt-3 pt-3 border-t border-gray-700 flex items-center justify-between">
                  <span style={{ color: colors.badge }} className="text-sm font-bold">
                    📅 {formatDate(project.deadline)}
                  </span>
                  {project.delivery_type && (
                    <span className="text-gray-500 text-xs">{project.delivery_type}</span>
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
  const [viewMode, setViewMode] = useState('weeks')   // 'weeks' | 'month' | 'cards'
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

  // Chargement initial
  useEffect(() => { fetchProjects() }, [fetchProjects])

  // Auto-refresh data
  useEffect(() => {
    const interval = setInterval(fetchProjects, REFRESH_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchProjects])

  // Horloge + countdown
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
    <div className="h-screen flex flex-col bg-gray-950 text-white overflow-hidden">
      <Head>
        <title>Atelier — Planning</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      {/* Header */}
      <header className="flex-shrink-0 bg-gray-900 border-b border-gray-800 px-6 py-3">
        <div className="flex items-center justify-between">

          {/* Date & heure */}
          <div className="flex items-center gap-6">
            <div>
              <div className="text-yellow-400 font-bold text-xl tabular-nums">{timeLabel}</div>
              <div className="text-gray-400 text-sm capitalize">{dateLabel}</div>
            </div>
            <div className="hidden md:flex items-center gap-2">
              <div className="w-px h-8 bg-gray-700" />
              <div className="text-center">
                <div className="text-2xl font-bold text-white">{projects.length}</div>
                <div className="text-gray-500 text-xs">projet{projects.length !== 1 ? 's' : ''}</div>
              </div>
            </div>
          </div>

          {/* Titre */}
          <div className="text-center hidden md:block">
            <div className="text-white font-bold text-lg tracking-tight">PLANNING ATELIER</div>
          </div>

          {/* Contrôles */}
          <div className="flex items-center gap-2">
            {/* Toggle vue */}
            <div className="flex bg-gray-800 rounded-lg p-1 gap-1">
              {[
                { key: 'weeks', label: '2 sem.' },
                { key: 'month', label: 'Mois' },
                { key: 'cards', label: 'Cartes' },
              ].map(v => (
                <button
                  key={v.key}
                  onClick={() => setViewMode(v.key)}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                    viewMode === v.key
                      ? 'bg-yellow-500 text-gray-900'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>

            {/* Refresh manuel */}
            <button
              onClick={fetchProjects}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-400 hover:text-white transition-colors"
              title="Actualiser maintenant"
            >
              <span>↻</span>
              <span className="text-xs tabular-nums">{countdown}s</span>
            </button>

            {/* Lien admin */}
            <Link
              href="/"
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-400 hover:text-white transition-colors"
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
          <div className="text-gray-500 text-lg">Chargement...</div>
        </div>
      ) : viewMode === 'cards' ? (
        <CardView projects={projects} />
      ) : (
        <Timeline projects={projects} viewMode={viewMode} />
      )}

      {/* Footer */}
      <footer className="flex-shrink-0 bg-gray-900 border-t border-gray-800 px-6 py-2 flex items-center justify-between">
        <div className="text-gray-600 text-xs">
          Mis à jour : {lastRefresh ? lastRefresh.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—'}
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-700">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> &gt; 2 semaines</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" /> &lt; 2 semaines</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> &lt; 1 semaine</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-900 inline-block" /> En retard</span>
        </div>
      </footer>
    </div>
  )
}
