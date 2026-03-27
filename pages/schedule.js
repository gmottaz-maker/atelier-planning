import { useState, useEffect, useCallback } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useAuth } from './_app'

const PINK = '#FF4D6D'
const ADMIN_USER = 'Guillaume'
const KNOWN_USERS = ['Arnaud', 'Gabin', 'Guillaume']

const TYPES = {
  WORK:     { label: 'Travail',  color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe', icon: '⏱' },
  VACATION: { label: 'Congé',   color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', icon: '🏖' },
  SICK:     { label: 'Maladie', color: '#ea580c', bg: '#fff7ed', border: '#fed7aa', icon: '🤒' },
}

const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const DAYS_FR   = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim']

// ─── Date helpers ────────────────────────────────────────────────────────────

function addDays(d, n) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}
function startOfWeek(d) {
  const r = new Date(d)
  const day = r.getDay()
  const diff = day === 0 ? -6 : 1 - day
  r.setDate(r.getDate() + diff)
  r.setHours(0, 0, 0, 0)
  return r
}
function dateStr(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function isToday(d) { return dateStr(d) === dateStr(new Date()) }
function isFuture(d) { return dateStr(d) > dateStr(new Date()) }
function getWeekDays(monday) {
  return Array.from({ length: 5 }, (_, i) => addDays(monday, i))
}
function getMonthGrid(year, month) {
  const first = new Date(year, month, 1)
  const last  = new Date(year, month + 1, 0)
  const start = startOfWeek(first)
  const days  = []
  let cur = new Date(start)
  while (cur <= last || days.length % 7 !== 0) {
    days.push(new Date(cur))
    cur = addDays(cur, 1)
    if (days.length > 42) break
  }
  return days
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

// ─── API helpers ─────────────────────────────────────────────────────────────

async function apiFetch(path, options = {}) {
  const r = await fetch(path, options)
  if (!r.ok) {
    const txt = await r.text()
    throw new Error(txt)
  }
  return r.json()
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function SchedulePage() {
  const { user } = useAuth()
  const isAdmin = user?.name === ADMIN_USER

  // View state
  const [view, setView]           = useState('week')
  const [currentDate, setCurrentDate] = useState(new Date())

  // Admin: selected user (null = self)
  const [selectedUser, setSelectedUser] = useState(null)

  const effectiveUser = selectedUser || user?.name || ''
  const year = currentDate.getFullYear()

  // Data
  const [entries, setEntries]     = useState([])
  const [settings, setSettings]   = useState({ vacation_days: 20, weekly_hours: 42.0 })
  const [allSettings, setAllSettings] = useState([]) // admin overview
  const [loading, setLoading]     = useState(false)

  // Modal – day entry
  const [modal, setModal]         = useState(null) // { date }
  const [formType, setFormType]   = useState('WORK')
  const [formHours, setFormHours] = useState('')
  const [formNote, setFormNote]   = useState('')
  const [saving, setSaving]       = useState(false)

  // Modal – settings
  const [settingsOpen, setSettingsOpen]   = useState(false)
  const [setVacation, setSetVacation]     = useState(20)
  const [setWeeklyH, setSetWeeklyH]       = useState(42.0)
  const [settingsSaving, setSettingsSaving] = useState(false)

  // ── Load entries for full year ────────────────────────────────────────────
  const loadEntries = useCallback(async () => {
    if (!effectiveUser) return
    setLoading(true)
    try {
      const data = await apiFetch(
        `/api/work-entries?userName=${encodeURIComponent(effectiveUser)}&from=${year}-01-01&to=${year}-12-31`
      )
      setEntries(data)
    } catch (e) {
      console.error('loadEntries', e)
    } finally {
      setLoading(false)
    }
  }, [effectiveUser, year])

  const loadSettings = useCallback(async () => {
    if (!effectiveUser) return
    try {
      const data = await apiFetch(
        `/api/work-settings?userName=${encodeURIComponent(effectiveUser)}&year=${year}`
      )
      setSettings(data)
      setSetVacation(data.vacation_days)
      setSetWeeklyH(data.weekly_hours)
    } catch (e) {
      console.error('loadSettings', e)
    }
  }, [effectiveUser, year])

  const loadAllSettings = useCallback(async () => {
    if (!isAdmin) return
    try {
      const data = await apiFetch(`/api/work-settings?year=${year}`)
      setAllSettings(data)
    } catch (e) {
      console.error('loadAllSettings', e)
    }
  }, [isAdmin, year])

  useEffect(() => { loadEntries() }, [loadEntries])
  useEffect(() => { loadSettings() }, [loadSettings])
  useEffect(() => { loadAllSettings() }, [loadAllSettings])

  // ── Index entries by date ─────────────────────────────────────────────────
  const byDate = {}
  entries.forEach(e => {
    if (!byDate[e.date]) byDate[e.date] = {}
    byDate[e.date][e.type] = e
  })

  // ── Year stats ────────────────────────────────────────────────────────────
  const workEntries    = entries.filter(e => e.type === 'WORK')
  const workedHours    = workEntries.reduce((s, e) => s + (parseFloat(e.hours) || 0), 0)
  const vacationTaken  = entries.filter(e => e.type === 'VACATION').length
  const sickDays       = entries.filter(e => e.type === 'SICK').length
  const dailyTarget    = settings.weekly_hours / 5
  const overtime       = workedHours - workEntries.length * dailyTarget
  const vacationLeft   = settings.vacation_days - vacationTaken

  // This week hours
  const thisMonday   = startOfWeek(new Date())
  const thisWeekDays = getWeekDays(thisMonday)
  const thisWeekH    = thisWeekDays.reduce((s, d) => {
    const e = byDate[dateStr(d)]?.WORK
    return s + (parseFloat(e?.hours) || 0)
  }, 0)

  // ── Navigation ────────────────────────────────────────────────────────────
  function prevPeriod() {
    if (view === 'week') setCurrentDate(d => addDays(d, -7))
    else setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))
  }
  function nextPeriod() {
    if (view === 'week') setCurrentDate(d => addDays(d, 7))
    else setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))
  }
  function goToday() { setCurrentDate(new Date()) }

  // Period label
  let periodLabel = ''
  if (view === 'week') {
    const mon = startOfWeek(currentDate)
    const fri = addDays(mon, 4)
    periodLabel = `${mon.getDate()}.${mon.getMonth()+1} – ${fri.getDate()}.${fri.getMonth()+1}.${fri.getFullYear()}`
  } else {
    periodLabel = `${MONTHS_FR[currentDate.getMonth()]} ${currentDate.getFullYear()}`
  }

  // ── Open day modal ────────────────────────────────────────────────────────
  function openDay(ds) {
    if (isFuture(parseDate(ds))) return // pas d'entrée dans le futur
    const existing = byDate[ds]
    // prefer WORK, else VACATION, else SICK
    const entry = existing?.WORK || existing?.VACATION || existing?.SICK
    setFormType(entry?.type || 'WORK')
    setFormHours(entry?.hours != null ? String(entry.hours) : dailyTarget.toFixed(1))
    setFormNote(entry?.note || '')
    setModal({ date: ds, entry: entry || null })
  }

  // ── Save entry ────────────────────────────────────────────────────────────
  async function saveEntry() {
    if (!modal) return
    setSaving(true)
    try {
      await apiFetch('/api/work-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userName: effectiveUser,
          date:     modal.date,
          type:     formType,
          hours:    formType === 'WORK' ? formHours : null,
          note:     formNote || null,
        }),
      })
      await loadEntries()
      setModal(null)
    } finally {
      setSaving(false)
    }
  }

  // ── Delete entry ──────────────────────────────────────────────────────────
  async function deleteEntry() {
    if (!modal?.entry?.id) return
    setSaving(true)
    try {
      await apiFetch(
        `/api/work-entries?id=${modal.entry.id}&userName=${encodeURIComponent(effectiveUser)}`,
        { method: 'DELETE' }
      )
      await loadEntries()
      setModal(null)
    } finally {
      setSaving(false)
    }
  }

  // ── Save settings ─────────────────────────────────────────────────────────
  async function saveSettings() {
    setSettingsSaving(true)
    try {
      await apiFetch('/api/work-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userName:     effectiveUser,
          year,
          vacation_days: parseInt(setVacation),
          weekly_hours:  parseFloat(setWeeklyH),
        }),
      })
      await loadSettings()
      setSettingsOpen(false)
    } finally {
      setSettingsSaving(false)
    }
  }

  // ── Week view ─────────────────────────────────────────────────────────────
  const monday   = startOfWeek(currentDate)
  const weekDays = getWeekDays(monday)
  const weekH    = weekDays.reduce((s, d) => s + (parseFloat(byDate[dateStr(d)]?.WORK?.hours) || 0), 0)

  // ── Month view ────────────────────────────────────────────────────────────
  const monthGrid = getMonthGrid(currentDate.getFullYear(), currentDate.getMonth())

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: '#fafafa', fontFamily: 'Inter, sans-serif' }}>
      <Head>
        <title>Horaires — Maze Project</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <style>{`
          * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
          body { margin: 0; }
          .day-cell { transition: background 0.1s; }
          .day-cell:hover { background: #f8f8f8; }
          input:focus, select:focus { outline: none; border-color: ${PINK} !important; box-shadow: 0 0 0 3px ${PINK}22 !important; }
          input { font-size: 16px !important; }
          @media (max-width: 640px) { .week-grid { overflow-x: auto; } }
        `}</style>
      </Head>

      {/* ── Header ── */}
      <header className="sticky top-0 z-20 bg-white border-b" style={{ borderColor: '#f0f0f0' }}>
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" style={{ textDecoration: 'none' }}>
              <Logo />
            </Link>
            <span className="font-bold text-gray-900 text-sm">horaires</span>
            {loading && (
              <span className="text-xs text-gray-400 animate-pulse">chargement…</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Link href="/" style={{ textDecoration: 'none', color: '#6b7280', fontSize: 13 }}>projets</Link>
            <Link href="/tasks" style={{ textDecoration: 'none', color: '#6b7280', fontSize: 13, marginLeft: 12 }}>tâches</Link>
            {/* Settings gear */}
            <button
              onClick={() => setSettingsOpen(true)}
              className="ml-3 flex items-center gap-1 px-2 py-1 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
              title="Paramètres horaires"
              style={{ fontSize: 18 }}
            >
              ⚙️
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-5">

        {/* ── Stats cards ── */}
        <div className="grid gap-3 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
          <StatCard
            icon="🏖"
            label="Congés restants"
            value={vacationLeft}
            sub={`/ ${settings.vacation_days} jours`}
            color={vacationLeft > 5 ? '#16a34a' : vacationLeft > 0 ? '#ea580c' : '#dc2626'}
          />
          <StatCard
            icon="⏱"
            label="Semaine en cours"
            value={`${thisWeekH.toFixed(1)}h`}
            sub={`/ ${settings.weekly_hours}h`}
            color={thisWeekH >= settings.weekly_hours ? '#16a34a' : '#2563eb'}
          />
          <StatCard
            icon="📊"
            label={overtime >= 0 ? 'Heures sup' : 'Heures manq.'}
            value={`${overtime >= 0 ? '+' : ''}${overtime.toFixed(1)}h`}
            sub={`${workedHours.toFixed(1)}h travaillées`}
            color={overtime >= 0 ? '#16a34a' : '#ea580c'}
          />
          <StatCard
            icon="🤒"
            label="Maladie"
            value={sickDays}
            sub={sickDays === 1 ? 'jour cette année' : 'jours cette année'}
            color={sickDays > 0 ? '#ea580c' : '#6b7280'}
          />
        </div>

        {/* ── Controls bar ── */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            {/* Admin user switcher */}
            {isAdmin && (
              <select
                value={selectedUser || ''}
                onChange={e => setSelectedUser(e.target.value || null)}
                className="text-sm border rounded-lg px-3 py-1.5"
                style={{ borderColor: '#e5e7eb', color: '#374151' }}
              >
                <option value="">Moi ({user?.name})</option>
                {KNOWN_USERS.filter(u => u !== user?.name).map(u => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            )}
            {/* View toggle */}
            <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: '#e5e7eb' }}>
              {['week', 'month'].map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className="px-3 py-1.5 text-sm font-medium transition-colors"
                  style={{
                    background: view === v ? PINK : 'white',
                    color: view === v ? 'white' : '#6b7280',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {v === 'week' ? 'Semaine' : 'Mois'}
                </button>
              ))}
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-2">
            <button
              onClick={prevPeriod}
              className="w-8 h-8 flex items-center justify-center rounded-lg border text-gray-600 hover:bg-gray-50"
              style={{ borderColor: '#e5e7eb' }}
            >
              ‹
            </button>
            <button
              onClick={goToday}
              className="px-3 py-1 text-sm rounded-lg border font-medium"
              style={{ borderColor: '#e5e7eb', color: '#374151' }}
            >
              Aujourd'hui
            </button>
            <span className="text-sm font-semibold text-gray-700 min-w-[180px] text-center">
              {periodLabel}
            </span>
            <button
              onClick={nextPeriod}
              className="w-8 h-8 flex items-center justify-center rounded-lg border text-gray-600 hover:bg-gray-50"
              style={{ borderColor: '#e5e7eb' }}
            >
              ›
            </button>
          </div>
        </div>

        {/* ── Week View ── */}
        {view === 'week' && (
          <div className="week-grid">
            <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#e5e7eb' }}>
              {/* Week header */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', borderBottom: '1px solid #f0f0f0' }}>
                {weekDays.map((d, i) => {
                  const ds = dateStr(d)
                  const today = isToday(d)
                  return (
                    <div
                      key={i}
                      className="text-center py-3 px-2"
                      style={{ borderRight: i < 4 ? '1px solid #f0f0f0' : 'none' }}
                    >
                      <div className="text-xs font-medium text-gray-400 mb-1">{DAYS_FR[i]}</div>
                      <div
                        className="text-sm font-bold mx-auto flex items-center justify-center w-7 h-7 rounded-full"
                        style={{
                          background: today ? PINK : 'transparent',
                          color: today ? 'white' : '#111',
                        }}
                      >
                        {d.getDate()}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Week cells */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', minHeight: 180 }}>
                {weekDays.map((d, i) => {
                  const ds = dateStr(d)
                  const future = isFuture(d)
                  const dayEntries = byDate[ds] || {}
                  const work    = dayEntries.WORK
                  const vacation = dayEntries.VACATION
                  const sick    = dayEntries.SICK

                  return (
                    <div
                      key={i}
                      className="day-cell p-2"
                      onClick={() => !future && openDay(ds)}
                      style={{
                        borderRight: i < 4 ? '1px solid #f8f8f8' : 'none',
                        cursor: future ? 'default' : 'pointer',
                        opacity: future ? 0.4 : 1,
                        minHeight: 120,
                      }}
                    >
                      {/* Entry chips */}
                      <div className="flex flex-col gap-1.5 mt-1">
                        {work && (
                          <EntryChip type="WORK" hours={work.hours} note={work.note} />
                        )}
                        {vacation && (
                          <EntryChip type="VACATION" note={vacation.note} />
                        )}
                        {sick && (
                          <EntryChip type="SICK" note={sick.note} />
                        )}
                        {!work && !vacation && !sick && !future && (
                          <div className="text-xs text-gray-300 text-center mt-4">+</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Week footer – total */}
              <div className="border-t px-4 py-2 flex items-center justify-between" style={{ borderColor: '#f0f0f0' }}>
                <span className="text-xs text-gray-500">Total semaine</span>
                <span
                  className="text-sm font-bold"
                  style={{ color: weekH >= settings.weekly_hours ? '#16a34a' : weekH > 0 ? '#ea580c' : '#d1d5db' }}
                >
                  {weekH.toFixed(1)}h <span className="font-normal text-gray-400">/ {settings.weekly_hours}h</span>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── Month View ── */}
        {view === 'month' && (
          <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#e5e7eb' }}>
            {/* Day headers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid #f0f0f0' }}>
              {DAYS_FR.map(d => (
                <div key={d} className="text-center py-2 text-xs font-medium text-gray-400">{d}</div>
              ))}
            </div>
            {/* Month grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
              {monthGrid.map((d, i) => {
                const ds   = dateStr(d)
                const inMonth = d.getMonth() === currentDate.getMonth()
                const today   = isToday(d)
                const future  = isFuture(d)
                const weekend = d.getDay() === 0 || d.getDay() === 6
                const dayEntries = byDate[ds] || {}
                const work    = dayEntries.WORK
                const vacation = dayEntries.VACATION
                const sick    = dayEntries.SICK

                return (
                  <div
                    key={i}
                    className="day-cell p-1.5"
                    onClick={() => inMonth && !future && !weekend && openDay(ds)}
                    style={{
                      borderRight: (i + 1) % 7 !== 0 ? '1px solid #f8f8f8' : 'none',
                      borderBottom: i < monthGrid.length - 7 ? '1px solid #f8f8f8' : 'none',
                      minHeight: 72,
                      background: weekend ? '#fafafa' : 'white',
                      opacity: !inMonth ? 0.25 : future ? 0.5 : 1,
                      cursor: inMonth && !future && !weekend ? 'pointer' : 'default',
                    }}
                  >
                    <div
                      className="text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full mx-auto"
                      style={{
                        background: today ? PINK : 'transparent',
                        color: today ? 'white' : weekend ? '#9ca3af' : '#374151',
                      }}
                    >
                      {d.getDate()}
                    </div>
                    {/* Type dots */}
                    <div className="flex flex-col gap-0.5 px-0.5">
                      {work && (
                        <div className="rounded text-center text-xs font-medium px-1 py-0.5 truncate"
                          style={{ background: TYPES.WORK.bg, color: TYPES.WORK.color, fontSize: 10 }}>
                          {work.hours ? `${work.hours}h` : 'Travail'}
                        </div>
                      )}
                      {vacation && (
                        <div className="rounded text-center text-xs font-medium px-1 py-0.5"
                          style={{ background: TYPES.VACATION.bg, color: TYPES.VACATION.color, fontSize: 10 }}>
                          Congé
                        </div>
                      )}
                      {sick && (
                        <div className="rounded text-center text-xs font-medium px-1 py-0.5"
                          style={{ background: TYPES.SICK.bg, color: TYPES.SICK.color, fontSize: 10 }}>
                          Maladie
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Admin overview ── */}
        {isAdmin && allSettings.length > 0 && (
          <div className="mt-8">
            <h3 className="text-sm font-semibold text-gray-500 mb-3 uppercase tracking-wide">Vue équipe — {year}</h3>
            <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#e5e7eb' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                    {['Collaborateur', 'Contrat', 'Congés alloués', 'Congés pris', 'Solde', 'Maladie'].map(h => (
                      <th key={h} className="text-left px-4 py-2 text-xs font-semibold text-gray-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {KNOWN_USERS.map(uname => {
                    const s = allSettings.find(x => x.user_name === uname)
                    if (!s) return null
                    return (
                      <tr key={uname} style={{ borderBottom: '1px solid #f8f8f8' }}>
                        <td className="px-4 py-2.5 font-medium text-gray-800">{uname}</td>
                        <td className="px-4 py-2.5 text-gray-500">{s.weekly_hours}h/sem</td>
                        <td className="px-4 py-2.5 text-gray-500">{s.vacation_days}j</td>
                        <td className="px-4 py-2.5 text-gray-500">—</td>
                        <td className="px-4 py-2.5 font-semibold" style={{ color: PINK }}>—</td>
                        <td className="px-4 py-2.5 text-gray-500">—</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Day entry modal ── */}
      {modal && (
        <Modal onClose={() => setModal(null)}>
          <h3 className="font-bold text-gray-900 mb-1">
            {(() => {
              const d = parseDate(modal.date)
              return `${DAYS_FR[d.getDay() === 0 ? 6 : d.getDay() - 1]} ${d.getDate()} ${MONTHS_FR[d.getMonth()]}`
            })()}
          </h3>
          <p className="text-xs text-gray-400 mb-4">
            {effectiveUser} · {year}
          </p>

          {/* Type selector */}
          <div className="flex gap-2 mb-4">
            {Object.entries(TYPES).map(([t, cfg]) => (
              <button
                key={t}
                onClick={() => setFormType(t)}
                className="flex-1 flex flex-col items-center py-2.5 rounded-xl border-2 transition-all text-sm font-medium"
                style={{
                  borderColor: formType === t ? cfg.color : '#e5e7eb',
                  background:  formType === t ? cfg.bg : 'white',
                  color:       formType === t ? cfg.color : '#6b7280',
                }}
              >
                <span style={{ fontSize: 18 }}>{cfg.icon}</span>
                <span style={{ fontSize: 11, marginTop: 2 }}>{cfg.label}</span>
              </button>
            ))}
          </div>

          {/* Hours input (only for WORK) */}
          {formType === 'WORK' && (
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-500 mb-1">Heures travaillées</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="24"
                  step="0.5"
                  value={formHours}
                  onChange={e => setFormHours(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-gray-900"
                  style={{ borderColor: '#e5e7eb' }}
                />
                <span className="text-sm text-gray-400">h</span>
              </div>
              <div className="flex gap-2 mt-2">
                {[dailyTarget.toFixed(1), '8', '4'].map(v => (
                  <button
                    key={v}
                    onClick={() => setFormHours(v)}
                    className="px-2 py-1 text-xs rounded-md border"
                    style={{
                      borderColor: formHours === v ? PINK : '#e5e7eb',
                      color:       formHours === v ? PINK : '#6b7280',
                      background:  formHours === v ? `${PINK}11` : 'white',
                    }}
                  >
                    {v}h
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Note */}
          <div className="mb-5">
            <label className="block text-xs font-medium text-gray-500 mb-1">Note (optionnel)</label>
            <input
              type="text"
              placeholder="Ex: arrêt médical, formation…"
              value={formNote}
              onChange={e => setFormNote(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-gray-900"
              style={{ borderColor: '#e5e7eb' }}
            />
          </div>

          <div className="flex gap-2">
            {modal.entry && (
              <button
                onClick={deleteEntry}
                disabled={saving}
                className="px-4 py-2 rounded-xl border text-sm font-medium"
                style={{ borderColor: '#fca5a5', color: '#dc2626', background: '#fff5f5' }}
              >
                Supprimer
              </button>
            )}
            <button
              onClick={() => setModal(null)}
              className="flex-1 px-4 py-2 rounded-xl border text-sm font-medium text-gray-600"
              style={{ borderColor: '#e5e7eb' }}
            >
              Annuler
            </button>
            <button
              onClick={saveEntry}
              disabled={saving}
              className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold text-white"
              style={{ background: PINK, opacity: saving ? 0.7 : 1 }}
            >
              {saving ? '…' : 'Enregistrer'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Settings modal ── */}
      {settingsOpen && (
        <Modal onClose={() => setSettingsOpen(false)}>
          <h3 className="font-bold text-gray-900 mb-1">Paramètres horaires</h3>
          <p className="text-xs text-gray-400 mb-4">{effectiveUser} · {year}</p>

          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Jours de congé annuels
            </label>
            <input
              type="number"
              min="0"
              max="60"
              value={setVacation}
              onChange={e => setSetVacation(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-gray-900"
              style={{ borderColor: '#e5e7eb' }}
            />
          </div>

          <div className="mb-5">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Heures contractuelles / semaine
            </label>
            <input
              type="number"
              min="1"
              max="80"
              step="0.1"
              value={setWeeklyH}
              onChange={e => setSetWeeklyH(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-gray-900"
              style={{ borderColor: '#e5e7eb' }}
            />
            <p className="text-xs text-gray-400 mt-1">
              → {(parseFloat(setWeeklyH) / 5).toFixed(1)}h par jour · Ex: 42h (100%), 33.6h (80%), 21h (50%)
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setSettingsOpen(false)}
              className="flex-1 px-4 py-2 rounded-xl border text-sm font-medium text-gray-600"
              style={{ borderColor: '#e5e7eb' }}
            >
              Annuler
            </button>
            <button
              onClick={saveSettings}
              disabled={settingsSaving}
              className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold text-white"
              style={{ background: PINK, opacity: settingsSaving ? 0.7 : 1 }}
            >
              {settingsSaving ? '…' : 'Enregistrer'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, color }) {
  return (
    <div className="bg-white rounded-2xl border p-4" style={{ borderColor: '#e5e7eb' }}>
      <div className="flex items-center gap-2 mb-2">
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span className="text-xs font-medium text-gray-500">{label}</span>
      </div>
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
      <div className="text-xs text-gray-400 mt-0.5">{sub}</div>
    </div>
  )
}

function EntryChip({ type, hours, note }) {
  const cfg = TYPES[type]
  return (
    <div
      className="rounded-lg px-2 py-1.5 text-xs font-medium"
      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
      title={note || cfg.label}
    >
      <div className="flex items-center gap-1">
        <span>{cfg.icon}</span>
        <span>{type === 'WORK' && hours ? `${hours}h` : cfg.label}</span>
      </div>
      {note && <div className="truncate text-gray-400 mt-0.5" style={{ fontSize: 10 }}>{note}</div>}
    </div>
  )
}

function Modal({ children, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-xl"
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
      >
        {children}
      </div>
    </div>
  )
}
