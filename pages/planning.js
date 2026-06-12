import { useState } from 'react'
import useSWR from 'swr'
import Head from 'next/head'
import Link from 'next/link'
import NavBar from '../components/NavBar'
import { useResponsibles } from '../lib/useResponsibles'

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
      </main>
    </div>
  )
}
