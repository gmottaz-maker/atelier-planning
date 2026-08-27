import { useState, useEffect, useCallback } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { AL, C, FONT, MONO, R } from '../lib/theme'

const REFRESH_INTERVAL = 60 * 1000

// ─── Thèmes ────────────────────────────────────────────────────────────────

// L'écran mural est le cas d'école du système : sa profondeur vient
// entièrement de l'inversion de fond, jamais d'une ombre. Les deux thèmes
// partagent donc les mêmes jetons, avec les rôles échangés.
//
// Une contrainte propre à cet écran : il se lit à plusieurs mètres, dans un
// atelier. Le gris secondaire sur noir reste C.muted (≈6.1:1) — les alphas
// blancs plus faibles, lisibles sur un portable, disparaissent sur un mur.
const DARK = {
  bg:           AL.black,
  headerBg:     AL.black,
  headerBorder: 'rgba(255,255,255,.12)',
  cardBg:       'rgba(255,255,255,.05)',
  textPrimary:  AL.white,
  textSecondary:'rgba(255,255,255,.68)',
  textMuted:    C.muted,
  accent:       AL.white,
  gridLine:     'rgba(255,255,255,.12)',
  todayLine:    C.accent,
  todayBg:      'rgba(255,77,109,.10)',
  weekendBg:    'rgba(255,255,255,.03)',
  scrollbar:    'rgba(255,255,255,.2) rgba(255,255,255,.06)',
  toggleBg:     'rgba(255,255,255,.08)',
  btnBg:        'rgba(255,255,255,.08)',
  btnText:      C.muted,
  legendText:   C.muted,
  overdueBg:    'rgba(196,0,43,.22)',
  overdueBorder: C.danger,
}

