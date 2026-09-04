import { useState } from 'react'
import useSWR from 'swr'
import Head from 'next/head'
import { useAuth } from './_app'
import NavBar from '../components/NavBar'
import { AL, C, FONT } from '../lib/theme'
import { jourLocal } from '../lib/aujourdhui'

const PINK = AL.black
const PERSON_COLORS = {
  Arnaud: C.info,
  Gabin: C.violet,
  Guillaume: AL.black,
}

const ACTION_LABELS = {
  task_completed:   { emoji: '✅', label: 'a terminé',           color: C.success },
  task_uncompleted: { emoji: '↩️',  label: 'a réouvert',          color: C.warning },
  task_created:     { emoji: '✨', label: 'a créé la tâche',     color: C.info },
  task_updated:     { emoji: '✏️', label: 'a modifié',            color: C.muted },
  task_deleted:     { emoji: '🗑️', label: 'a supprimé',           color: C.danger },
  project_created:  { emoji: '🚀', label: 'a créé le projet',    color: C.violet },
  project_updated:  { emoji: '🔧', label: 'a mis à jour',        color: C.muted },
  project_deleted:  { emoji: '🗑️', label: 'a supprimé le projet', color: C.danger },
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return "À l'instant"
  if (m < 60) return `il y a ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `il y a ${h}h`
  const d = Math.floor(h / 24)
  if (d < 7)  return `il y a ${d}j`
  return new Date(dateStr).toLocaleDateString('fr-CH', { day: 'numeric', month: 'short' })
}

function groupByDay(entries) {
  const groups = {}
  entries.forEach(e => {
    // Le regroupement par jour suit l'heure LOCALE : sinon une action de
    // 23h apparaît sous la date du lendemain.
    const day = jourLocal(e.created_at)
    if (!groups[day]) groups[day] = []
    groups[day].push(e)
  })
  return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a))
}

function formatDay(dateStr) {
  const d = new Date(dateStr)
  const today = new Date(); today.setHours(0,0,0,0)
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  if (d >= today)     return "Aujourd'hui"
  if (d >= yesterday) return 'Hier'
  return d.toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long' })
}

export default function Activity() {
  const { user, signOut } = useAuth()
  const { data: entries = [], isLoading } = useSWR('/api/activity')
  const loading = isLoading && entries.length === 0
  const [filter, setFilter] = useState('all') // 'all' | person name

  const filtered = filter === 'all' ? entries : entries.filter(e => e.actor === filter)
  const grouped  = groupByDay(filtered)

  return (
    <div className="min-h-screen" style={{ background: AL.white, fontFamily: FONT }}>
      <Head>
        <title>Activité — Maze Project</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>{`body { font-family: ${FONT}; } * { -webkit-tap-highlight-color: transparent; }`}</style>
      </Head>

      <NavBar title="activité" />

      {/* Filtre par personne */}
      <div className="u-surface border-b" style={{ borderColor: 'rgba(12,12,12,.08)' }}>
        <div className="max-w-3xl mx-auto px-4 py-2 flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {['all', 'Arnaud', 'Gabin', 'Guillaume'].map(p => (
            <button key={p} onClick={() => setFilter(p)}
              className="px-3 py-1 u-pill text-xs font-medium flex-shrink-0 transition-all"
              style={filter === p
                ? { background: p === 'all' ? AL.black : PERSON_COLORS[p], color: 'white' }
                : { background: 'rgba(12,12,12,.06)', color: C.muted }}>
              {p === 'all' ? 'Tous' : p}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {loading ? (
          <div className="text-center py-20 u-muted text-sm">Chargement...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-4xl mb-3">📋</div>
            <p className="u-muted text-sm">Aucune activité enregistrée</p>
          </div>
        ) : (
          <div className="space-y-8">
            {grouped.map(([day, dayEntries]) => (
              <div key={day}>
                {/* Séparateur jour */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1 h-px u-fill" />
                  <span className="text-xs font-semibold u-muted uppercase tracking-wide whitespace-nowrap">
                    {formatDay(day)}
                  </span>
                  <div className="flex-1 h-px u-fill" />
                </div>

                {/* Entrées du jour */}
                <div className="space-y-2">
                  {dayEntries.map(entry => {
                    const meta = ACTION_LABELS[entry.action] || { emoji: '•', label: entry.action, color: C.muted }
                    const personColor = PERSON_COLORS[entry.actor] || C.muted
                    return (
                      <div key={entry.id}
                        className="u-surface u-panel border flex items-start gap-3 px-4 py-3"
                        style={{ borderColor: 'rgba(12,12,12,.06)' }}>
                        {/* Avatar */}
                        <div className="w-8 h-8 u-pill flex items-center justify-center flex-shrink-0 text-white text-xs font-bold mt-0.5"
                          style={{ background: personColor }}>
                          {entry.actor?.[0] || '?'}
                        </div>

                        {/* Contenu */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm u-ink leading-snug">
                            <span className="font-semibold" style={{ color: personColor }}>{entry.actor}</span>
                            {' '}
                            <span className="u-muted">{meta.label}</span>
                            {entry.entity_name && (
                              <>
                                {' '}
                                <span className="font-medium u-ink">«{entry.entity_name}»</span>
                              </>
                            )}
                          </p>
                          {entry.metadata?.responsible && entry.entity_type === 'task' && (
                            <p className="text-xs u-muted mt-0.5">
                              Responsable : <span className="font-medium" style={{ color: PERSON_COLORS[entry.metadata.responsible] || C.muted }}>{entry.metadata.responsible}</span>
                            </p>
                          )}
                          {entry.metadata?.client && (
                            <p className="text-xs u-muted mt-0.5">Client : {entry.metadata.client}</p>
                          )}
                        </div>

                        {/* Time + emoji */}
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <span className="text-base">{meta.emoji}</span>
                          <span className="text-xs u-muted whitespace-nowrap">{timeAgo(entry.created_at)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
