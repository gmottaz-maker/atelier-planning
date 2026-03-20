import { useState, useEffect } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useAuth } from './_app'

const PINK = '#FF4D6D'
const PERSON_COLORS = {
  Arnaud: '#3b82f6',
  Gabin: '#8b5cf6',
  Guillaume: '#FF4D6D',
}

const ACTION_LABELS = {
  task_completed:   { emoji: '✅', label: 'a terminé',           color: '#16a34a' },
  task_uncompleted: { emoji: '↩️',  label: 'a réouvert',          color: '#ea580c' },
  task_created:     { emoji: '✨', label: 'a créé la tâche',     color: '#3b82f6' },
  task_updated:     { emoji: '✏️', label: 'a modifié',            color: '#6b7280' },
  task_deleted:     { emoji: '🗑️', label: 'a supprimé',           color: '#ef4444' },
  project_created:  { emoji: '🚀', label: 'a créé le projet',    color: '#8b5cf6' },
  project_updated:  { emoji: '🔧', label: 'a mis à jour',        color: '#6b7280' },
  project_deleted:  { emoji: '🗑️', label: 'a supprimé le projet', color: '#ef4444' },
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
    const day = e.created_at.split('T')[0]
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
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // 'all' | person name

  useEffect(() => {
    fetch('/api/activity')
      .then(r => r.json())
      .then(d => { setEntries(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtered = filter === 'all' ? entries : entries.filter(e => e.actor === filter)
  const grouped  = groupByDay(filtered)

  return (
    <div className="min-h-screen" style={{ background: '#fafafa', fontFamily: 'Inter, sans-serif' }}>
      <Head>
        <title>Activité — Amazing Lab</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <style>{`body { font-family: 'Inter', sans-serif; } * { -webkit-tap-highlight-color: transparent; }`}</style>
      </Head>

      {/* Header */}
      <header className="sticky top-0 z-10 bg-white border-b" style={{ borderColor: '#f0f0f0' }}>
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg width="22" height="22" viewBox="0 0 40 40" fill="none">
              <ellipse cx="20" cy="20" rx="18" ry="7" stroke={PINK} strokeWidth="2" fill="none" />
              <ellipse cx="20" cy="20" rx="18" ry="7" stroke={PINK} strokeWidth="2" fill="none" transform="rotate(60 20 20)" />
              <ellipse cx="20" cy="20" rx="18" ry="7" stroke={PINK} strokeWidth="2" fill="none" transform="rotate(120 20 20)" />
              <circle cx="20" cy="20" r="3" fill={PINK} />
            </svg>
            <span className="font-bold text-gray-900 text-sm">Activité</span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/" className="text-xs text-gray-400 px-2 py-1 rounded-full border border-gray-200 hover:border-gray-400 transition-colors">Admin</Link>
            <Link href="/tasks" className="text-xs text-gray-400 px-2 py-1 rounded-full border border-gray-200 hover:border-gray-400 transition-colors">Tâches</Link>
            {user && (
              <button onClick={signOut}
                className="px-3 py-1 rounded-full text-xs font-semibold text-white"
                style={{ background: PERSON_COLORS[user.name] || PINK }}>
                {user.name}
              </button>
            )}
          </div>
        </div>

        {/* Filtre par personne */}
        <div className="max-w-3xl mx-auto px-4 pb-3 flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {['all', 'Arnaud', 'Gabin', 'Guillaume'].map(p => (
            <button key={p} onClick={() => setFilter(p)}
              className="px-3 py-1 rounded-full text-xs font-medium flex-shrink-0 transition-all"
              style={filter === p
                ? { background: p === 'all' ? '#111' : PERSON_COLORS[p], color: 'white' }
                : { background: '#f3f4f6', color: '#6b7280' }}>
              {p === 'all' ? 'Tous' : p}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {loading ? (
          <div className="text-center py-20 text-gray-400 text-sm">Chargement...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-gray-400 text-sm">Aucune activité enregistrée</p>
          </div>
        ) : (
          <div className="space-y-8">
            {grouped.map(([day, dayEntries]) => (
              <div key={day}>
                {/* Séparateur jour */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1 h-px bg-gray-100" />
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">
                    {formatDay(day)}
                  </span>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>

                {/* Entrées du jour */}
                <div className="space-y-2">
                  {dayEntries.map(entry => {
                    const meta = ACTION_LABELS[entry.action] || { emoji: '•', label: entry.action, color: '#6b7280' }
                    const personColor = PERSON_COLORS[entry.actor] || '#64748b'
                    return (
                      <div key={entry.id}
                        className="bg-white rounded-2xl border flex items-start gap-3 px-4 py-3"
                        style={{ borderColor: '#f3f4f6' }}>
                        {/* Avatar */}
                        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold mt-0.5"
                          style={{ background: personColor }}>
                          {entry.actor?.[0] || '?'}
                        </div>

                        {/* Contenu */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900 leading-snug">
                            <span className="font-semibold" style={{ color: personColor }}>{entry.actor}</span>
                            {' '}
                            <span className="text-gray-500">{meta.label}</span>
                            {entry.entity_name && (
                              <>
                                {' '}
                                <span className="font-medium text-gray-900">«{entry.entity_name}»</span>
                              </>
                            )}
                          </p>
                          {entry.metadata?.responsible && entry.entity_type === 'task' && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              Responsable : <span className="font-medium" style={{ color: PERSON_COLORS[entry.metadata.responsible] || '#6b7280' }}>{entry.metadata.responsible}</span>
                            </p>
                          )}
                          {entry.metadata?.client && (
                            <p className="text-xs text-gray-400 mt-0.5">Client : {entry.metadata.client}</p>
                          )}
                        </div>

                        {/* Time + emoji */}
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <span className="text-base">{meta.emoji}</span>
                          <span className="text-xs text-gray-300 whitespace-nowrap">{timeAgo(entry.created_at)}</span>
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
