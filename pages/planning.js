import { useState, useEffect, useCallback } from 'react'
import useSWR from 'swr'
import Head from 'next/head'
import Link from 'next/link'
import { useResponsibles } from '../lib/useResponsibles'
import { useGoogleCalendar } from '../lib/googleCalendar'
import { C, FONT, MONO, personChip, initials } from '../lib/theme'

function colorForName(name) {
  const chip = personChip(name)
  if (chip.fg !== C.inkSecondary) return chip.fg
  if (!name) return C.muted
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return `hsl(${Math.abs(hash) % 360}, 45%, 48%)`
}

const DAYS_FR   = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM']
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
  const friday = addDays(monday, 4)
  const m1 = MONTHS_FR[monday.getMonth()], m2 = MONTHS_FR[friday.getMonth()]
  if (m1 === m2) return `${monday.getDate()} – ${friday.getDate()} ${m1} ${friday.getFullYear()}`
  return `${monday.getDate()} ${m1} – ${friday.getDate()} ${m2} ${friday.getFullYear()}`
}

export default function Planning() {
  const { responsibles } = useResponsibles()
  const { data: tasks = [], isLoading } = useSWR('/api/tasks')
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const days  = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i))  // lun–ven
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

  const GRID = { display: 'grid', gridTemplateColumns: `156px repeat(5, minmax(0, 1fr))` }

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

  const dayHeader = (d, i) => {
    const isToday = isSameDay(d, today)
    return (
      <div key={i} style={{ padding: '12px 8px 10px', textAlign: 'center', borderLeft: `1px solid ${C.divider}`, background: isToday ? C.accentBg : 'transparent' }}>
        <div style={{ font: `600 10px ${MONO}`, letterSpacing: '.1em', color: isToday ? C.accent : C.muted }}>{DAYS_FR[i]}</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: isToday ? C.accent : C.ink }}>{d.getDate()}</div>
      </div>
    )
  }
  const taskCard = (t) => {
    const done = t.status === 'completed'
    const proj = t.projects
    const dot = done ? C.success : (proj?.color_override || colorForName(t.responsible))
    const inner = (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 5, minWidth: 0, background: done ? '#faf7f8' : C.surface, border: `1px solid ${C.divider}` }}
        title={`${t.title}${proj ? ' · ' + proj.name : ''}`}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot, flex: 'none' }} />
        <span style={{ fontSize: 11, color: done ? C.faint : C.inkTertiary, textDecoration: done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
      </div>
    )
    return proj?.id
      ? <Link key={t.id} href={`/projects/${proj.id}`} style={{ display: 'block', textDecoration: 'none' }}>{inner}</Link>
      : <div key={t.id}>{inner}</div>
  }

  return (
    <div className="min-h-screen" style={{ background: C.pageBg, fontFamily: FONT, color: C.ink }}>
      <Head><title>Planning — Maze Project</title></Head>

      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '26px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, borderBottom: `1px solid ${C.border}`, paddingBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 23, fontWeight: 700, letterSpacing: '-.4px' }}>Capacité de la semaine</span>
            <span style={{ font: `11.5px ${MONO}`, color: C.muted }}>{weekLabel(weekStart).toUpperCase()} · PAR DEMI-JOURNÉE</span>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden', font: `600 12.5px ${FONT}` }}>
            <button onClick={() => setWeekStart(w => addDays(w, -7))} style={{ padding: '7px 12px', color: C.inkSecondary, borderRight: `1px solid ${C.border}`, background: C.surface, border: 'none', cursor: 'pointer' }}>‹</button>
            <button onClick={() => setWeekStart(startOfWeek(new Date()))} style={{ padding: '7px 14px', background: C.ink, color: '#fff', border: 'none', cursor: 'pointer' }}>Cette semaine</button>
            <button onClick={() => setWeekStart(w => addDays(w, 7))} style={{ padding: '7px 12px', color: C.inkSecondary, borderLeft: `1px solid ${C.border}`, background: C.surface, border: 'none', cursor: 'pointer' }}>›</button>
          </div>
        </div>

        {isLoading && tasks.length === 0 ? (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 40, textAlign: 'center', color: C.muted, fontSize: 13 }}>Chargement…</div>
        ) : (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
            {/* En-tête jours */}
            <div style={{ ...GRID, borderBottom: `1px solid ${C.divider}` }}>
              <div />
              {days.map(dayHeader)}
            </div>

            {/* Lignes personnes */}
            {rows.length === 0 ? (
              <div style={{ padding: '40px 16px', textAlign: 'center', color: C.muted, fontSize: 13 }}>Aucune tâche planifiée cette semaine.</div>
            ) : rows.map(person => (
              <div key={person} style={{ ...GRID, borderBottom: `1px solid ${C.divider}` }}>
                {/* Cellule personne + gouttière AM/PM */}
                <div style={{ display: 'flex', alignItems: 'stretch', borderRight: `1px solid ${C.divider}` }}>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '12px 6px 12px 14px', minWidth: 0 }}>
                    <span style={{ width: 26, height: 26, borderRadius: '50%', background: colorForName(person), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flex: 'none' }}>{initials(person)}</span>
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{person}</span>
                      <span style={{ font: `9.5px ${MONO}`, color: C.muted }}>{weekCountActive(person)} TÂCHE{weekCountActive(person) > 1 ? 'S' : ''}</span>
                    </div>
                  </div>
                  <div style={{ width: 26, flex: 'none', display: 'flex', flexDirection: 'column' }}>
                    <span style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', font: `8.5px ${MONO}`, color: C.faintBorder, borderBottom: '1px dashed #eee0e5' }}>AM</span>
                    <span style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', font: `8.5px ${MONO}`, color: C.faintBorder }}>PM</span>
                  </div>
                </div>

                {/* Cellules jours (AM = tâches, PM vide — pas de données demi-journée) */}
                {days.map((d, i) => {
                  const cellTasks = tasksFor(person, weekKeys[i])
                  const isToday = isSameDay(d, today)
                  return (
                    <div key={i} style={{ borderLeft: `1px solid ${C.divider}`, background: isToday ? '#fdf4f6' : 'transparent', display: 'flex', flexDirection: 'column', minHeight: 100 }}>
                      <div style={{ flex: 1, padding: 6, display: 'flex', flexDirection: 'column', gap: 4, borderBottom: '1px dashed #eee0e5', minHeight: 44 }}>
                        {cellTasks.map(taskCard)}
                      </div>
                      <div style={{ flex: 1, padding: 6, display: 'flex', flexDirection: 'column', gap: 4, minHeight: 44 }} />
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}

        <span style={{ font: `10.5px ${MONO}`, color: C.muted }}>CHAQUE JOUR = MATIN / APRÈS-MIDI · UNE CARTE = UN PROJET · COLONNE ROSE = AUJOURD'HUI</span>

        {/* ── Agenda Google ── */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>Agenda Google</span>
          {gcal.connected && <span style={{ font: `10.5px ${MONO}`, color: C.muted }}>{gcal.calendars.length} AGENDA{gcal.calendars.length > 1 ? 'S' : ''}</span>}
          <div style={{ flex: 1 }} />
          {gcal.error && <span style={{ fontSize: 11, color: C.danger, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={gcal.error}>{gcal.error}</span>}
          {gcal.connected ? (
            <button onClick={loadEvents} style={{ font: `11px ${MONO}`, color: C.inkSecondary, border: `1px solid ${C.border}`, padding: '4px 11px', borderRadius: 99, background: 'transparent', cursor: 'pointer' }}>↻ RAFRAÎCHIR</button>
          ) : (
            <button onClick={() => gcal.connect()} disabled={gcal.connecting}
              style={{ font: `600 12px ${FONT}`, color: C.accentOnDark, background: C.ink, border: 'none', padding: '8px 14px', borderRadius: 5, cursor: 'pointer', opacity: gcal.connecting ? 0.5 : 1 }}>
              {gcal.connecting ? 'Connexion…' : 'Connecter Google Agenda'}
            </button>
          )}
        </div>

        {!gcal.connected ? (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 32, textAlign: 'center', color: C.muted, fontSize: 13 }}>
            Connecte ton compte Google pour voir et gérer tes événements ici. Tout reste synchronisé avec ton agenda (Mac, téléphone…).
          </div>
        ) : (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
            <div style={GRID}>
              <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', borderRight: `1px solid ${C.divider}` }}>
                <span style={{ font: `10.5px ${MONO}`, color: C.muted }}>TOUS AGENDAS</span>
              </div>
              {days.map((d, i) => {
                const dayKey = weekKeys[i]
                const evs = eventsForDay(dayKey)
                const isToday = isSameDay(d, today)
                return (
                  <div key={i} className="group" style={{ borderLeft: `1px solid ${C.divider}`, background: isToday ? '#fdf4f6' : 'transparent', padding: 8, display: 'flex', flexDirection: 'column', gap: 5, minHeight: 64 }}>
                    {evs.map(ev => (
                      <button key={ev.id + ev._calendarId}
                        onClick={() => ev._writable && setEvtModal({ mode: 'edit', event: ev })}
                        style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: 6, padding: '5px 8px', borderRadius: 5, minWidth: 0, background: C.surface, border: `1px solid ${C.divider}`, cursor: ev._writable ? 'pointer' : 'default' }}
                        title={`${ev.summary || '(sans titre)'}${ev._calName ? ' · ' + ev._calName : ''}`}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', flex: 'none', marginTop: 3, background: ev._color || C.muted }} />
                        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {eventTimeLabel(ev) && <span style={{ font: `10px ${MONO}`, color: C.muted, marginRight: 4 }}>{eventTimeLabel(ev)}</span>}
                          <span style={{ fontSize: 11, color: C.inkTertiary }}>{ev.summary || '(sans titre)'}</span>
                        </span>
                      </button>
                    ))}
                    <button onClick={() => setEvtModal({ mode: 'create', dateKey: dayKey })}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ border: '1.5px dashed #e6dade', borderRadius: 5, textAlign: 'center', fontSize: 10.5, color: C.faint, padding: 5, background: 'transparent', cursor: 'pointer' }}>
                      + Événement
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
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
