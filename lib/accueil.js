// Calculs de l'accueil d'essai (/home/essai).
//
// Trois questions, à l'ouverture de la journée :
//   — qu'est-ce qui se passe cette semaine ?   (livraisons, dates sur place,
//     agenda, tâches datées — sur une semaine)
//   — qu'est-ce qui attend quelqu'un ?         (retards, offres à faire,
//     projets terminés à facturer)
//   — qu'est-ce qui est sur l'établi ?         (projets acceptés et pas encore
//     terminés, par livraison)
// Tout se décide ici ; la page ne fait qu'afficher.

import { dateDuJour } from './aujourdhui'
import { enRetard, livraisonEnRetard, statutProjet } from './fiche'
import { initLogistics } from './projectHelpers'

const NOMS_TYPES = { montage: 'Montage', demontage: 'Démontage', livraison: 'Livraison', recuperation: 'Récupération', envoi_dhl: 'Envoi DHL', envoi_ete: 'Envoi ETE' }

const jour = iso => (typeof iso === 'string' ? iso.slice(0, 10) : '')

/** Ajoute `n` jours à une date YYYY-MM-DD, sans passer par le fuseau. */
export function decaler(iso, n) {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return t.toISOString().slice(0, 10)
}

/** Les sept jours (lundi → dimanche) de la semaine qui contient `iso`, décalée de `semaines`. */
export function joursDeLaSemaine(iso = dateDuJour(), semaines = 0) {
  const [y, m, d] = iso.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7
  const lundi = decaler(iso, 1 - dow + 7 * semaines)
  return Array.from({ length: 7 }, (_, i) => decaler(lundi, i))
}

/**
 * Ce qui se passe chaque jour, entre `debut` et `fin` inclus.
 * Rend { 'YYYY-MM-DD': [evenement] }, chaque événement :
 *   { cle, genre: 'livraison' | 'surplace' | 'agenda' | 'tache', titre, projet, qui, demi }
 * Ordre dans un jour : livraisons, dates sur place, agenda (matin puis
 * après-midi), tâches. Les tâches tirées d'un point logistique ne sortent pas :
 * le point les représente déjà.
 */
export function evenementsParJour({ projets = [], taches = [], agenda = [], debut, fin }) {
  const dans = d => d && d >= debut && d <= fin
  const out = {}
  const ajouter = (d, e) => { (out[d] ||= []).push(e) }
  const parId = Object.fromEntries(projets.map(p => [String(p.id), p]))
  const resume = p => (p ? { id: p.id, numero: p.numero, nom: p.name } : null)

  for (const p of projets) {
    if (p.status !== 'active') continue
    const d = jour(p.deadline)
    if (dans(d)) ajouter(d, { cle: `liv-${p.id}`, genre: 'livraison', titre: 'Livraison', projet: resume(p), ordre: 0 })
    for (const pt of initLogistics(p)) {
      if (dans(pt.date)) ajouter(pt.date, { cle: `sp-${p.id}-${pt.uid || pt.type}`, genre: 'surplace', titre: NOMS_TYPES[pt.type] || pt.type, projet: resume(p), qui: (pt.assignees || []).join(', '), ordre: 1 })
    }
  }
  for (const b of agenda) {
    if (!dans(b.date)) continue
    const p = parId[String(b.project_id)] || (b.projects ? { id: b.project_id, numero: b.projects.numero, name: b.projects.name } : null)
    ajouter(b.date, { cle: `ag-${b.id}`, genre: 'agenda', titre: b.titre || b.type, projet: resume(p), qui: b.user_name, demi: b.demi, ordre: b.demi === 'pm' ? 3 : 2 })
  }
  for (const t of taches) {
    if (t.status === 'completed' || t.category_data?.source_logistics_uid || !dans(t.execution_date)) continue
    ajouter(t.execution_date, { cle: `t-${t.id}`, genre: 'tache', titre: t.title, projet: resume(parId[String(t.project_id)]), qui: t.responsible, ordre: 4 })
  }
  for (const d of Object.keys(out)) out[d].sort((a, b) => a.ordre - b.ordre)
  return out
}

/**
 * Ce qui attend quelqu'un. Chaque élément : { cle, genre, titre, detail, projet }.
 * Les plus urgents d'abord : livraisons en retard, tâches en retard, projets
 * à facturer, offres à faire. « À facturer » n'existe que si l'on connaît les
 * factures (`factures` non nul : l'admin).
 */
export function aTraiter({ projets = [], taches = [], factures = null, aujourdhui = dateDuJour() }) {
  const actifs = projets.filter(p => p.status === 'active' && !p.suspended)
  const parId = Object.fromEntries(projets.map(p => [String(p.id), p]))
  const resume = p => (p ? { id: p.id, numero: p.numero, nom: p.name } : null)
  const out = []
  for (const p of actifs) {
    if (livraisonEnRetard(p, aujourdhui)) out.push({ cle: `lr-${p.id}`, genre: 'retard', titre: 'Livraison dépassée', detail: jour(p.deadline), projet: resume(p) })
  }
  for (const t of taches) {
    if (t.category_data?.source_logistics_uid || !enRetard(t, aujourdhui)) continue
    out.push({ cle: `tr-${t.id}`, genre: 'retard', titre: t.title, detail: t.execution_date, qui: t.responsible, projet: resume(parId[String(t.project_id)]) })
  }
  if (factures) {
    for (const p of actifs) {
      if (statutProjet(p, factures.has(String(p.id))) === 'termine') out.push({ cle: `af-${p.id}`, genre: 'facturer', titre: 'Terminé, à facturer', projet: resume(p) })
    }
  }
  for (const p of actifs) {
    const s = p.quote_data?.status
    if (statutProjet(p) === 'preparation' && (!s || s === 'brouillon' || s === 'a_corriger')) {
      out.push({ cle: `of-${p.id}`, genre: 'offre', titre: s === 'a_corriger' ? 'Offre à corriger' : 'Offre à faire', projet: resume(p), detail: jour(p.deadline) || null })
    }
  }
  return out
}

const SUR_L_ETABLI = ['preproduction', 'production', 'production_terminee', 'exploitation']

/** Les projets acceptés et pas encore terminés, par livraison (sans date à la fin). */
export function surLEtabli(projets = [], factures = new Set()) {
  return projets
    .filter(p => p.status === 'active' && !p.suspended && SUR_L_ETABLI.includes(statutProjet(p, factures.has(String(p.id)))))
    .sort((a, b) => (jour(a.deadline) || '9999').localeCompare(jour(b.deadline) || '9999'))
}

/** Mes tâches ouvertes : en retard, aujourd'hui (ou sans date), puis le reste de la semaine et plus tard. */
export function mesTaches(taches = [], moi, aujourdhui = dateDuJour()) {
  const fin = joursDeLaSemaine(aujourdhui)[6]
  const miennes = taches.filter(t => t.responsible === moi && t.status !== 'completed')
  const par = (a, b) => (a.execution_date || '').localeCompare(b.execution_date || '')
  return {
    retard: miennes.filter(t => enRetard(t, aujourdhui)).sort(par),
    jour: miennes.filter(t => !t.execution_date || t.execution_date === aujourdhui),
    semaine: miennes.filter(t => t.execution_date > aujourdhui && t.execution_date <= fin).sort(par),
    plusTard: miennes.filter(t => t.execution_date > fin).sort(par),
  }
}