const LIGHT = {
  bg:           AL.white,
  headerBg:     AL.white,
  headerBorder: C.border,
  cardBg:       AL.white,
  textPrimary:  AL.black,
  textSecondary:AL.black,
  textMuted:    C.muted,
  accent:       AL.black,
  gridLine:     C.border,
  todayLine:    C.accent,
  todayBg:      'rgba(255,77,109,.07)',
  weekendBg:    C.hover,
  scrollbar:    'rgba(12,12,12,.2) rgba(12,12,12,.06)',
  toggleBg:     C.neutralBg,
  btnBg:        C.neutralBg,
  btnText:      C.muted,
  legendText:   C.muted,
  overdueBg:    C.dangerBg,
  overdueBorder: C.danger,
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function getDaysRemaining(deadline) {
  if (!deadline) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(deadline)
  d.setHours(0, 0, 0, 0)
  return Math.ceil((d - today) / (1000 * 60 * 60 * 24))
}

// Feu d'échéance. Sur fond noir, un aplat sombre teinté ne se distingue plus à
// trois mètres : c'est la BORDURE colorée et le texte qui portent l'information,
// le fond restant une simple élévation neutre. En clair, l'inverse — le fond
// teinté suffit, la bordure s'efface.
function getAutoColor(deadline, dark) {
  const days = getDaysRemaining(deadline)
  const niveau =
    days === null ? { role: 'muted',   fg: C.muted }
    : days < 0    ? { role: 'danger',  fg: C.danger }
    : days < 7    ? { role: 'danger',  fg: C.danger }
    : days < 14   ? { role: 'warning', fg: C.warning }
    :               { role: 'success', fg: C.success }

  if (dark) {
    const fondSombre = {
      muted:   'rgba(255,255,255,.05)',
      danger:  'rgba(196,0,43,.22)',
      warning: 'rgba(166,99,0,.22)',
      success: 'rgba(27,122,90,.22)',
    }[niveau.role]
    // Texte clair : la couleur de rôle est trop sombre sur noir, on garde le
    // blanc pour le libellé et on laisse la bordure dire l'urgence.
    return { bg: fondSombre, border: niveau.fg, text: AL.white, badge: niveau.fg }
  }
  const fondClair = {
    muted: C.hover, danger: C.dangerBg, warning: C.warningBg, success: C.successBg,
  }[niveau.role]
  return { bg: fondClair, border: fondClair, text: niveau.fg, badge: niveau.fg }
}

function getProjectColors(project, dark) {
  if (!project.color_override) return getAutoColor(project.deadline, dark)
  const c = project.color_override
  return dark
    ? { bg: c + '18', border: c, text: AL.white, badge: c }
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


// ─── Timeline ─────────────────────────────────────────────────────────────

const COL_W = 130   // largeur colonne jour
const ROW_H = 84    // hauteur ligne projet
const LABEL_W = 340 // largeur colonne infos

function Timeline({ projects, viewMode, dark, theme }) {
  const numDays = viewMode === 'month' ? 28 : 14
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const days = Array.from({ length: numDays }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() + i)
    return d
  })

  const overdueProjects = projects.filter(p => { const d = getDaysRemaining(p.deadline); return d !== null && d < 0 })
  const visibleProjects = projects.filter(p => { const d = getDaysRemaining(p.deadline); return d !== null && d >= 0 })

  return (
    <div className="flex-1 overflow-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: theme.scrollbar }}>

      {/* Projets en retard */}
      {overdueProjects.length > 0 && (
        <div className="px-10 pt-6 pb-4">
          <div className="u-panel p-5 border" style={{ background: theme.overdueBg, borderColor: theme.overdueBorder }}>
            <div className="font-bold uppercase tracking-wider mb-4" style={{ color: C.danger, fontSize: 17 }}>⚠ En retard</div>
            <div className="flex flex-wrap gap-3">
              {overdueProjects.map(p => {
                const colors = getAutoColor(p.deadline, dark)
                return (
                  <div key={p.id} className="u-panel px-5 py-3.5 border" style={{ background: colors.bg, borderColor: colors.border }}>
                    <div className="font-bold" style={{ color: theme.textPrimary, fontSize: 18 }}>{p.client}</div>
                    <div className="mt-0.5" style={{ color: colors.text, fontSize: 15 }}>{p.name}</div>
                    <div className="mt-1" style={{ color: theme.textMuted, fontSize: 14 }}>Prévu: {formatDate(p.deadline)}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Gantt */}
      <div className="px-10 pt-8 pb-12" style={{ minWidth: numDays * COL_W + LABEL_W + 80 }}>

        {/* Header dates */}
        <div className="flex mb-5" style={{ paddingLeft: LABEL_W }}>
          {days.map((day, i) => {
            const isToday = isSameDay(day, today)
            const weekend = isWeekend(day)
            return (
              <div
                key={i}
                style={{
                  width: COL_W, flexShrink: 0,
                  borderBottomColor: isToday ? theme.accent : theme.gridLine,
                  borderBottomWidth: isToday ? 3 : 1,
                  borderBottomStyle: 'solid',
                  color: isToday ? theme.accent : weekend ? theme.textMuted : theme.textSecondary,
                  fontSize: 18,
                  fontWeight: isToday ? 700 : 500,
                  paddingBottom: 10,
                }}
                className="text-center"
              >
                {isToday ? '● Aujourd\'hui' : formatDayLabel(day)}
              </div>
            )
          })}
        </div>

        {/* Lignes */}
        {visibleProjects.length === 0 ? (
          <div className="text-center py-24" style={{ color: theme.textMuted, fontSize: 22 }}>
            Aucun projet à venir dans cette période
          </div>
        ) : (
          <div className="space-y-3">
            {visibleProjects.map(project => {
              const colors = getProjectColors(project, dark)
              const daysLeft = getDaysRemaining(project.deadline)
              const barDays = Math.min(daysLeft + 1, numDays)

              const desc = project.short_description
              return (
                <div key={project.id} className="flex items-stretch">
                  {/* Accent vertical lié à la barre (renfort visuel client ↔ description) */}
                  <div style={{ width: 4, flexShrink: 0, background: colors.badge, borderRadius: 2, marginRight: 16 }} />

                  {/* Infos */}
                  <div style={{ width: LABEL_W - 20, flexShrink: 0 }} className="pr-6 flex flex-col justify-center">
                    <div className="leading-tight truncate" style={{ color: theme.textPrimary, fontSize: 22, fontWeight: 700 }}>{project.client}</div>
                    <div className="mt-1 truncate" style={{ color: theme.textSecondary, fontSize: 17 }}>{project.name}</div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="font-bold" style={{ color: colors.badge, fontSize: 16 }}>
                        {daysLeft === 0 ? "Aujourd'hui !" : `J-${daysLeft}`}
                      </span>
                      {project.responsible && (
                        <span style={{ color: theme.textMuted, fontSize: 16 }}>· {project.responsible}</span>
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

                    {/* Barre colorée — description seule */}
                    <div
                      className="absolute u-panel flex items-center px-5 overflow-hidden"
                      style={{
                        top: 8, bottom: 8,
                        left: 0,
                        width: barDays * COL_W - 10,
                        backgroundColor: colors.bg,
                        border: `2px solid ${colors.border}`,
                      }}
                    >
                      <span className="font-medium truncate" style={{ color: colors.text, fontSize: 18 }}>
                        {desc || <span style={{ opacity: 0.5 }}>—</span>}
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
    { label: 'En retard',            color: C.danger, items: projects.filter(p => { const d = getDaysRemaining(p.deadline); return d !== null && d < 0 }) },
    { label: 'Cette semaine',        color: C.danger, items: projects.filter(p => { const d = getDaysRemaining(p.deadline); return d !== null && d >= 0 && d < 7 }) },
    { label: '2 prochaines semaines',color: C.warning, items: projects.filter(p => { const d = getDaysRemaining(p.deadline); return d !== null && d >= 7 && d < 14 }) },
    { label: 'Plus tard',            color: C.success, items: projects.filter(p => { const d = getDaysRemaining(p.deadline); return d !== null && d >= 14 }) },
    { label: 'Sans date',            color: C.muted, items: projects.filter(p => !p.deadline) },
  ].filter(g => g.items.length > 0)

  if (groups.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ color: theme.textMuted, fontSize: 24 }}>
        Aucun projet en cours
      </div>
    )
  }

  return (
    <div
      className="flex-1 overflow-auto p-10 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 content-start"
      style={{ scrollbarWidth: 'thin', scrollbarColor: theme.scrollbar }}
    >
      {groups.map(group => (
        <div key={group.label} className="space-y-5">
          <div className="font-bold uppercase tracking-widest" style={{ color: group.color, fontSize: 16 }}>
            {group.label}
          </div>
          {group.items.map(project => {
            const colors = getProjectColors(project, dark)
            const daysLeft = getDaysRemaining(project.deadline)
            return (
              <div
                key={project.id}
                className="u-panel p-7 border"
                style={{ backgroundColor: colors.bg, borderColor: colors.border }}
              >
                <div className="flex items-start justify-between mb-4 gap-3">
                  <div
                    className="font-bold px-4 py-1.5 u-pill"
                    style={{ background: colors.badge + '22', color: colors.badge, fontSize: 16 }}
                  >
                    {daysLeft === null ? 'Sans date' :
                     daysLeft < 0 ? `Retard ${Math.abs(daysLeft)}j` :
                     daysLeft === 0 ? "Aujourd'hui !" :
                     `J-${daysLeft}`}
                  </div>
                  {project.responsible && (
                    <div className="font-semibold" style={{ color: theme.textSecondary, fontSize: 16 }}>{project.responsible}</div>
                  )}
                </div>
                <div className="font-bold leading-tight" style={{ color: theme.textPrimary, fontSize: 26 }}>{project.client}</div>
                <div className="mt-1.5" style={{ color: theme.textSecondary, fontSize: 18 }}>{project.name}</div>
                {project.short_description && (
                  <div className="mt-2 leading-snug" style={{ color: theme.textMuted, fontSize: 15 }}>
                    {project.short_description}
                  </div>
                )}
                <div
                  className="mt-5 pt-4 border-t flex items-center justify-between"
                  style={{ borderColor: colors.border + '66' }}
                >
                  <span className="font-bold" style={{ color: colors.badge, fontSize: 19 }}>
                    {project.deadline ? formatDate(project.deadline) : '—'}
                  </span>
                  {project.delivery_type && (
                    <span style={{ color: theme.textMuted, fontSize: 15 }}>{project.delivery_type}</span>
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
      // DTO public réduit : cette page n'a pas de session (TV de l'atelier).
      const res = await fetch('/api/display-projects')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      const active = (Array.isArray(data) ? data : [])
        .sort((a, b) => {
          if (!a.deadline && !b.deadline) return 0
          if (!a.deadline) return 1
          if (!b.deadline) return -1
          return new Date(a.deadline) - new Date(b.deadline)
        })
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
        <style>{`body { font-family: ${FONT}; } * { transition: background-color .2s, border-color .2s, color .15s; }`}</style>
      </Head>

      {/* ── Header ── */}
      <header
        className="flex-shrink-0 px-10 py-6 border-b"
        style={{ background: theme.headerBg, borderColor: theme.headerBorder }}
      >
        <div className="flex items-center justify-between gap-8">

          {/* Gauche : heure + date */}
          <div className="flex items-baseline gap-6">
            <div className="font-semibold tabular-nums tracking-tight" style={{ color: theme.textPrimary, fontSize: 56, lineHeight: 1 }}>
              {timeLabel.slice(0, 5)}
            </div>
            <div className="capitalize" style={{ color: theme.textSecondary, fontSize: 22, fontWeight: 500 }}>
              {dateLabel}
            </div>
          </div>

          {/* Centre : compteur projets */}
          <div className="hidden md:flex items-baseline gap-3">
            <div className="font-semibold tabular-nums" style={{ color: theme.textPrimary, fontSize: 32, lineHeight: 1 }}>{projects.length}</div>
            <div style={{ color: theme.textMuted, fontSize: 18 }}>projet{projects.length !== 1 ? 's' : ''} actif{projects.length !== 1 ? 's' : ''}</div>
          </div>

          {/* Droite : contrôles */}
          <div className="flex items-center gap-3">

            {/* Sélecteur de vue */}
            <div className="flex u-panel p-1 gap-1" style={{ background: theme.toggleBg }}>
              {[
                { key: 'weeks', label: '2 sem.' },
                { key: 'month', label: 'Mois' },
                { key: 'cards', label: 'Cartes' },
              ].map(v => (
                <button
                  key={v.key}
                  onClick={() => setViewMode(v.key)}
                  className="px-4 py-2 u-pill font-semibold transition-all"
                  style={viewMode === v.key
                    ? { background: theme.accent, color: dark ? AL.black : AL.white, fontSize: 16 }
                    : { color: theme.btnText, background: 'transparent', fontSize: 16 }
                  }
                >
                  {v.label}
                </button>
              ))}
            </div>

            {/* Toggle jour/nuit */}
            <button
              onClick={toggleTheme}
              className="w-12 h-12 flex items-center justify-center u-panel transition-colors"
              style={{ background: theme.btnBg, color: theme.btnText, fontSize: 22 }}
              title={dark ? 'Passer en mode jour' : 'Passer en mode nuit'}
            >
              {dark ? '☀' : '☾'}
            </button>

            {/* Refresh */}
            <button
              onClick={fetchProjects}
              className="flex items-center gap-2 px-4 py-3 u-panel font-semibold transition-colors"
              style={{ background: theme.btnBg, color: theme.btnText, fontSize: 16 }}
              title="Actualiser maintenant"
            >
              <span>↻</span>
              <span className="tabular-nums">{countdown}s</span>
            </button>

            {/* Admin */}
            <Link
              href="/"
              className="w-12 h-12 flex items-center justify-center u-panel transition-colors"
              style={{ background: theme.btnBg, color: theme.btnText, fontSize: 20 }}
              title="Interface admin"
            >
              ⚙
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
            <div className="font-bold mb-2" style={{ color: theme.textPrimary, fontSize: 22 }}>Erreur de chargement</div>
            <div className="mb-6" style={{ color: theme.textSecondary, fontSize: 17 }}>{fetchError}</div>
            <button
              onClick={fetchProjects}
              className="px-6 py-3 u-panel font-semibold"
              style={{ background: theme.accent, color: dark ? AL.black : AL.white, fontSize: 16 }}
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
        className="flex-shrink-0 px-10 py-4 flex items-center justify-between border-t"
        style={{ background: theme.headerBg, borderColor: theme.headerBorder }}
      >
        <div style={{ color: theme.legendText, fontSize: 15 }}>
          Mis à jour : {lastRefresh ? lastRefresh.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—'}
        </div>
        <div className="flex items-center gap-6" style={{ color: theme.legendText, fontSize: 15 }}>
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 u-pill inline-block" style={{ background: C.success }} />
            &gt; 2 semaines
          </span>
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 u-pill inline-block" style={{ background: C.warning }} />
            &lt; 2 semaines
          </span>
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 u-pill inline-block" style={{ background: C.danger }} />
            &lt; 1 semaine
          </span>
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 u-pill inline-block" style={{ background: C.danger }} />
            En retard
          </span>
        </div>
      </footer>
    </div>
  )
}
