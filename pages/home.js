import { useState, useEffect, useRef } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useAuth } from './_app'

const PINK = '#FF4D6D'
const PERSON_COLORS = {
  Arnaud: '#3b82f6',
  Gabin: '#8b5cf6',
  Guillaume: PINK,
  'Sous-traitant': '#64748b',
}

const TARGET_CALS = ['Montage extérieur', 'Entretien', 'Production atelier', 'Visite et meeting']
const CAL_COLORS = {
  'Montage extérieur': '#3b82f6',
  'Entretien': '#22c55e',
  'Production atelier': '#f59e0b',
  'Visite et meeting': '#8b5cf6',
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function today() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function toDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
}

function isCompletedToday(task) {
  if (task.status !== 'completed' || !task.completed_at) return false
  return task.completed_at.split('T')[0] === toDateStr(today())
}

function endOfWeek() {
  const d = today()
  const day = d.getDay() || 7
  d.setDate(d.getDate() + (7 - day))
  return d
}

function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function fmtDate(str) {
  const [y, m, d] = str.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const t = toDateStr(today())
  if (str === t) return "Aujourd'hui"
  const tomorrow = toDateStr(addDays(today(), 1))
  if (str === tomorrow) return 'Demain'
  return dt.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}

function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

// ─── Task item ───────────────────────────────────────────────────────────────

