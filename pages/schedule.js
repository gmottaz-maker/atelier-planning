import { useState, useEffect, useCallback } from 'react'
import Head from 'next/head'
import { useAuth } from './_app'
import NavBar from '../components/NavBar'

const PINK = '#FF4D6D'
const ADMIN_USER = 'Guillaume'
const KNOWN_USERS = ['Arnaud', 'Gabin', 'Guillaume']
const DEFAULT_PAUSE = 1.0

const TYPES = {
  WORK:        { label: 'Travail',   color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe', icon: '⏱' },
  VACATION:    { label: 'Congé J',   color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', icon: '🏖' },
  VACATION_AM: { label: '½ Matin',   color: '#0d9488', bg: '#f0fdfa', border: '#99f6e4', icon: '🌅' },
  VACATION_PM: { label: '½ Après-m', color: '#0891b2', bg: '#ecfeff', border: '#a5f3fc', icon: '🌇' },
  SICK:        { label: 'Maladie',   color: '#ea580c', bg: '#fff7ed', border: '#fed7aa', icon: '🤒' },
}
// Types comptant comme demi-journée de congé
const HALF_DAY_TYPES = ['VACATION_AM', 'VACATION_PM']
// Types comptant comme journée entière
const FULL_DAY_VACATION_TYPES = ['VACATION']

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

// ─── API helpers ─────────────────────────────────────────────────────────────

async function apiFetch(path, options = {}) {
  const r = await fetch(path, options)
  if (!r.ok) {
    let msg = `Erreur ${r.status}`
    try { const j = await r.json(); msg = j.error || msg } catch (_) {}
    throw new Error(msg)
  }
  return r.json()
}

// ─── Time helpers ────────────────────────────────────────────────────────────

function timeDiffHours(arrival, departure) {
  if (!arrival || !departure) return 0
  const [ah, am] = arrival.split(':').map(Number)
  const [dh, dm] = departure.split(':').map(Number)
  const diff = (dh * 60 + dm) - (ah * 60 + am)
  return Math.max(0, diff / 60)
}

function addMinutesToTime(time, minutes) {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + Math.round(minutes)
  const nh = Math.floor(total / 60) % 24
  const nm = total % 60
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`
}

// ─── CSV Export ──────────────────────────────────────────────────────────────

function exportCSV(entries, userName, year) {
  const DAY_NAMES = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam']
  const rows = [
    ['Date', 'Jour', 'Type', 'Arrivée', 'Départ', 'Présence (h)', 'Pause (h)', 'Effectif (h)', 'Note'],
  ]
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date))
  sorted.forEach(e => {
    const d = parseDate(e.date)
    const isWork = e.type === 'WORK'
    const presence = isWork ? (parseFloat(e.hours) || 0) : ''
    const pause    = isWork ? (parseFloat(e.pause_hours) ?? DEFAULT_PAUSE) : ''
    const effectif = isWork ? Math.max(0, (parseFloat(e.hours) || 0) - (parseFloat(e.pause_hours) ?? DEFAULT_PAUSE)) : ''
    rows.push([
      e.date,
      DAY_NAMES[d.getDay()],
      TYPES[e.type]?.label || e.type,
      e.arrival_time || '',
      e.departure_time || '',
      presence,
      pause,
      effectif,
      e.note || '',
    ])
  })
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n')
  const bom = '\uFEFF'
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `horaires_${userName}_${year}.csv`
  a.click()
  URL.revokeObjectURL(url)
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
  const [settings, setSettings]   = useState({ vacation_days: 20, weekly_hours: 42.0, off_days: [] })
  const [allSettings, setAllSettings] = useState([]) // admin overview
  const [loading, setLoading]     = useState(false)

  // Modal – day entry
  const [modal, setModal]             = useState(null) // { date, entry }
  const [formType, setFormType]       = useState('WORK')
  const [formArrival, setFormArrival] = useState('08:00')
  const [formDeparture, setFormDeparture] = useState('17:00')
  const [formPause, setFormPause]     = useState(DEFAULT_PAUSE)
  const [formNote, setFormNote]       = useState('')
  const [saving, setSaving]           = useState(false)
  const [saveError, setSaveError]     = useState('')

  // Modal – settings
  const [settingsOpen, setSettingsOpen]   = useState(false)
  const [setVacation, setSetVacation]     = useState(20)
  const [setWeeklyH, setSetWeeklyH]       = useState(42.0)
  const [setOffDays, setSetOffDays]       = useState([])  // days of week that are off (getDay() values)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsError, setSettingsError] = useState('')

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
      setSetOffDays(data.off_days || [])
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

  // ── Effective hours helper ────────────────────────────────────────────────
  function effectiveHours(entry) {
    if (!entry || entry.type !== 'WORK') return 0
    const h = parseFloat(entry.hours) || 0
    const p = parseFloat(entry.pause_hours) ?? DEFAULT_PAUSE
    return Math.max(0, h - p)
  }

  // ── Year stats ────────────────────────────────────────────────────────────
  const offDays        = settings.off_days || []  // e.g. [3] = Wednesday off (JS getDay())
  const workDaysPerWeek = Math.max(1, 5 - offDays.length)
  const dailyTarget    = settings.weekly_hours / workDaysPerWeek

  const workEntries    = entries.filter(e => e.type === 'WORK')
  const workedHours    = workEntries.reduce((s, e) => s + effectiveHours(e), 0)
  const vacationTaken  = entries.filter(e => FULL_DAY_VACATION_TYPES.includes(e.type)).length
                       + entries.filter(e => HALF_DAY_TYPES.includes(e.type)).length * 0.5
  const sickDays       = entries.filter(e => e.type === 'SICK').length
  const vacationLeft   = settings.vacation_days - vacationTaken

  // Hours worked on off-days (Wednesday etc.) → automatically overtime
  const offDayWorkH = workEntries.filter(e => offDays.includes(parseDate(e.date).getDay()))
    .reduce((s, e) => s + effectiveHours(e), 0)

  // Count all past scheduled work days (Mon–Fri minus off_days) where the user
  // had no vacation / sick entry → those are "should have worked" days
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  let expectedWorkDays = 0
  let scan = new Date(year, 0, 1)
  while (scan < todayStart) {
    const dow = scan.getDay()
    if (dow >= 1 && dow <= 5 && !offDays.includes(dow)) {
      const ds = dateStr(scan)
      const hasVac  = ['VACATION','VACATION_AM','VACATION_PM'].some(t => byDate[ds]?.[t])
      const hasSick = !!byDate[ds]?.SICK
      if (!hasVac && !hasSick) expectedWorkDays++
    }
    scan = addDays(scan, 1)
  }

  const expectedHours = expectedWorkDays * dailyTarget
  // overtime: positive = heures sup, negative = rattrapage
  const overtime = workedHours - expectedHours

  // This week hours
  const thisMonday   = startOfWeek(new Date())
  const thisWeekDays = getWeekDays(thisMonday)
  const thisWeekH    = thisWeekDays.reduce((s, d) => {
    const e = byDate[dateStr(d)]?.WORK
    return s + effectiveHours(e)
  }, 0)

  // ── Month stats (for current displayed month) ─────────────────────────────
  const displayMonth = currentDate.getMonth()
  const displayYear  = currentDate.getFullYear()
  const monthEntries = entries.filter(e => {
    const d = parseDate(e.date)
    return d.getFullYear() === displayYear && d.getMonth() === displayMonth
  })
  const monthWorkH    = monthEntries.filter(e => e.type === 'WORK').reduce((s, e) => s + effectiveHours(e), 0)
  const monthVacDays  = monthEntries.filter(e => FULL_DAY_VACATION_TYPES.includes(e.type)).length
                      + monthEntries.filter(e => HALF_DAY_TYPES.includes(e.type)).length * 0.5
  const monthSickDays = monthEntries.filter(e => e.type === 'SICK').length
  const monthWorkDays = monthEntries.filter(e => e.type === 'WORK').length
  // Expected work hours for the month (based on working days actually logged)
  const monthTarget   = monthWorkDays * dailyTarget

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
  function populateFormForType(t, existing) {
    const entry = existing?.[t] || null
    const defaultArrival   = '08:00'
    const defaultPresenceH = dailyTarget + DEFAULT_PAUSE
    const defaultDeparture = addMinutesToTime(defaultArrival, defaultPresenceH * 60)

    setFormType(t)
    setFormPause(entry?.pause_hours != null ? parseFloat(entry.pause_hours) : DEFAULT_PAUSE)
    setFormNote(entry?.note || '')
    setSaveError('')

    if (t === 'WORK') {
      const arrival   = entry?.arrival_time   || defaultArrival
      const departure = entry?.departure_time || addMinutesToTime(arrival, (parseFloat(entry?.hours) || defaultPresenceH) * 60)
      setFormArrival(arrival)
      setFormDeparture(departure)
    } else {
      setFormArrival(defaultArrival)
      setFormDeparture(defaultDeparture)
    }
    return entry
  }

  function openDay(ds) {
    const d = parseDate(ds)
    if (d.getDay() === 0 || d.getDay() === 6) return
    const existing = byDate[ds]

    // Pick the best existing entry to display first
    const firstEntry = existing?.WORK || existing?.VACATION || existing?.VACATION_AM || existing?.VACATION_PM || existing?.SICK
    const defaultType = isFuture(d) ? 'VACATION' : (firstEntry?.type || 'WORK')

    const entry = populateFormForType(defaultType, existing)
    setModal({ date: ds, entry: entry || null })
  }

  // Switch type in modal (loads existing entry for that type if any)
  function switchModalType(t) {
    if (!modal) return
    const existing = byDate[modal.date]
    const entry = populateFormForType(t, existing)
    setModal(m => ({ ...m, entry: entry || null }))
  }

  // ── Save entry ────────────────────────────────────────────────────────────
  async function saveEntry() {
    if (!modal) return
    if (!effectiveUser) { setSaveError('Utilisateur non identifié'); return }

    const presenceH = formType === 'WORK' ? timeDiffHours(formArrival, formDeparture) : null

    if (formType === 'WORK' && presenceH <= 0) {
      setSaveError("L'heure de départ doit être après l'heure d'arrivée")
      return
    }

    setSaving(true)
    setSaveError('')
    try {
      await apiFetch('/api/work-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userName:       effectiveUser,
          date:           modal.date,
          type:           formType,
          hours:          presenceH,
          pause_hours:    formType === 'WORK' ? formPause : null,
          arrival_time:   formType === 'WORK' ? formArrival : null,
          departure_time: formType === 'WORK' ? formDeparture : null,
          note:           formNote || null,
        }),
      })
      await loadEntries()
      setModal(null)
    } catch (e) {
      setSaveError(e.message || 'Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  // ── Delete entry ──────────────────────────────────────────────────────────
  async function deleteEntry() {
    if (!modal?.entry?.id) return
    setSaving(true)
    setSaveError('')
    try {
      await apiFetch(
        `/api/work-entries?id=${modal.entry.id}&userName=${encodeURIComponent(effectiveUser)}`,
        { method: 'DELETE' }
      )
      await loadEntries()
      setModal(null)
    } catch (e) {
      setSaveError(e.message || 'Erreur lors de la suppression')
    } finally {
      setSaving(false)
    }
  }

  // ── Save settings ─────────────────────────────────────────────────────────
  async function saveSettings() {
    setSettingsSaving(true)
    setSettingsError('')
    try {
      await apiFetch('/api/work-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userName:     effectiveUser,
          year,
          vacation_days: parseInt(setVacation),
          weekly_hours:  parseFloat(setWeeklyH),
          off_days:      setOffDays,
        }),
      })
      await loadSettings()
      setSettingsOpen(false)
    } catch (e) {
      setSettingsError(e.message || 'Erreur lors de la sauvegarde')
    } finally {
      setSettingsSaving(false)
    }
  }

  // ── Week view ─────────────────────────────────────────────────────────────
  const monday   = startOfWeek(currentDate)
  const weekDays = getWeekDays(monday)
  const weekH    = weekDays.reduce((s, d) => s + effectiveHours(byDate[dateStr(d)]?.WORK), 0)

  // ── Month view ────────────────────────────────────────────────────────────
  const monthGrid = getMonthGrid(currentDate.getFullYear(), currentDate.getMonth())

  // Computed effective hours for form display
  const formPresence  = formType === 'WORK' ? timeDiffHours(formArrival, formDeparture) : 0
  const formEffective = formType === 'WORK'
    ? Math.max(0, formPresence - (parseFloat(formPause) || 0))
    : null

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: '#fafafa', fontFamily: 'Inter, sans-serif' }}>
      <Head>
        <title>Horaires — Atelier Planning</title>
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

      {/* ── NavBar ── */}
      <NavBar title="horaires">
        {loading && <span className="text-xs text-gray-400 animate-pulse mr-1">…</span>}
        <button
          onClick={() => exportCSV(entries, effectiveUser, year)}
          className="w-8 h-8 flex items-center justify-center rounded-full border transition-colors text-sm"
          style={{ borderColor: '#e5e7eb', color: '#6b7280' }}
          title="Exporter CSV"
        >
          ⬇
        </button>
        <button
          onClick={() => { setSettingsError(''); setSettingsOpen(true) }}
          className="w-8 h-8 flex items-center justify-center rounded-full border transition-colors text-sm"
          style={{ borderColor: '#e5e7eb', color: '#6b7280' }}
          title="Paramètres horaires"
        >
          ⚙️
        </button>
      </NavBar>

      <div className="max-w-5xl mx-auto px-4 py-5">

        {/* ── Stats cards ── */}
        <div className="grid gap-3 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
          <StatCard
            icon="🏖"
            label="Congés restants"
            value={vacationLeft % 1 === 0 ? vacationLeft : vacationLeft.toFixed(1)}
            sub={`pris: ${vacationTaken % 1 === 0 ? vacationTaken : vacationTaken.toFixed(1)}j / ${settings.vacation_days}j`}
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
            icon={overtime >= 0 ? '📈' : '📉'}
            label={overtime >= 0 ? 'Heures sup' : 'Rattrapage'}
            value={`${overtime >= 0 ? '+' : ''}${overtime.toFixed(1)}h`}
            sub={`${workedHours.toFixed(1)}h / ${expectedHours.toFixed(0)}h attendues`}
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
                  const today  = isToday(d)
                  const isOff  = offDays.includes(d.getDay())
                  return (
                    <div
                      key={i}
                      className="text-center py-3 px-2"
                      style={{
                        borderRight: i < 4 ? '1px solid #f0f0f0' : 'none',
                        background: isOff ? '#f9fafb' : 'white',
                      }}
                    >
                      <div className="text-xs font-medium mb-1" style={{ color: isOff ? '#d1d5db' : '#9ca3af' }}>
                        {DAYS_FR[i]}{isOff ? ' ·off' : ''}
                      </div>
                      <div
                        className="text-sm font-bold mx-auto flex items-center justify-center w-7 h-7 rounded-full"
                        style={{
                          background: today ? PINK : 'transparent',
                          color: today ? 'white' : isOff ? '#d1d5db' : '#111',
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
                  const ds       = dateStr(d)
                  const future   = isFuture(d)
                  const isOff    = offDays.includes(d.getDay())
                  const dayEntries = byDate[ds] || {}
                  const work     = dayEntries.WORK
                  const vacation = dayEntries.VACATION
                  const vacAM    = dayEntries.VACATION_AM
                  const vacPM    = dayEntries.VACATION_PM
                  const sick     = dayEntries.SICK
                  const hasAny   = work || vacation || vacAM || vacPM || sick
                  // Work on an off day = overtime marker
                  const hasOT    = isOff && !!work

                  return (
                    <div
                      key={i}
                      className="day-cell p-2"
                      onClick={() => openDay(ds)}
                      style={{
                        borderRight: i < 4 ? '1px solid #f8f8f8' : 'none',
                        cursor: 'pointer',
                        background: isOff ? '#f9fafb' : 'white',
                        opacity: future ? 0.55 : 1,
                        minHeight: 120,
                      }}
                    >
                      {isOff && !hasAny && (
                        <div className="text-center mt-4">
                          <div className="text-xs font-medium" style={{ color: '#d1d5db' }}>Jour off</div>
                          <div className="text-xs" style={{ color: '#e5e7eb', marginTop: 2 }}>⚡ + OT</div>
                        </div>
                      )}
                      <div className="flex flex-col gap-1.5 mt-1">
                        {work && (
                          <EntryChip type="WORK" hours={effectiveHours(work)} arrival={work.arrival_time} departure={work.departure_time} note={work.note} overtime={hasOT} />
                        )}
                        {vacation && <EntryChip type="VACATION" note={vacation.note} />}
                        {vacAM    && <EntryChip type="VACATION_AM" note={vacAM.note} />}
                        {vacPM    && <EntryChip type="VACATION_PM" note={vacPM.note} />}
                        {sick     && <EntryChip type="SICK" note={sick.note} />}
                        {!hasAny && !isOff && (
                          <div className="text-xs text-gray-300 text-center mt-4">+</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Week footer – total */}
              <div className="border-t px-4 py-2 flex items-center justify-between" style={{ borderColor: '#f0f0f0' }}>
                <span className="text-xs text-gray-500">Total semaine (effectif)</span>
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
                const ds      = dateStr(d)
                const inMonth = d.getMonth() === currentDate.getMonth()
                const today   = isToday(d)
                const future  = isFuture(d)
                const weekend = d.getDay() === 0 || d.getDay() === 6
                const isOff   = !weekend && offDays.includes(d.getDay())
                const dayEntries = byDate[ds] || {}
                const work    = dayEntries.WORK
                const vacation = dayEntries.VACATION
                const vacAM   = dayEntries.VACATION_AM
                const vacPM   = dayEntries.VACATION_PM
                const sick    = dayEntries.SICK

                return (
                  <div
                    key={i}
                    className="day-cell p-1.5"
                    onClick={() => inMonth && !weekend && openDay(ds)}
                    style={{
                      borderRight: (i + 1) % 7 !== 0 ? '1px solid #f8f8f8' : 'none',
                      borderBottom: i < monthGrid.length - 7 ? '1px solid #f8f8f8' : 'none',
                      minHeight: 72,
                      background: weekend ? '#fafafa' : isOff ? '#f9fafb' : 'white',
                      opacity: !inMonth ? 0.25 : future ? 0.55 : 1,
                      cursor: inMonth && !weekend ? 'pointer' : 'default',
                    }}
                  >
                    <div
                      className="text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full mx-auto"
                      style={{
                        background: today ? PINK : 'transparent',
                        color: today ? 'white' : (weekend || isOff) ? '#d1d5db' : '#374151',
                      }}
                    >
                      {d.getDate()}
                    </div>
                    <div className="flex flex-col gap-0.5 px-0.5">
                      {work && (
                        <div className="rounded text-center font-medium px-1 py-0.5 truncate"
                          style={{ background: TYPES.WORK.bg, color: TYPES.WORK.color, fontSize: 10 }}>
                          {work.hours ? `${effectiveHours(work).toFixed(1)}h` : 'Travail'}
                        </div>
                      )}
                      {vacation && (
                        <div className="rounded text-center font-medium px-1 py-0.5"
                          style={{ background: TYPES.VACATION.bg, color: TYPES.VACATION.color, fontSize: 10 }}>
                          🏖 Congé
                        </div>
                      )}
                      {vacAM && (
                        <div className="rounded text-center font-medium px-1 py-0.5"
                          style={{ background: TYPES.VACATION_AM.bg, color: TYPES.VACATION_AM.color, fontSize: 10 }}>
                          🌅 ½ Mat.
                        </div>
                      )}
                      {vacPM && (
                        <div className="rounded text-center font-medium px-1 py-0.5"
                          style={{ background: TYPES.VACATION_PM.bg, color: TYPES.VACATION_PM.color, fontSize: 10 }}>
                          🌇 ½ Apr.
                        </div>
                      )}
                      {sick && (
                        <div className="rounded text-center font-medium px-1 py-0.5"
                          style={{ background: TYPES.SICK.bg, color: TYPES.SICK.color, fontSize: 10 }}>
                          🤒 Maladie
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            {/* Month footer – totals */}
            <div
              className="border-t px-5 py-3 flex flex-wrap items-center gap-4"
              style={{ borderColor: '#f0f0f0', background: '#fafafa' }}
            >
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {MONTHS_FR[displayMonth]} {displayYear}
              </span>
              <span className="flex items-center gap-1.5 text-sm">
                <span style={{ color: TYPES.WORK.color, fontWeight: 600 }}>⏱ {monthWorkH.toFixed(1)}h</span>
                <span className="text-gray-400 text-xs">effectifs</span>
              </span>
              {monthVacDays > 0 && (
                <span className="flex items-center gap-1.5 text-sm">
                  <span style={{ color: TYPES.VACATION.color, fontWeight: 600 }}>🏖 {monthVacDays}j</span>
                  <span className="text-gray-400 text-xs">de congé</span>
                </span>
              )}
              {monthSickDays > 0 && (
                <span className="flex items-center gap-1.5 text-sm">
                  <span style={{ color: TYPES.SICK.color, fontWeight: 600 }}>🤒 {monthSickDays}j</span>
                  <span className="text-gray-400 text-xs">maladie</span>
                </span>
              )}
              {monthWorkH > 0 && (
                <span className="ml-auto text-xs text-gray-400">
                  {monthWorkDays} jour{monthWorkDays > 1 ? 's' : ''} travaillé{monthWorkDays > 1 ? 's' : ''}
                </span>
              )}
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
        <Modal onClose={() => !saving && setModal(null)}>
          {(() => {
            const d   = parseDate(modal.date)
            const isOff = offDays.includes(d.getDay())
            const fut   = isFuture(d)
            return (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-bold text-gray-900">
                    {DAYS_FR[d.getDay() === 0 ? 6 : d.getDay() - 1]} {d.getDate()} {MONTHS_FR[d.getMonth()]}
                  </h3>
                  {isOff && formType === 'WORK' && (
                    <span
                      className="text-xs font-bold px-2 py-0.5 rounded-full"
                      style={{ background: '#fef3c7', color: '#d97706' }}
                    >⚡ Heures sup</span>
                  )}
                  {fut && (
                    <span
                      className="text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{ background: '#eff6ff', color: '#3b82f6' }}
                    >Planifié</span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mb-4">{effectiveUser} · {year}</p>
              </>
            )
          })()}

          {/* Type selector — row 1: WORK / VACATION / SICK, row 2: ½ Matin / ½ Après-m */}
          <div className="mb-4 space-y-2">
            <div className="flex gap-2">
              {(['WORK', 'VACATION', 'SICK']).map(t => {
                const cfg = TYPES[t]
                return (
                  <button
                    key={t}
                    onClick={() => switchModalType(t)}
                    className="flex-1 flex flex-col items-center py-2 rounded-xl border-2 transition-all"
                    style={{
                      borderColor: formType === t ? cfg.color : '#e5e7eb',
                      background:  formType === t ? cfg.bg : 'white',
                      color:       formType === t ? cfg.color : '#6b7280',
                    }}
                  >
                    <span style={{ fontSize: 16 }}>{cfg.icon}</span>
                    <span style={{ fontSize: 11, marginTop: 1, fontWeight: 500 }}>{cfg.label}</span>
                  </button>
                )
              })}
            </div>
            <div className="flex gap-2">
              {(['VACATION_AM', 'VACATION_PM']).map(t => {
                const cfg = TYPES[t]
                return (
                  <button
                    key={t}
                    onClick={() => switchModalType(t)}
                    className="flex-1 flex flex-row items-center justify-center gap-2 py-2 rounded-xl border-2 transition-all"
                    style={{
                      borderColor: formType === t ? cfg.color : '#e5e7eb',
                      background:  formType === t ? cfg.bg : 'white',
                      color:       formType === t ? cfg.color : '#6b7280',
                    }}
                  >
                    <span style={{ fontSize: 14 }}>{cfg.icon}</span>
                    <span style={{ fontSize: 11, fontWeight: 500 }}>{cfg.label} <span style={{ opacity: 0.6 }}>(½ j)</span></span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Arrivée / Départ / Pause (only for WORK) */}
          {formType === 'WORK' && (
            <div className="mb-4 space-y-3">
              {/* Arrivée + Départ */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Arrivée</label>
                  <input
                    type="time"
                    value={formArrival}
                    onChange={e => setFormArrival(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-gray-900 text-center"
                    style={{ borderColor: '#e5e7eb' }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Départ</label>
                  <input
                    type="time"
                    value={formDeparture}
                    onChange={e => setFormDeparture(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-gray-900 text-center"
                    style={{ borderColor: '#e5e7eb' }}
                  />
                </div>
              </div>

              {/* Pause */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Pause (h)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="4"
                    step="0.25"
                    value={formPause}
                    onChange={e => setFormPause(parseFloat(e.target.value) || 0)}
                    className="w-full border rounded-lg px-3 py-2 text-gray-900"
                    style={{ borderColor: '#e5e7eb' }}
                  />
                  <span className="text-sm text-gray-400">h</span>
                </div>
              </div>

              {/* Summary: présence → effectif */}
              <div
                className="rounded-lg px-3 py-2.5 space-y-1"
                style={{ background: '#f8faff', border: '1px solid #e0e7ff' }}
              >
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Présence ({formArrival} → {formDeparture})</span>
                  <span className="font-medium text-gray-700">{formPresence.toFixed(2)}h</span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Pause</span>
                  <span className="font-medium text-gray-700">− {formPause}h</span>
                </div>
                <div className="flex items-center justify-between border-t pt-1 mt-1" style={{ borderColor: '#e0e7ff' }}>
                  <span className="text-xs font-semibold text-green-700">Temps effectif</span>
                  <span className="text-sm font-bold text-green-700">
                    {formEffective != null ? `${formEffective.toFixed(2)}h` : '—'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Note */}
          <div className="mb-4">
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

          {/* Error */}
          {saveError && (
            <div
              className="mb-4 px-3 py-2 rounded-lg text-sm"
              style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}
            >
              ⚠️ {saveError}
            </div>
          )}

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
              disabled={saving}
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
        <Modal onClose={() => !settingsSaving && setSettingsOpen(false)}>
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
              → {(parseFloat(setWeeklyH) / Math.max(1, 5 - setOffDays.length)).toFixed(1)}h/jour
              · {5 - setOffDays.length}j/sem
              · Ex: 42h (100%), 33.6h (80%)
            </p>
          </div>

          {/* Jours non travaillés */}
          <div className="mb-5">
            <label className="block text-xs font-medium text-gray-500 mb-2">
              Jours non travaillés (cochez les jours off)
            </label>
            <div className="flex gap-2">
              {[
                { dow: 1, label: 'Lun' },
                { dow: 2, label: 'Mar' },
                { dow: 3, label: 'Mer' },
                { dow: 4, label: 'Jeu' },
                { dow: 5, label: 'Ven' },
              ].map(({ dow, label }) => {
                const isChecked = setOffDays.includes(dow)
                return (
                  <button
                    key={dow}
                    type="button"
                    onClick={() => setSetOffDays(prev =>
                      prev.includes(dow) ? prev.filter(d => d !== dow) : [...prev, dow]
                    )}
                    className="flex-1 py-2 rounded-lg border-2 text-xs font-semibold transition-all"
                    style={{
                      borderColor: isChecked ? PINK : '#e5e7eb',
                      background:  isChecked ? '#fff1f4' : 'white',
                      color:       isChecked ? PINK : '#9ca3af',
                    }}
                  >
                    {label}
                    {isChecked && <div style={{ fontSize: 8, marginTop: 1 }}>OFF</div>}
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              Les heures saisies sur ces jours comptent automatiquement comme heures supplémentaires.
            </p>
          </div>

          {settingsError && (
            <div
              className="mb-4 px-3 py-2 rounded-lg text-sm"
              style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}
            >
              ⚠️ {settingsError}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => setSettingsOpen(false)}
              disabled={settingsSaving}
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

function EntryChip({ type, hours, arrival, departure, note, overtime }) {
  const cfg = TYPES[type]
  const timeRange = arrival && departure ? `${arrival}–${departure}` : null
  return (
    <div
      className="rounded-lg px-2 py-1.5 text-xs font-medium"
      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
      title={note || cfg.label}
    >
      <div className="flex items-center gap-1">
        <span>{cfg.icon}</span>
        <span>
          {type === 'WORK' && hours != null
            ? `${typeof hours === 'number' ? hours.toFixed(1) : hours}h`
            : cfg.label}
        </span>
        {overtime && (
          <span
            className="ml-auto text-xs font-bold rounded px-1"
            style={{ background: '#fef3c7', color: '#d97706', fontSize: 9 }}
          >⚡ OT</span>
        )}
      </div>
      {timeRange && <div className="mt-0.5 font-normal" style={{ fontSize: 10, opacity: 0.8 }}>{timeRange}</div>}
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
