import { useState, useEffect, useCallback } from 'react'
import useSWR from 'swr'
import Head from 'next/head'
import Link from 'next/link'
import NavBar from '../components/NavBar'
import { useResponsibles } from '../lib/useResponsibles'
import { useGoogleCalendar } from '../lib/googleCalendar'

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

const DAYS_FR   = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const MONTHS_FR = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']

function startOfWeek(d) {
  const x = new Date(d)
  const day = (x.getDay() + 6) % 7 // 0 = lundi
  x.setDate(x.getDate() - day)
  x.setHours(0, 0, 0, 0)
  return x
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function isSameDay(a, b) { return ymd(a) === ymd(b) }

function weekLabel(monday) {
  const sunday = addDays(monday, 6)
  const m1 = MONTHS_FR[monday.getMonth()], m2 = MONTHS_FR[sunday.getMonth()]
  if (m1 === m2) return `${monday.getDate()} – ${sunday.getDate()} ${m1} ${sunday.getFullYear()}`
  return `${monday.getDate()} ${m1} – ${sunday.getDate()} ${m2} ${sunday.getFullYear()}`
}

export default function Planning() {
  const { responsibles } = useResponsibles()
  const { data: tasks = [], isLoading } = useSWR('/api/tasks')
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const days  = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const weekKeys = days.map(ymd)

  // Personnes affichées : responsables réels (on garde "non défini" en ligne séparée à la fin)
  const people = (Array.isArray(responsibles) ? responsibles : []).filter(r => r && r !== 'non défini' && r !== 'Sous-traitant')

  // Tâches de la semaine indexées par personne + jour
  const inWeek = tasks.filter(t => weekKeys.includes(t.execution_date))
  function tasksFor(person, dayKey) {
    return inWeek.filter(t => (t.responsible || 'non défini') === person && t.execution_date === dayKey)
  }
  function weekCountActive(person) {
    return inWeek.filter(t => (t.responsible || 'non défini') === person && t.status !== 'completed').length
  }

  // "Non assigné" + sous-traitants regroupés s'il y a des tâches
  const otherPeople = Array.from(new Set(inWeek.map(t => t.responsible || 'non défini')))
    .filter(p => !people.includes(p))
  const rows = [...people, ...otherPeople]

  const GRID = { display: 'grid', gridTemplateColumns: `150px repeat(7, minmax(150px, 1fr))` }

  function cellTint(n) {
    if (n >= 5) return '#fef2f2'   // rouge clair — surcharge
    if (n >= 3) return '#fffbeb'   // ambre clair — charge
    return 'transparent'
  }

  // ── Google Agenda (lecture + écriture d'événements) ──────────────────────
  const gcal = useGoogleCalendar()
  const { connected: gcalConnected, listEvents } = gcal
  const [events, setEvents]   = useState([])
  const [evtModal, setEvtModal] = useState(null) // { mode, event?, dateKey?, calendarId? }

  // Auto-reconnexion silencieuse si déjà connecté précédemment
  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('gcalConnected') === '1') {
      gcal.connect({ silent: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadEvents = useCallback(async () => {
    if (!gcalConnected) return
    const tMin = new Date(weekStart); tMin.setHours(0, 0, 0, 0)
    const tMax = addDays(weekStart, 7)
    try { setEvents(await listEvents(tMin.toISOString(), tMax.toISOString())) }
    catch (_) { /* ignore */ }
  }, [gcalConnected, weekStart, listEvents])
  useEffect(() => { loadEvents() }, [loadEvents])

  function eventDateKey(ev) {
    return ev.start?.date || (ev.start?.dateTime ? ev.start.dateTime.slice(0, 10) : null)
  }
  function eventsForDay(dayKey) {
    return events.filter(ev => eventDateKey(ev) === dayKey).sort((a, b) => {
      const ta = a.start?.dateTime || ''; const tb = b.start?.dateTime || ''
      return ta < tb ? -1 : ta > tb ? 1 : 0
    })
  }
  function eventTimeLabel(ev) {
    if (ev.start?.date) return ''
    if (!ev.start?.dateTime) return ''
    const d = new Date(ev.start.dateTime)
    return d.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="min-h-screen" style={{ background: '#fafafa' }}>
      <Head><title>Planning — Maze Project</title></Head>

      <NavBar title="Planning">
        <div className="flex items-center gap-1">
          <button onClick={() => setWeekStart(w => addDays(w, -7))}
            className="w-8 h-8 flex items-center justify-center rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50">‹</button>
          <button onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="px-3 h-8 rounded-md border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50">Cette semaine</button>
          <button onClick={() => setWeekStart(w => addDays(w, 7))}
            className="w-8 h-8 flex items-center justify-center rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50">›</button>
        </div>
      </NavBar>

      <main className="w-full px-4 md:px-10 py-6 md:py-10" style={{ maxWidth: 1500, margin: '0 auto' }}>
        <div className="flex items-baseline gap-3 mb-6">
          <h2 className="font-semibold text-gray-900 tracking-tight" style={{ fontSize: 'clamp(20px, 5vw, 28px)' }}>Capacité de la semaine</h2>
          <span className="text-gray-400" style={{ fontSize: 15 }}>{weekLabel(weekStart)}</span>
        </div>

        {isLoading && tasks.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400 text-sm">Chargement…</div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <div style={{ minWidth: 150 + 7 * 150 }}>
              {/* En-tête jours */}
              <div style={GRID} className="border-b border-gray-100">
                <div className="px-3 py-2.5" />
                {days.map((d, i) => {
                  const isToday = isSameDay(d, today)
                  return (
                    <div key={i} className="px-3 py-2.5 text-center border-l border-gray-100"
                      style={{ background: isToday ? '#eff6ff' : 'transparent' }}>
                      <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: isToday ? '#1d4ed8' : '#9ca3af' }}>{DAYS_FR[i]}</div>
                      <div className="text-sm font-semibold tabular-nums" style={{ color: isToday ? '#1d4ed8' : '#374151' }}>{d.getDate()}</div>
                    </div>
                  )
                })}
              </div>

              {/* Lignes personnes */}
              {rows.length === 0 ? (
                <div className="px-4 py-10 text-center text-gray-400 text-sm">Aucune tâche planifiée cette semaine.</div>
              ) : rows.map(person => (
                <div key={person} style={GRID} className="border-b border-gray-50 last:border-0">
                  {/* Label personne */}
                  <div className="px-3 py-3 flex items-center gap-2 border-r border-gray-100">
                    <span className="w-7 h-7 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0"
                      style={{ background: colorForName(person), fontSize: 11 }}>{initials(person)}</span>
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 truncate" style={{ fontSize: 13 }}>{person}</div>
                      <div className="text-gray-400" style={{ fontSize: 11 }}>{weekCountActive(person)} tâche{weekCountActive(person) > 1 ? 's' : ''}</div>
                    </div>
                  </div>

                  {/* Cellules jours */}
                  {days.map((d, i) => {
                    const dayKey = weekKeys[i]
                    const cellTasks = tasksFor(person, dayKey)
                    const activeN = cellTasks.filter(t => t.status !== 'completed').length
                    return (
                      <div key={i} className="px-1.5 py-1.5 border-l border-gray-100 space-y-1 align-top"
                        style={{ background: isSameDay(d, today) ? '#f8faff' : cellTint(activeN), minHeight: 56 }}>
                        {cellTasks.map(t => {
                          const done = t.status === 'completed'
                          const proj = t.projects
                          const dot = proj?.color_override || colorForName(t.responsible)
                          const chip = (
                            <div className="flex items-center gap-1.5 px-1.5 py-1 rounded-md hover:bg-gray-100 transition-colors"
                              style={{ background: '#f9fafb' }} title={`${t.title}${proj ? ' · ' + proj.name : ''}`}>
                              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dot }} />
                              <span className={`truncate ${done ? 'line-through text-gray-400' : 'text-gray-700'}`} style={{ fontSize: 11.5 }}>{t.title}</span>
                            </div>
                          )
                          return proj?.id
                            ? <Link key={t.id} href={`/projects/${proj.id}`} className="block">{chip}</Link>
                            : <div key={t.id}>{chip}</div>
                        })}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-gray-400 mt-4">
          Charge basée sur les tâches datées (date d'exécution). <span style={{ color: '#b45309' }}>■</span> 3+ tâches · <span style={{ color: '#dc2626' }}>■</span> 5+ tâches dans la journée.
        </p>

        {/* ── Agenda Google ── */}
        <div className="mt-10">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900" style={{ fontSize: 18 }}>Agenda Google</h3>
              {gcal.connected && <span className="text-xs text-gray-400">{gcal.calendars.length} agenda(s)</span>}
            </div>
            <div className="flex items-center gap-2">
              {gcal.error && <span className="text-xs text-red-600 max-w-xs truncate" title={gcal.error}>{gcal.error}</span>}
              {gcal.connected ? (
                <button onClick={loadEvents} className="px-3 py-1.5 rounded-md border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Rafraîchir</button>
              ) : (
                <button onClick={() => gcal.connect()} disabled={gcal.connecting}
                  className="px-3 py-1.5 rounded-md text-sm font-medium text-white disabled:opacity-50" style={{ background: '#111827' }}>
                  {gcal.connecting ? 'Connexion…' : 'Connecter Google Agenda'}
                </button>
              )}
            </div>
          </div>

          {!gcal.connected ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
              Connecte ton compte Google pour voir et gérer tes événements ici. Tout reste synchronisé avec ton agenda (Mac, téléphone…).
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
              <div style={{ minWidth: 150 + 7 * 150 }}>
                <div style={GRID} className="border-b border-gray-100">
                  <div className="px-3 py-2.5 text-xs font-semibold text-gray-400 flex items-center">Événements</div>
                  {days.map((d, i) => {
                    const isToday = isSameDay(d, today)
                    return (
                      <div key={i} className="px-3 py-2.5 text-center border-l border-gray-100" style={{ background: isToday ? '#eff6ff' : 'transparent' }}>
                        <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: isToday ? '#1d4ed8' : '#9ca3af' }}>{DAYS_FR[i]}</div>
                        <div className="text-sm font-semibold tabular-nums" style={{ color: isToday ? '#1d4ed8' : '#374151' }}>{d.getDate()}</div>
                      </div>
                    )
                  })}
                </div>
                <div style={GRID}>
                  <div className="px-3 py-2 border-r border-gray-100 text-xs text-gray-400 flex items-center">Tous agendas</div>
                  {days.map((d, i) => {
                    const dayKey = weekKeys[i]
                    const evs = eventsForDay(dayKey)
                    return (
                      <div key={i} className="group px-1.5 py-1.5 border-l border-gray-100 space-y-1"
                        style={{ background: isSameDay(d, today) ? '#f8faff' : 'transparent', minHeight: 70 }}>
                        {evs.map(ev => (
                          <button key={ev.id + ev._calendarId}
                            onClick={() => ev._writable && setEvtModal({ mode: 'edit', event: ev })}
                            className="w-full text-left flex items-start gap-1.5 px-1.5 py-1 rounded-md hover:bg-gray-100 transition-colors"
                            style={{ background: '#f9fafb', cursor: ev._writable ? 'pointer' : 'default' }}
                            title={`${ev.summary || '(sans titre)'}${ev._calName ? ' · ' + ev._calName : ''}`}>
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1" style={{ background: ev._color || '#9ca3af' }} />
                            <span className="min-w-0 truncate">
                              {eventTimeLabel(ev) && <span className="text-gray-400 mr-1" style={{ fontSize: 10.5 }}>{eventTimeLabel(ev)}</span>}
                              <span className="text-gray-700" style={{ fontSize: 11.5 }}>{ev.summary || '(sans titre)'}</span>
                            </span>
                          </button>
                        ))}
                        <button onClick={() => setEvtModal({ mode: 'create', dateKey })}
                          className="opacity-0 group-hover:opacity-100 transition-opacity w-full text-center text-xs text-gray-400 hover:text-gray-700 py-0.5 rounded border border-dashed border-gray-200">
                          + Événement
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {evtModal && (
        <EventModal data={evtModal} calendars={gcal.calendars} gcal={gcal}
          onClose={() => setEvtModal(null)} onSaved={loadEvents} />
      )}
    </div>
  )
}

function pad(n) { return String(n).padStart(2, '0') }

function EventModal({ data, calendars, gcal, onClose, onSaved }) {
  const writable = calendars.filter(c => c.writable)
  const isEdit = data.mode === 'edit'
  const ev = data.event

  const initAllDay = isEdit ? !!ev.start?.date : true
  const initDate   = isEdit ? (ev.start?.date || ev.start?.dateTime?.slice(0, 10)) : data.dateKey
  const initStart  = isEdit && ev.start?.dateTime ? new Date(ev.start.dateTime) : null
  const initEnd    = isEdit && ev.end?.dateTime ? new Date(ev.end.dateTime) : null

  const [title, setTitle]   = useState(isEdit ? (ev.summary || '') : '')
  const [allDay, setAllDay] = useState(initAllDay)
  const [date, setDate]     = useState(initDate || ymd(new Date()))
  const [startTime, setStartTime] = useState(initStart ? `${pad(initStart.getHours())}:${pad(initStart.getMinutes())}` : '09:00')
  const [endTime, setEndTime]     = useState(initEnd ? `${pad(initEnd.getHours())}:${pad(initEnd.getMinutes())}` : '10:00')
  const [calendarId, setCalendarId] = useState(isEdit ? ev._calendarId : (writable.find(c => c.primary)?.id || writable[0]?.id || 'primary'))
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')

  function buildResource() {
    if (allDay) {
      const end = new Date(date + 'T00:00:00'); end.setDate(end.getDate() + 1)
      return { summary: title || '(sans titre)', start: { date }, end: { date: ymd(end) } }
    }
    const s = new Date(`${date}T${startTime}:00`)
    const e = new Date(`${date}T${endTime}:00`)
    return { summary: title || '(sans titre)', start: { dateTime: s.toISOString() }, end: { dateTime: e.toISOString() } }
  }

  async function save() {
    if (saving) return
    setSaving(true); setErr('')
    try {
      const res = buildResource()
      if (isEdit) await gcal.updateEvent(ev._calendarId, ev.id, res)
      else        await gcal.createEvent(calendarId, res)
      await onSaved(); onClose()
    } catch (e) { setErr(e?.result?.error?.message || e?.message || 'Erreur'); setSaving(false) }
  }
  async function remove() {
    if (!isEdit || saving) return
    if (!confirm('Supprimer cet événement de Google Agenda ?')) return
    setSaving(true); setErr('')
    try { await gcal.deleteEvent(ev._calendarId, ev.id); await onSaved(); onClose() }
    catch (e) { setErr(e?.result?.error?.message || e?.message || 'Erreur'); setSaving(false) }
  }

  const inp = "w-full px-3 py-2 rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold text-gray-900 mb-4" style={{ fontSize: 16 }}>{isEdit ? 'Modifier l’événement' : 'Nouvel événement'}</h3>
        <div className="space-y-3">
          <input className={inp} placeholder="Titre" value={title} onChange={e => setTitle(e.target.value)} autoFocus />
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)} /> Journée entière
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div className={allDay ? 'col-span-2' : ''}>
              <label className="block text-xs text-gray-500 mb-1">Date</label>
              <input type="date" className={inp} value={date} onChange={e => setDate(e.target.value)} />
            </div>
            {!allDay && (
              <>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Début</label>
                  <input type="time" className={inp} value={startTime} onChange={e => setStartTime(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Fin</label>
                  <input type="time" className={inp} value={endTime} onChange={e => setEndTime(e.target.value)} />
                </div>
              </>
            )}
          </div>
          {!isEdit ? (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Agenda</label>
              <select className={inp} value={calendarId} onChange={e => setCalendarId(e.target.value)}>
                {writable.map(c => <option key={c.id} value={c.id}>{c.summary}{c.primary ? ' (principal)' : ''}</option>)}
              </select>
            </div>
          ) : (
            <div className="text-xs text-gray-400">Agenda : {ev._calName}</div>
          )}
          {err && <div className="text-xs text-red-600">{err}</div>}
        </div>
        <div className="flex items-center gap-2 mt-5">
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-md text-sm font-medium text-white disabled:opacity-50" style={{ background: '#111827' }}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          <button onClick={onClose} className="px-3 py-2 text-sm text-gray-500 hover:text-gray-800">Annuler</button>
          {isEdit && <button onClick={remove} disabled={saving} className="ml-auto px-3 py-2 text-sm text-red-600 hover:text-red-700">Supprimer</button>}
        </div>
      </div>
    </div>
  )
}