function TaskItem({ task, onToggle, showPerson = false }) {
  const todayStr = toDateStr(today())
  const isLate = task.execution_date && task.execution_date < todayStr
  const completed = task.status === 'completed'

  return (
    <div className="flex items-center gap-3 py-2.5 border-b" style={{ borderColor: '#f3f4f6' }}>
      {/* Checkbox */}
      <button
        onClick={() => onToggle && onToggle(task)}
        className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all"
        style={{
          borderColor: completed ? '#22c55e' : '#d1d5db',
          background: completed ? '#22c55e' : 'white',
        }}
      >
        {completed && (
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>

      {/* Person dot */}
      <div className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: PERSON_COLORS[task.responsible] || '#ccc' }} />

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold leading-snug ${completed ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
          {task.title}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {task.projects?.name && (
            <p className="text-xs text-gray-400">{task.projects.name}</p>
          )}
          {showPerson && task.responsible && (
            <span className="text-xs font-medium px-1.5 py-0.5 rounded-full"
              style={{ background: (PERSON_COLORS[task.responsible] || '#ccc') + '22', color: PERSON_COLORS[task.responsible] || '#ccc' }}>
              {task.responsible}
            </span>
          )}
        </div>
      </div>

      {!completed && isLate && (
        <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
          style={{ background: '#fef2f2', color: '#ef4444' }}>
          retard
        </span>
      )}
      {!completed && !isLate && task.execution_date && task.execution_date !== todayStr && (
        <span className="text-xs text-gray-400 flex-shrink-0">
          {new Date(...task.execution_date.split('-').map((v,i)=>i===1?v-1:+v))
            .toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
        </span>
      )}
    </div>
  )
}

// ─── Calendar event ──────────────────────────────────────────────────────────

function CalEvent({ event, calName }) {
  const color = CAL_COLORS[calName] || '#64748b'
  const isAllDay = !event.start?.dateTime
  return (
    <div className="flex items-start gap-2.5 py-2 border-b" style={{ borderColor: '#f3f4f6' }}>
      <div className="w-1 self-stretch rounded-full flex-shrink-0"
        style={{ background: color, minHeight: '18px' }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 leading-snug">{event.summary || '(sans titre)'}</p>
        <div className="flex items-center flex-wrap gap-1.5 mt-0.5">
          <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
            style={{ background: color + '22', color }}>
            {calName}
          </span>
          {isAllDay
            ? <span className="text-xs text-gray-400">Journée entière</span>
            : <span className="text-xs text-gray-400">
                {fmtTime(event.start.dateTime)} – {fmtTime(event.end?.dateTime)}
              </span>
          }
          {event.location && (
            <span className="text-xs text-gray-400 truncate max-w-[160px]">📍 {event.location}</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Logo ────────────────────────────────────────────────────────────────────

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

// ─── Page ────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { user, signOut } = useAuth()
  const currentUser = user?.name || ''
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CALENDAR_CLIENT_ID

  const [tasks, setTasks] = useState([])
  const [tasksLoading, setTasksLoading] = useState(true)
  const [taskView, setTaskView] = useState('list') // 'list' | 'week'
  const [calEvents, setCalEvents] = useState([])
  const [calStatus, setCalStatus] = useState('idle')
  const [calError, setCalError] = useState('')
  const tokenClientRef = useRef(null)
  const gapiReadyRef = useRef(false)

  // ─── Load tasks ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) return
    fetch('/api/tasks', { headers: { 'x-actor': currentUser } })
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setTasks(d) })
      .catch(console.error)
      .finally(() => setTasksLoading(false))
  }, [currentUser])

  // ─── Toggle task completion ───────────────────────────────────────────────
  async function toggleTask(task) {
    const newStatus = task.status === 'completed' ? 'active' : 'completed'
    const now = new Date().toISOString()
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === task.id
      ? { ...t, status: newStatus, completed_at: newStatus === 'completed' ? now : null }
      : t
    ))
    try {
      const { projects: _p, ...taskData } = task
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-actor': currentUser },
        body: JSON.stringify({ ...taskData, status: newStatus, completed_at: newStatus === 'completed' ? now : null }),
      })
    } catch (err) {
      // Revert on error
      setTasks(prev => prev.map(t => t.id === task.id ? task : t))
      console.error(err)
    }
  }

  // ─── Task groups (list view) ──────────────────────────────────────────────
  const todayStr    = toDateStr(today())
  const weekEndStr  = toDateStr(endOfWeek())
  const myTasks     = tasks.filter(t =>
    t.responsible === currentUser &&
    (t.status === 'active' || isCompletedToday(t))
  )
  const todayTasks    = myTasks.filter(t => !t.execution_date || t.execution_date <= todayStr)
  const weekTasks     = myTasks.filter(t => t.execution_date > todayStr && t.execution_date <= weekEndStr)
  const upcomingTasks = myTasks.filter(t => t.execution_date > weekEndStr)

  // ─── Week view helpers ────────────────────────────────────────────────────
  const weekStart = (() => {
    const d = today()
    const dow = d.getDay() || 7
    return addDays(d, 1 - dow)
  })()
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  // All active tasks + completed today, for the whole team
  const allVisibleTasks = tasks.filter(t => t.status === 'active' || isCompletedToday(t))

  function tasksForDay(dayStr) {
    return allVisibleTasks.filter(t => {
      if (!t.execution_date) return false
      return t.execution_date === dayStr
    }).sort((a, b) => {
      // Current user first, then alphabetically
      if (a.responsible === currentUser && b.responsible !== currentUser) return -1
      if (b.responsible === currentUser && a.responsible !== currentUser) return 1
      return (a.responsible || '').localeCompare(b.responsible || '')
    })
  }

  // ─── Google Calendar helpers ──────────────────────────────────────────────
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return }
      const s = document.createElement('script')
      s.src = src; s.async = true; s.onload = resolve; s.onerror = reject
      document.head.appendChild(s)
    })
  }

  async function fetchWithToken(token) {
    setCalStatus('loading')
    try {
      if (!gapiReadyRef.current) {
        await new Promise((res, rej) => window.gapi.load('client', { callback: res, onerror: rej }))
        await window.gapi.client.init({})
        gapiReadyRef.current = true
      }
      window.gapi.client.setToken({ access_token: token })
      await window.gapi.client.load('https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest')

      const listRes = await window.gapi.client.calendar.calendarList.list({ maxResults: 100 })
      const allCals = listRes.result.items || []
      const matched = allCals.filter(c => TARGET_CALS.includes(c.summary))

      if (matched.length === 0) {
        const names = allCals.map(c => c.summary).join(', ')
        setCalError(`Aucun calendrier cible trouvé. Disponibles : ${names || '(aucun)'}`)
        setCalStatus('error')
        return
      }

      const timeMin = today().toISOString()
      const timeMax = addDays(today(), 14).toISOString()
      const all = []

      await Promise.all(matched.map(async cal => {
        const r = await window.gapi.client.calendar.events.list({
          calendarId: cal.id,
          timeMin, timeMax,
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 100,
        })
        ;(r.result.items || []).forEach(e => all.push({ calName: cal.summary, event: e }))
      }))

      all.sort((a, b) => {
        const da = a.event.start?.dateTime || a.event.start?.date || ''
        const db = b.event.start?.dateTime || b.event.start?.date || ''
        return da < db ? -1 : da > db ? 1 : 0
      })

      setCalEvents(all)
      setCalStatus('ok')
    } catch (err) {
      console.error(err)
      setCalError(err?.result?.error?.message || err?.message || 'Erreur inconnue')
      setCalStatus('error')
    }
  }

  async function connectCalendar() {
    if (!clientId) {
      setCalError('Variable NEXT_PUBLIC_GOOGLE_CALENDAR_CLIENT_ID manquante dans Vercel.')
      setCalStatus('error')
      return
    }
    setCalStatus('loading')
    try {
      await Promise.all([
        loadScript('https://apis.google.com/js/api.js'),
        loadScript('https://accounts.google.com/gsi/client'),
      ])
      tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/calendar.readonly',
        callback: async resp => {
          if (resp.error) {
            setCalError(resp.error_description || resp.error)
            setCalStatus('error')
            return
          }
          await fetchWithToken(resp.access_token)
        },
      })
      tokenClientRef.current.requestAccessToken({ prompt: '' })
    } catch (err) {
      setCalError(err?.message || 'Erreur de chargement')
      setCalStatus('error')
    }
  }

  // ─── Group calendar events by date ───────────────────────────────────────
  const eventsByDate = {}
  calEvents.forEach(({ calName, event }) => {
    const dateStr = event.start?.date || event.start?.dateTime?.split('T')[0]
    if (!dateStr) return
    if (!eventsByDate[dateStr]) eventsByDate[dateStr] = []
    eventsByDate[dateStr].push({ calName, event })
  })
  const eventDates = Object.keys(eventsByDate).sort()

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: '#fafafa', fontFamily: 'Inter, sans-serif' }}>
      <Head>
        <title>Accueil — Amazing Lab</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <style>{`
          * { -webkit-tap-highlight-color: transparent; }
          button, a { touch-action: manipulation; }
          body { padding-bottom: env(safe-area-inset-bottom); }
        `}</style>
      </Head>

      {/* ── Header ── */}
      <header className="sticky top-0 z-10 bg-white border-b" style={{ borderColor: '#f0f0f0' }}>
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Logo />
            <span className="font-bold text-gray-900 text-sm">accueil</span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/tasks" title="Tâches" className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 text-gray-400 hover:border-gray-400 transition-colors text-base">✅</Link>
            <Link href="/" title="Projets" className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 text-gray-400 hover:border-gray-400 transition-colors text-base">🗂️</Link>
            <Link href="/activity" title="Activité" className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 text-gray-400 hover:border-gray-400 transition-colors text-base">📊</Link>
            <Link href="/settings" title="Paramètres" className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 text-gray-400 hover:border-gray-400 transition-colors text-base">⚙️</Link>
            <button
              onClick={() => signOut()}
              className="px-3 py-1.5 rounded-full text-xs font-semibold text-white"
              style={{ background: PERSON_COLORS[currentUser] || PINK }}>
              {currentUser}
            </button>
          </div>
        </div>
      </header>

      {/* ── Two-column layout ── */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

          {/* ══ LEFT: tasks ══ */}
          <div>
            {/* Header + view toggle */}
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-gray-900">
                {taskView === 'list' ? 'Mes tâches' : 'Semaine'}
              </h2>
              <div className="flex items-center rounded-full border border-gray-200 overflow-hidden text-xs font-semibold">
                <button
                  onClick={() => setTaskView('list')}
                  className="px-3 py-1.5 transition-colors"
                  style={{
                    background: taskView === 'list' ? '#111' : 'white',
                    color: taskView === 'list' ? 'white' : '#6b7280',
                  }}>
                  Liste
                </button>
                <button
                  onClick={() => setTaskView('week')}
                  className="px-3 py-1.5 transition-colors"
                  style={{
                    background: taskView === 'week' ? '#111' : 'white',
                    color: taskView === 'week' ? 'white' : '#6b7280',
                  }}>
                  Semaine
                </button>
              </div>
            </div>

            {tasksLoading && (
              <div className="flex items-center justify-center py-12">
                <div className="w-5 h-5 rounded-full border-2 animate-spin"
                  style={{ borderColor: '#e5e7eb', borderTopColor: PINK }} />
              </div>
            )}

            {/* ── LIST VIEW ── */}
            {!tasksLoading && taskView === 'list' && (
              <>
                {/* Today */}
                <section className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Aujourd'hui</span>
                    {todayTasks.filter(t => t.status === 'active').length > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full text-xs font-bold text-white"
                        style={{ background: PINK }}>
                        {todayTasks.filter(t => t.status === 'active').length}
                      </span>
                    )}
                  </div>
                  {todayTasks.length === 0
                    ? <p className="text-sm text-gray-400 py-1">Rien pour aujourd'hui 🎉</p>
                    : todayTasks.map(t => <TaskItem key={t.id} task={t} onToggle={toggleTask} />)
                  }
                </section>

                {/* This week */}
                {weekTasks.length > 0 && (
                  <section className="mb-6">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Cette semaine</span>
                      <span className="px-1.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">
                        {weekTasks.filter(t => t.status === 'active').length}
                      </span>
                    </div>
                    {weekTasks.map(t => <TaskItem key={t.id} task={t} onToggle={toggleTask} />)}
                  </section>
                )}

                {/* Upcoming */}
                {upcomingTasks.length > 0 && (
                  <section className="mb-6">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Prochainement</span>
                      <span className="px-1.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">
                        {upcomingTasks.length}
                      </span>
                    </div>
                    {upcomingTasks.map(t => <TaskItem key={t.id} task={t} onToggle={toggleTask} />)}
                  </section>
                )}

                {myTasks.length === 0 && (
                  <p className="text-sm text-gray-400">Aucune tâche assignée.</p>
                )}
              </>
            )}

            {/* ── WEEK VIEW ── */}
            {!tasksLoading && taskView === 'week' && (
              <div>
                {weekDays.map(day => {
                  const dayStr = toDateStr(day)
                  const dayTasks = tasksForDay(dayStr)
                  const isToday = dayStr === todayStr
                  const isPast = dayStr < todayStr
                  const isWeekend = day.getDay() === 0 || day.getDay() === 6
                  const dayLabel = day.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })

                  return (
                    <div key={dayStr} className="mb-4">
                      {/* Day header */}
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className="text-xs font-bold uppercase tracking-wider capitalize"
                          style={{ color: isToday ? PINK : isPast ? '#d1d5db' : isWeekend ? '#9ca3af' : '#6b7280' }}>
                          {dayLabel}
                        </span>
                        {isToday && (
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: PINK }} />
                        )}
                        {dayTasks.length > 0 && (
                          <span className="text-xs text-gray-400">{dayTasks.filter(t => t.status === 'active').length} tâche{dayTasks.filter(t => t.status === 'active').length > 1 ? 's' : ''}</span>
                        )}
                      </div>

                      {/* Tasks for this day */}
                      <div className={`rounded-xl border ${isToday ? '' : 'border-gray-100'}`}
                        style={{ borderColor: isToday ? PINK + '33' : undefined, background: isToday ? PINK + '05' : undefined }}>
                        {dayTasks.length === 0 ? (
                          <p className="text-xs text-gray-300 px-3 py-2">—</p>
                        ) : (
                          <div className="px-3">
                            {dayTasks.map(t => (
                              <TaskItem key={t.id} task={t} onToggle={toggleTask} showPerson={true} />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ══ RIGHT: Google Calendar ══ */}
          <div>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-gray-900">Agenda</h2>
              <div className="flex items-center gap-2">
                {(calStatus === 'idle' || calStatus === 'error') && (
                  <button onClick={connectCalendar}
                    className="text-xs font-semibold px-3 py-1.5 rounded-full text-white transition-opacity hover:opacity-90"
                    style={{ background: '#4285f4' }}>
                    {calStatus === 'error' ? 'Réessayer' : 'Connecter'}
                  </button>
                )}
                {calStatus === 'ok' && (
                  <button onClick={connectCalendar}
                    className="text-xs text-gray-400 px-2 py-1 rounded-full border border-gray-200 hover:border-gray-400">
                    ↻ Actualiser
                  </button>
                )}
              </div>
            </div>

            {calStatus !== 'idle' && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {TARGET_CALS.map(c => (
                  <span key={c} className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: CAL_COLORS[c] + '22', color: CAL_COLORS[c] }}>
                    {c}
                  </span>
                ))}
              </div>
            )}

            {calStatus === 'idle' && (
              <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center">
                <div className="text-3xl mb-2">📅</div>
                <p className="text-sm font-medium text-gray-500">Connectez Google Calendar</p>
                <p className="text-xs text-gray-400 mt-1">pour afficher vos événements des 14 prochains jours</p>
                <button onClick={connectCalendar}
                  className="mt-4 text-xs font-semibold px-4 py-2 rounded-full text-white"
                  style={{ background: '#4285f4' }}>
                  Connecter Google Calendar
                </button>
              </div>
            )}

            {calStatus === 'loading' && (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 rounded-full border-2 animate-spin"
                  style={{ borderColor: '#e5e7eb', borderTopColor: '#4285f4' }} />
              </div>
            )}

            {calStatus === 'error' && (
              <div className="rounded-2xl bg-red-50 border border-red-100 p-4 text-sm text-red-600 mb-4">
                <p className="font-semibold mb-1">Erreur de connexion</p>
                <p className="text-xs">{calError}</p>
                {!clientId && (
                  <p className="mt-2 text-xs text-red-400">
                    Ajoutez <code className="bg-red-100 px-1 rounded font-mono">NEXT_PUBLIC_GOOGLE_CALENDAR_CLIENT_ID</code> dans vos variables Vercel.
                  </p>
                )}
              </div>
            )}

            {calStatus === 'ok' && eventDates.length === 0 && (
              <p className="text-sm text-gray-400 py-4">Aucun événement dans les 14 prochains jours.</p>
            )}

            {calStatus === 'ok' && eventDates.map(dateStr => (
              <div key={dateStr} className="mb-5">
                <p className="text-xs font-bold uppercase tracking-wider mb-2 capitalize"
                  style={{ color: dateStr === todayStr ? PINK : '#9ca3af' }}>
                  {fmtDate(dateStr)}
                </p>
                {eventsByDate[dateStr].map(({ calName, event }) => (
                  <CalEvent key={event.id} event={event} calName={calName} />
                ))}
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  )
}
