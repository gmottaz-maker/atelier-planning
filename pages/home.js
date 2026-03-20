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

function TaskItem({ task }) {
  const todayStr = toDateStr(today())
  const isLate = task.execution_date < todayStr
  return (
    <div className="flex items-start gap-3 py-2.5 border-b" style={{ borderColor: '#f3f4f6' }}>
      <div className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0"
        style={{ background: PERSON_COLORS[task.responsible] || '#ccc' }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 leading-snug">{task.title}</p>
        {task.projects?.name && (
          <p className="text-xs text-gray-400 mt-0.5">{task.projects.name}</p>
        )}
      </div>
      {isLate && (
        <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
          style={{ background: '#fef2f2', color: '#ef4444' }}>
          retard
        </span>
      )}
      {!isLate && task.execution_date && task.execution_date !== todayStr && (
        <span className="text-xs text-gray-400 flex-shrink-0">
          {new Date(...task.execution_date.split('-').map((v,i)=>i===1?v-1:+v)).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
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
  const [calEvents, setCalEvents] = useState([]) // [{ calName, event }]
  const [calStatus, setCalStatus] = useState('idle') // idle | loading | error | ok
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

  // ─── Task groups ─────────────────────────────────────────────────────────
  const todayStr    = toDateStr(today())
  const weekEndStr  = toDateStr(endOfWeek())
  const myTasks     = tasks.filter(t => t.responsible === currentUser && t.status === 'active')
  const todayTasks  = myTasks.filter(t => t.execution_date <= todayStr)
  const weekTasks   = myTasks.filter(t => t.execution_date > todayStr && t.execution_date <= weekEndStr)
  const upcomingTasks = myTasks.filter(t => !t.execution_date || t.execution_date > weekEndStr)

  // ─── Google Calendar helpers ─────────────────────────────────────────────
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

      // List calendars
      const listRes = await window.gapi.client.calendar.calendarList.list({ maxResults: 100 })
      const allCals = listRes.result.items || []
      const matched = allCals.filter(c => TARGET_CALS.includes(c.summary))

      if (matched.length === 0) {
        const names = allCals.map(c => c.summary).join(', ')
        setCalError(`Aucun des calendriers cibles trouvé. Calendriers disponibles : ${names || '(aucun)'}`)
        setCalStatus('error')
        return
      }

      // Fetch events (today → +14 days)
      const timeMin = today().toISOString()
      const timeMax = addDays(today(), 14).toISOString()
      const all = []

      await Promise.all(matched.map(async cal => {
        const r = await window.gapi.client.calendar.events.list({
          calendarId: cal.id,
          timeMin,
          timeMax,
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 100,
        })
        ;(r.result.items || []).forEach(e => all.push({ calName: cal.summary, event: e }))
      }))

      // Sort chronologically
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
      // prompt:'' = silent if already granted, shows consent only first time
      tokenClientRef.current.requestAccessToken({ prompt: '' })
    } catch (err) {
      setCalError(err?.message || 'Erreur de chargement')
      setCalStatus('error')
    }
  }

  // ─── Group events by date ────────────────────────────────────────────────
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
            <Link href="/tasks"
              className="text-xs text-gray-400 px-2 py-1 rounded-full border border-gray-200 hover:border-gray-400 transition-colors">
              Tâches
            </Link>
            <Link href="/"
              className="text-xs text-gray-400 px-2 py-1 rounded-full border border-gray-200 hover:border-gray-400 transition-colors">
              Projets
            </Link>
            <Link href="/activity"
              className="text-xs text-gray-400 px-2 py-1 rounded-full border border-gray-200 hover:border-gray-400 transition-colors hidden sm:block">
              Activité
            </Link>
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

          {/* ══ LEFT: personal tasks ══ */}
          <div>
            <h2 className="text-base font-bold text-gray-900 mb-5">Mes tâches</h2>

            {tasksLoading && (
              <div className="flex items-center justify-center py-12">
                <div className="w-5 h-5 rounded-full border-2 animate-spin"
                  style={{ borderColor: '#e5e7eb', borderTopColor: PINK }} />
              </div>
            )}

            {!tasksLoading && (
              <>
                {/* Today */}
                <section className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Aujourd'hui</span>
                    {todayTasks.length > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full text-xs font-bold text-white"
                        style={{ background: PINK }}>{todayTasks.length}</span>
                    )}
                  </div>
                  {todayTasks.length === 0
                    ? <p className="text-sm text-gray-400 py-1">Rien pour aujourd'hui 🎉</p>
                    : todayTasks.map(t => <TaskItem key={t.id} task={t} />)
                  }
                </section>

                {/* This week */}
                {weekTasks.length > 0 && (
                  <section className="mb-6">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Cette semaine</span>
                      <span className="px-1.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">
                        {weekTasks.length}
                      </span>
                    </div>
                    {weekTasks.map(t => <TaskItem key={t.id} task={t} />)}
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
                    {upcomingTasks.map(t => <TaskItem key={t.id} task={t} />)}
                  </section>
                )}

                {myTasks.length === 0 && !tasksLoading && (
                  <p className="text-sm text-gray-400">Aucune tâche assignée.</p>
                )}
              </>
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

            {/* Calendar legend */}
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

            {/* Idle state */}
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

            {/* Loading */}
            {calStatus === 'loading' && (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 rounded-full border-2 animate-spin"
                  style={{ borderColor: '#e5e7eb', borderTopColor: '#4285f4' }} />
              </div>
            )}

            {/* Error */}
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

            {/* No events */}
            {calStatus === 'ok' && eventDates.length === 0 && (
              <p className="text-sm text-gray-400 py-4">Aucun événement dans les 14 prochains jours.</p>
            )}

            {/* Events grouped by day */}
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
