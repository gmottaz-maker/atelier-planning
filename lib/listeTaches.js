// Calculs de la page des tâches d'essai (/tasks/essai).
//
// Une tâche ouverte se range par date (en retard, aujourd'hui, demain, cette
// semaine, semaine prochaine, plus tard, sans date), par projet ou par
// catégorie. Les tâches FAITES ne se mélangent pas aux ouvertes : elles ont
// leur propre liste, à la demande — on vient ici pour ce qui reste à faire.

import { dateDuJour, jourLocal } from './aujourdhui'
import { decaler, joursDeLaSemaine } from './accueil'
import { TASK_CATEGORIES } from './taskCategories'

export const SECTIONS_DATE = [
  { cle: 'retard', nom: 'En retard' },
  { cle: 'jour', nom: 'Aujourd’hui' },
  { cle: 'demain', nom: 'Demain' },
  { cle: 'semaine', nom: 'Cette semaine' },
  { cle: 'suivante', nom: 'Semaine prochaine' },
  { cle: 'tard', nom: 'Plus tard' },
  { cle: 'sans', nom: 'Sans date' },
]

/** La section d'une tâche ouverte, d'après sa date d'exécution. */
export function sectionDate(t, aujourdhui = dateDuJour()) {
  const d = t?.execution_date
  if (!d) return 'sans'
  if (d < aujourdhui) return 'retard'
  if (d === aujourdhui) return 'jour'
  if (d === decaler(aujourdhui, 1)) return 'demain'
  const dimanche = joursDeLaSemaine(aujourdhui)[6]
  if (d <= dimanche) return 'semaine'
  if (d <= decaler(dimanche, 7)) return 'suivante'
  return 'tard'
}

const parDate = (a, b) => (a.execution_date || '9999').localeCompare(b.execution_date || '9999') || String(a.title).localeCompare(String(b.title))

/** Filtre commun : ouvertes seulement, d'une personne (ou de toute l'équipe), et une recherche libre. */
export function filtrer(taches = [], { qui = null, recherche = '', projets = [] } = {}) {
  const q = String(recherche || '').trim().toLowerCase()
  const nomProjet = Object.fromEntries(projets.map(p => [String(p.id), `${p.numero ?? ''} ${p.name ?? ''} ${p.client ?? ''}`.toLowerCase()]))
  return taches.filter(t => {
    if (t.status === 'completed') return false
    if (qui && t.responsible !== qui) return false
    if (!q) return true
    return `${t.title} ${t.notes || ''} ${nomProjet[String(t.project_id)] || ''}`.toLowerCase().includes(q)
  })
}

/** Groupes par date, dans l'ordre des sections, sans les sections vides. */
export function groupesParDate(taches = [], aujourdhui = dateDuJour()) {
  const groupes = SECTIONS_DATE.map(s => ({ ...s, taches: [] }))
  for (const t of taches) groupes.find(g => g.cle === sectionDate(t, aujourdhui)).taches.push(t)
  return groupes.filter(g => g.taches.length).map(g => ({ ...g, taches: g.taches.sort(parDate) }))
}

/** Groupes par projet (le plus pressé d'abord), « Sans projet » à la fin. */
export function groupesParProjet(taches = [], projets = []) {
  const parId = Object.fromEntries(projets.map(p => [String(p.id), p]))
  const map = new Map()
  for (const t of taches) {
    const cle = t.project_id ? String(t.project_id) : 'sans'
    if (!map.has(cle)) {
      const p = parId[cle]
      map.set(cle, { cle, nom: p ? p.name : 'Sans projet', numero: p?.numero ?? null, projetId: p ? p.id : null, taches: [] })
    }
    map.get(cle).taches.push(t)
  }
  const groupes = [...map.values()].map(g => ({ ...g, taches: g.taches.sort(parDate) }))
  const premiere = g => g.taches[0]?.execution_date || '9999'
  return groupes.sort((a, b) => (a.cle === 'sans') - (b.cle === 'sans') || premiere(a).localeCompare(premiere(b)))
}

/** Groupes par catégorie, dans l'ordre des catégories ; une tâche sans catégorie va au bureau. */
export function groupesParCategorie(taches = []) {
  return TASK_CATEGORIES
    .map(c => ({ cle: c.key, nom: c.label, taches: taches.filter(t => (t.category || 'bureau') === c.key).sort(parDate) }))
    .filter(g => g.taches.length)
}

/** Tâches faites dans les `jours` derniers jours, les plus récentes d'abord. */
export function faitesRecemment(taches = [], { qui = null, jours = 30, aujourdhui = dateDuJour() } = {}) {
  const depuis = decaler(aujourdhui, -jours)
  return taches
    .filter(t => t.status === 'completed' && (!qui || t.responsible === qui))
    .filter(t => (jourLocal(t.completed_at) || t.execution_date || '') >= depuis)
    .sort((a, b) => String(b.completed_at || b.execution_date || '').localeCompare(String(a.completed_at || a.execution_date || '')))
}

/** Tâches ouvertes par personne, pour les pastilles de filtre. */
export function compterParPersonne(taches = []) {
  const n = {}
  for (const t of taches) if (t.status !== 'completed' && t.responsible) n[t.responsible] = (n[t.responsible] || 0) + 1
  return n
}
