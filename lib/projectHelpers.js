// Calculs et formatage de la fiche projet.
//
// Extraits de pages/projects/[id].js (2720 lignes) : ce sont des fonctions
// pures, donc testables et réutilisables. `initLogistics` en particulier porte
// trois formats de données successifs — c'est le genre de logique qu'on ne veut
// pas voir régresser silencieusement au milieu d'un composant.

export function genLogUid() {
  return `log_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

// Types de logistique qui portent une date
export const TYPES_WITH_DATE = ['demontage', 'recuperation', 'livraison', 'envoi_dhl', 'envoi_ete', 'montage']

export function today() { const d = new Date(); d.setHours(0, 0, 0, 0); return d }

export function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function isCompletedToday(task) {
  if (task.status !== 'completed' || !task.completed_at) return false
  return task.completed_at.split('T')[0] === toDateStr(today())
}

export function fmtDate(str) {
  if (!str) return '—'
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function getDaysRemaining(deadline) {
  if (!deadline) return null
  const t = today()
  const d = new Date(deadline); d.setHours(0, 0, 0, 0)
  return Math.ceil((d - t) / 86400000)
}

// Vert au-delà de deux semaines, puis jaune, orange, et rouge une fois dépassé.
export function getProjectColor(p) {
  if (p.color_override) return p.color_override
  const d = getDaysRemaining(p.deadline)
  if (d === null) return '#94a3b8'
  if (d < 0)   return '#dc2626'
  if (d <= 7)  return '#f59e0b'
  if (d <= 14) return '#eab308'
  return '#22c55e'
}

export function ensureUid(item) {
  if (item?.uid) return item
  return { ...item, uid: genLogUid() }
}

/**
 * Normalise la logistique d'un projet en tableau d'items à uid stable.
 *
 * Trois formats coexistent en base, par ordre de préférence :
 *   1. tableau (format courant) ;
 *   2. objet indexé par type (format intermédiaire) ;
 *   3. colonnes dédiées logistics_* et disassembly_* (format d'origine).
 */
export function initLogistics(project) {
  const existing = project.logistics_data || {}

  if (Array.isArray(existing) && existing.length > 0) return existing.map(ensureUid)

  if (!Array.isArray(existing)) {
    const OLD_KEYS = ['montage', 'livraison', 'envoi_dhl', 'demontage', 'recuperation']
    const items = []
    for (const key of OLD_KEYS) {
      const d = existing[key]
      if (d && Object.values(d).some(v => v && String(v).trim())) {
        items.push(ensureUid({ type: key, ...d }))
      }
    }
    if (items.length > 0) return items
  }

  const items = []
  if (project.logistics_address || project.logistics_time) {
    items.push(ensureUid({ type: 'montage', date: '', address: project.logistics_address || '', time: project.logistics_time || '', contact: project.logistics_contact || '', notes: project.logistics_notes || '' }))
  }
  if (project.disassembly_date || project.disassembly_address) {
    items.push(ensureUid({ type: 'demontage', date: project.disassembly_date || '', address: project.disassembly_address || '', time: project.disassembly_time || '', contact: project.disassembly_contact || '', notes: project.disassembly_notes || '' }))
  }
  return items
}

// Plage horaire « 08:00 – 10:00 » ↔ champs de formulaire
export function parseTimeRange(value) {
  if (!value) return { start: '', end: '' }
  const parts = value.split(/\s*[–\-]\s*/)
  const toInput = s => {
    if (!s) return ''
    s = s.trim().replace(/h/i, ':')
    return /^\d{2}:\d{2}$/.test(s) ? s : ''
  }
  return { start: toInput(parts[0] || ''), end: toInput(parts[1] || '') }
}

export function combineTime(start, end) {
  if (!start && !end) return ''
  if (start && end) return `${start} – ${end}`
  return start || end
}

export function fmtTimeDisplay(value) {
  if (!value) return null
  return value.replace(/(\d{2}):(\d{2})/g, '$1h$2')
}

/** Libellé relatif court d'une date d'exécution : « Aujourd'hui », « Dans 3j »… */
export function fmtTaskDate(dateStr) {
  if (!dateStr) return null
  const todayStr = toDateStr(today())
  if (dateStr === todayStr) return { label: "Aujourd'hui", color: '#d97706' }
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d); date.setHours(0, 0, 0, 0)
  const diff = Math.round((date - today()) / 86400000)
  if (diff < 0) return { label: `${Math.abs(diff)}j en retard`, color: '#dc2626' }
  if (diff === 1) return { label: 'Demain', color: '#d97706' }
  if (diff <= 7) return { label: `Dans ${diff}j`, color: '#6b7280' }
  return { label: date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }), color: '#9ca3af' }
}
