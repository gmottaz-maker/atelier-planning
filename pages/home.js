import { useState, useEffect, useRef } from 'react'
import useSWR from 'swr'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useAuth } from './_app'
import { C, FONT, MONO, CAL_CAT } from '../lib/theme'

const TARGET_CALS = ['Montage extérieur', 'Entretien', 'Production atelier', 'Visite et meeting']

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
function fmtDayLabel(str) {
  const [y, m, d] = str.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const t = toDateStr(today())
  if (str === t) return "AUJOURD'HUI"
  if (str === toDateStr(addDays(today(), 1))) return 'DEMAIN'
  return dt.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()
}
function fmtTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}
function fmtShortDate(str) {
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

// ─── Task row (11a) ───────────────────────────────────────────────────────────

function TaskRow({ task, onToggle, last }) {
  const todayStr = toDateStr(today())
  const isLate = task.execution_date && task.execution_date < todayStr
  const completed = task.status === 'completed'
  const dot = task.projects?.color_override || C.ink

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 2px', borderBottom: last ? 'none' : `1px solid ${C.divider}` }}>
      <button onClick={() => onToggle && onToggle(task)} aria-label="Basculer la tâche"
        style={{
          width: 17, height: 17, borderRadius: '50%', flex: 'none', cursor: 'pointer', padding: 0,
          border: completed ? 'none' : `2px solid ${C.faintBorder}`,
          background: completed ? C.success : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 9,
        }}>
        {completed && '✓'}
      </button>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flex: 'none' }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: completed ? C.muted : C.ink, textDecoration: completed ? 'line-through' : 'none' }}>{task.title}</span>
        {task.projects?.name && (
          <span style={{ fontSize: 11.5, color: completed ? C.faintChevron : C.muted }}>{task.projects.name}</span>
        )}
      </div>
      {!completed && isLate && (
        <span style={{ font: `10px ${MONO}`, color: C.danger, background: C.dangerBg, padding: '2px 8px', borderRadius: 99, flex: 'none' }}>RETARD</span>
      )}
      {!completed && !isLate && task.execution_date && task.execution_date !== todayStr && (
        <span style={{ font: `10.5px ${MONO}`, color: C.muted, flex: 'none' }}>{fmtShortDate(task.execution_date)}</span>
      )}
    </div>
  )
}

function GroupHeader({ label, count, accent }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
      <span style={{ font: `500 10px ${MONO}`, letterSpacing: '.12em', color: C.muted }}>{label}</span>
      {count != null && count > 0 && (
        <span style={{ font: `600 10px ${MONO}`, background: accent ? C.ink : C.divider, color: accent ? '#fff' : C.inkSecondary, padding: '1px 7px', borderRadius: 99 }}>{count}</span>
      )}
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { user } = useAuth()
  const router = useRouter()
  const currentUser = user?.name || ''
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CALENDAR_CLIENT_ID

  const { data: tasks = [], isLoading, mutate: mutateTasks } = useSWR('/api/tasks')
  const tasksLoading = isLoading && tasks.length === 0
  const [taskView, setTaskView] = useState('list')
  const [calEvents, setCalEvents] = useState([])
  const [calStatus, setCalStatus] = useState('idle')
  const [calError, setCalError] = useState('')
  const tokenClientRef = useRef(null)
  const gapiReadyRef = useRef(false)

  // ─── Toggle task completion ───────────────────────────────────────────────
  async function toggleTask(task) {
    const newStatus = task.status === 'completed' ? 'active' : 'completed'
    const now = new Date().toISOString()
    const optimistic = tasks.map(t => t.id === task.id
      ? { ...t, status: newStatus, completed_at: newStatus === 'completed' ? now : null }
      : t
    )
    mutateTasks(optimistic, false)
    try {
      const { projects: _p, ...taskData } = task
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...taskData, status: newStatus, completed_at: newStatus === 'completed' ? now : null }),
      })
      mutateTasks()
    } catch (err) {
      mutateTasks()
      console.error(err)
    }
  }

  // ─── Task groups ──────────────────────────────────────────────────────────
  const todayStr    = toDateStr(today())
  const weekEndStr  = toDateStr(endOfWeek())
  const myTasks     = tasks.filter(t => t.responsible === currentUser && (t.status === 'active' || isCompletedToday(t)))
  const todayTasks    = myTasks.filter(t => !t.execution_date || t.execution_date <= todayStr)
  const weekTasks     = myTasks.filter(t => t.execution_date > todayStr && t.execution_date <= weekEndStr)
  const upcomingTasks = myTasks.filter(t => t.execution_date > weekEndStr)
  const todayActiveCount = todayTasks.filter(t => t.status === 'active').length

  // ─── Week view ────────────────────────────────────────────────────────────
  const weekStart = (() => {
    const d = today(); const dow = d.getDay() || 7; return addDays(d, 1 - dow)
  })()
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const allVisibleTasks = tasks.filter(t => t.status === 'active' || isCompletedToday(t))
  function tasksForDay(dayStr) {
    return allVisibleTasks.filter(t => t.execution_date === dayStr).sort((a, b) => {
      if (a.responsible === currentUser && b.responsible !== currentUser) return -1
      if (b.responsible === currentUser && a.responsible !== currentUser) return 1
      return (a.responsible || '').localeCompare(b.responsible || '')
    })
  }

  // ─── Google Calendar ──────────────────────────────────────────────────────
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
        setCalError(`Aucun calendrier cible trouvé. Disponibles : ${allCals.map(c => c.summary).join(', ') || '(aucun)'}`)
        setCalStatus('error'); return
      }
      const timeMin = today().toISOString()
      const timeMax = addDays(today(), 14).toISOString()
      const all = []
      await Promise.all(matched.map(async cal => {
        const r = await window.gapi.client.calendar.events.list({ calendarId: cal.id, timeMin, timeMax, singleEvents: true, orderBy: 'startTime', maxResults: 100 })
        ;(r.result.items || []).forEach(e => all.push({ calName: cal.summary, event: e }))
      }))
      all.sort((a, b) => {
        const da = a.event.start?.dateTime || a.event.start?.date || ''
        const db = b.event.start?.dateTime || b.event.start?.date || ''
        return da < db ? -1 : da > db ? 1 : 0
      })
      setCalEvents(all); setCalStatus('ok')
    } catch (err) {
      console.error(err)
      setCalError(err?.result?.error?.message || err?.message || 'Erreur inconnue')
      setCalStatus('error')
    }
  }
  async function connectCalendar() {
    if (!clientId) { setCalError('Variable NEXT_PUBLIC_GOOGLE_CALENDAR_CLIENT_ID manquante dans Vercel.'); setCalStatus('error'); return }
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
          if (resp.error) { setCalError(resp.error_description || resp.error); setCalStatus('error'); return }
          await fetchWithToken(resp.access_token)
        },
      })
      tokenClientRef.current.requestAccessToken({ prompt: '' })
    } catch (err) {
      setCalError(err?.message || 'Erreur de chargement'); setCalStatus('error')
    }
  }

  // ─── Group events by date ─────────────────────────────────────────────────
  const eventsByDate = {}
  calEvents.forEach(({ calName, event }) => {
    const dateStr = event.start?.date || event.start?.dateTime?.split('T')[0]
    if (!dateStr) return
    ;(eventsByDate[dateStr] ||= []).push({ calName, event })
  })
  const eventDates = Object.keys(eventsByDate).sort()
  const eventsTodayCount = eventsByDate[todayStr]?.length || 0

  // ─── Header subline ───────────────────────────────────────────────────────
  const now = today()
  const wd = now.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '').toUpperCase()
  const subline = `${wd} ${String(now.getDate()).padStart(2,'0')}.${String(now.getMonth()+1).padStart(2,'0')} — ${todayActiveCount} TÂCHE${todayActiveCount > 1 ? 'S' : ''} AUJOURD'HUI / ${eventsTodayCount} ÉVÉNEMENT${eventsTodayCount > 1 ? 'S' : ''}`

  const segStyle = (active) => ({
    padding: '5px 14px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
    background: active ? C.ink : C.surface, color: active ? '#fff' : C.inkSecondary,
    border: 'none', fontFamily: FONT,
  })

  return (
    <div style={{ minHeight: '100vh', background: C.pageBg, fontFamily: FONT, color: C.ink }}>
      <Head>
        <title>Accueil — Maze Project</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>

      <div style={{ padding: '26px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, borderBottom: `1px solid ${C.border}`, paddingBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 23, fontWeight: 700, letterSpacing: '-.4px' }}>Bonjour {currentUser || ''}</span>
            <span style={{ font: `11.5px ${MONO}`, color: C.muted }}>{subline}</span>
          </div>
          <div style={{ flex: 1 }} />
          <button onClick={() => router.push('/tasks')}
            style={{ border: `1px solid ${C.ink}`, background: C.ink, color: C.accentOnDark, font: `600 12.5px ${FONT}`, padding: '9px 16px', borderRadius: 5, cursor: 'pointer' }}>
            + NOUVELLE TÂCHE
          </button>
        </div>

        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {/* ══ Colonne gauche : Mes tâches ══ */}
          <div style={{ flex: '1.15 1 380px', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>Mes tâches</span>
              <div style={{ display: 'flex', border: `1px solid ${C.border}`, borderRadius: 99, overflow: 'hidden' }}>
                <button style={segStyle(taskView === 'list')} onClick={() => setTaskView('list')}>Liste</button>
                <button style={segStyle(taskView === 'week')} onClick={() => setTaskView('week')}>Semaine</button>
              </div>
            </div>

            {tasksLoading && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${C.border}`, borderTopColor: C.accent, animation: 'spin 1s linear infinite' }} />
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              </div>
            )}

            {/* LISTE */}
            {!tasksLoading && taskView === 'list' && (
              <>
                <GroupHeader label="AUJOURD'HUI" count={todayActiveCount} accent />
                {todayTasks.length === 0
                  ? <p style={{ fontSize: 13, color: C.muted, padding: '6px 2px' }}>Rien pour aujourd'hui 🎉</p>
                  : todayTasks.map((t, i) => <TaskRow key={t.id} task={t} onToggle={toggleTask} last={i === todayTasks.length - 1} />)}

                {weekTasks.length > 0 && <>
                  <GroupHeader label="CETTE SEMAINE" count={weekTasks.filter(t => t.status === 'active').length} />
                  {weekTasks.map((t, i) => <TaskRow key={t.id} task={t} onToggle={toggleTask} last={i === weekTasks.length - 1} />)}
                </>}

                {upcomingTasks.length > 0 && <>
                  <GroupHeader label="PROCHAINEMENT" count={upcomingTasks.length} />
                  {upcomingTasks.map((t, i) => <TaskRow key={t.id} task={t} onToggle={toggleTask} last={i === upcomingTasks.length - 1} />)}
                </>}

                {myTasks.length === 0 && <p style={{ fontSize: 13, color: C.muted, marginTop: 8 }}>Aucune tâche assignée.</p>}
              </>
            )}

            {/* SEMAINE */}
            {!tasksLoading && taskView === 'week' && (
              <div>
                {weekDays.map(day => {
                  const dayStr = toDateStr(day)
                  const dayTasks = tasksForDay(dayStr)
                  const isToday = dayStr === todayStr
                  const isPast = dayStr < todayStr
                  const label = day.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
                  return (
                    <div key={dayStr} style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ font: `500 10px ${MONO}`, letterSpacing: '.1em', textTransform: 'uppercase', color: isToday ? C.accent : isPast ? C.faintChevron : C.muted }}>{label}</span>
                        {isToday && <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.accent }} />}
                        {dayTasks.length > 0 && <span style={{ font: `10px ${MONO}`, color: C.muted }}>{dayTasks.filter(t => t.status === 'active').length}</span>}
                      </div>
                      <div style={{ border: `1px solid ${isToday ? C.border : C.divider}`, borderRadius: 8, background: isToday ? '#fdf4f6' : C.surface, padding: dayTasks.length ? '0 12px' : '8px 12px' }}>
                        {dayTasks.length === 0
                          ? <p style={{ fontSize: 12, color: C.faintChevron, margin: 0 }}>—</p>
                          : dayTasks.map((t, i) => <TaskRow key={t.id} task={t} onToggle={toggleTask} last={i === dayTasks.length - 1} />)}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ══ Colonne droite : Agenda ══ */}
          <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>Agenda</span>
              {calStatus === 'ok'
                ? <button onClick={connectCalendar} style={{ font: `11px ${MONO}`, color: C.inkSecondary, border: `1px solid ${C.border}`, padding: '4px 11px', borderRadius: 99, background: 'transparent', cursor: 'pointer' }}>↻ ACTUALISER</button>
                : (calStatus === 'idle' || calStatus === 'error') && <button onClick={connectCalendar} style={{ font: `11px ${MONO}`, color: C.inkSecondary, border: `1px solid ${C.border}`, padding: '4px 11px', borderRadius: 99, background: 'transparent', cursor: 'pointer' }}>{calStatus === 'error' ? '↻ RÉESSAYER' : '+ CONNECTER'}</button>}
            </div>

            {calStatus !== 'idle' && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {TARGET_CALS.map(c => {
                  const cat = CAL_CAT[c]
                  return <span key={c} style={{ font: `10px ${MONO}`, color: cat.fg, background: cat.bg, padding: '3px 9px', borderRadius: 99 }}>{cat.label}</span>
                })}
              </div>
            )}

            {calStatus === 'idle' && (
              <div style={{ border: `1px dashed ${C.faintBorder}`, borderRadius: 8, padding: 32, textAlign: 'center' }}>
                <div style={{ fontSize: 30, marginBottom: 8 }}>📅</div>
                <p style={{ fontSize: 13, fontWeight: 600, color: C.inkSecondary, margin: 0 }}>Connectez Google Calendar</p>
                <p style={{ fontSize: 11.5, color: C.muted, marginTop: 4 }}>pour afficher vos événements des 14 prochains jours</p>
                <button onClick={connectCalendar} style={{ marginTop: 16, font: `600 12px ${FONT}`, padding: '9px 16px', borderRadius: 5, background: C.ink, color: C.accentOnDark, border: 'none', cursor: 'pointer' }}>Connecter Google Calendar</button>
              </div>
            )}

            {calStatus === 'loading' && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', border: `2px solid ${C.border}`, borderTopColor: C.accent, animation: 'spin 1s linear infinite' }} />
              </div>
            )}

            {calStatus === 'error' && (
              <div style={{ background: C.dangerBg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, fontSize: 13, color: C.danger }}>
                <p style={{ fontWeight: 600, margin: '0 0 4px' }}>Erreur de connexion</p>
                <p style={{ fontSize: 11.5, margin: 0 }}>{calError}</p>
              </div>
            )}

            {(calStatus === 'ok') && (
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: C.surface, padding: 16, display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                {eventDates.length === 0 && <p style={{ fontSize: 13, color: C.muted }}>Aucun événement dans les 14 prochains jours.</p>}
                {eventDates.map(dateStr => (
                  <div key={dateStr} style={{ display: 'contents' }}>
                    <span style={{ font: `600 10.5px ${MONO}`, letterSpacing: '.1em', color: dateStr === todayStr ? C.accent : C.muted, marginTop: dateStr === eventDates[0] ? 0 : 12 }}>{fmtDayLabel(dateStr)}</span>
                    {eventsByDate[dateStr].map(({ calName, event }) => {
                      const cat = CAL_CAT[calName] || { fg: C.muted, bg: C.divider, label: (calName || '').toUpperCase() }
                      const isAllDay = !event.start?.dateTime
                      return (
                        <div key={event.id} style={{ display: 'flex', gap: 10, padding: '9px 0', borderBottom: `1px solid ${C.divider}` }}>
                          <span style={{ width: 3, borderRadius: 2, background: cat.fg, flex: 'none' }} />
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                            <span style={{ fontSize: 13, fontWeight: 600 }}>{event.summary || '(sans titre)'}</span>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                              <span style={{ font: `9.5px ${MONO}`, color: cat.fg, background: cat.bg, padding: '1px 7px', borderRadius: 99 }}>{cat.label}</span>
                              <span style={{ font: `10.5px ${MONO}`, color: C.muted }}>{isAllDay ? 'JOURNÉE ENTIÈRE' : `${fmtTime(event.start.dateTime)} – ${fmtTime(event.end?.dateTime)}`}</span>
                              {event.location && <span style={{ font: `10.5px ${MONO}`, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>📍 {event.location}</span>}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))}
                <div style={{ flex: 1 }} />
                <span style={{ font: `10px ${MONO}`, color: C.faintChevron, textAlign: 'center', borderTop: `1px solid ${C.divider}`, paddingTop: 10 }}>ÉVÉNEMENTS DES 14 PROCHAINS JOURS · GOOGLE CALENDAR</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
