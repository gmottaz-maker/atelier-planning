// Calculs de la nouvelle fiche projet (/projects/[id]/essai).
//
// L'écran ne calcule rien : la frise, la liste « À venir », le découpage de la
// synthèse et les retards se décident ici, testés sans navigateur.

import { dateDuJour } from './aujourdhui'

// ── Statut du projet ────────────────────────────────────────────────────────
//
// Sept statuts, dans cet ordre. Trois se DÉDUISENT et ne se stockent pas :
//   préparation     tant que l'offre n'est pas acceptée (à faire ou envoyée) ;
//   pré-production  dès qu'elle l'est : achats, attente du matériel ;
//   facturé         dès qu'une facture existe pour un projet terminé.
// Les quatre autres se POSENT à la main (colonne projects.statut) : personne
// d'autre ne sait que le matériel est arrivé ou que le stand est démonté.
//
// Le montage et le démontage ne sont pas des statuts : ce sont des DATES, qui
// vivent dans la logistique. « En exploitation » est l'entre-deux : monté chez
// le client, en attente du démontage. Un envoi ou un stockage passe directement
// de « production terminée » à « terminé ».

export const STATUTS = [
  { cle: 'preparation',         nom: 'Préparation',         auto: true },
  { cle: 'preproduction',       nom: 'Pré-production',      auto: true },
  { cle: 'production',          nom: 'Prod. en cours' },
  { cle: 'production_terminee', nom: 'Prod. terminée' },
  { cle: 'exploitation',        nom: 'En exploitation' },
  { cle: 'termine',             nom: 'Terminé' },
  { cle: 'facture',             nom: 'Facturé',             auto: true },
]
const MANUELS = STATUTS.filter(s => !s.auto).map(s => s.cle)

/** Ce que la route accepte d'écrire : un statut manuel, ou rien (= déduit). */
export function statutStockable(v) {
  return v === null || MANUELS.includes(v)
}

const TYPES_MONTAGE   = ['montage', 'livraison', 'envoi_dhl', 'envoi_ete']
const TYPES_DEMONTAGE = ['demontage', 'recuperation']

const LIBELLE_OFFRE = {
  brouillon: 'offre à faire', envoye: 'offre envoyée', a_corriger: 'offre à corriger', accepte: 'offre acceptée', refuse: 'offre refusée',
}

/** Première date (YYYY-MM-DD) parmi les points logistiques des types donnés. */
export function premiereDate(logistique, types) {
  const dates = (Array.isArray(logistique) ? logistique : [])
    .filter(p => p && types.includes(p.type) && /^\d{4}-\d{2}-\d{2}$/.test(p.date || ''))
    .map(p => p.date)
    .sort()
  return dates[0] || null
}

// Les projets d'avant les statuts n'ont que l'ancienne `phase` : elle se relit,
// pour qu'un projet déjà démonté ne retombe pas en « pré-production ».
const DEPUIS_PHASE = { en_cours: 'exploitation', demontage: 'exploitation', termine: 'termine' }

/**
 * Le statut en cours.
 *   statut       la colonne projects.statut (manuel), ou rien
 *   phase        l'ancienne phase, relue quand `statut` est vide
 *   statutOffre  quote_data.status
 *   facture      une facture existe pour ce projet
 */
export function statutCourant({ statut, phase, statutOffre, facture } = {}) {
  const pose = MANUELS.includes(statut) ? statut : DEPUIS_PHASE[phase] || null
  if (pose === 'termine' && facture) return 'facture'
  if (pose) return pose
  return statutOffre === 'accepte' ? 'preproduction' : 'preparation'
}

/**
 * La frise : chaque statut avec son état (`fait`, `ici`, `avenir`) et une
 * précision courte — l'état de l'offre, la date de montage ou de démontage.
 */
export function parcours({ statut, phase, statutOffre, facture, logistique, disassemblyDate } = {}) {
  const ici = statutCourant({ statut, phase, statutOffre, facture })
  const rang = STATUTS.findIndex(e => e.cle === ici)
  const montage = premiereDate(logistique, TYPES_MONTAGE)
  const demontage = premiereDate(logistique, TYPES_DEMONTAGE) || disassemblyDate || null
  return STATUTS.map((e, i) => {
    let detail = ''
    if (e.cle === 'preparation') detail = LIBELLE_OFFRE[statutOffre || 'brouillon'] || ''
    if (e.cle === 'exploitation' && montage) detail = `montage ${dateCourte(montage)}`
    if (e.cle === 'termine' && demontage) detail = `démontage ${dateCourte(demontage)}`
    return { ...e, etat: i < rang ? 'fait' : i === rang ? 'ici' : 'avenir', detail }
  })
}

// ── Dates ───────────────────────────────────────────────────────────────────
// Toutes les dates restent des chaînes YYYY-MM-DD : comparer des Date mélange
// l'heure UTC et l'heure locale, et une échéance tombait en retard le jour
// même (cf. lib/aujourdhui.js).

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

/** « 14 déc. » */
export function dateCourte(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  if (!m) return ''
  return `${Number(m[3])} ${MOIS[Number(m[2]) - 1]}`
}

/** « 1 déc. 2026 » */
export function dateLongue(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  return m ? `${dateCourte(iso)} ${m[1]}` : ''
}

/** Jours entiers de `de` à `a`, négatif si `a` est passé. */
export function joursEntre(de, a) {
  const j = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(de || '') || !/^\d{4}-\d{2}-\d{2}$/.test(a || '')) return null
  return Math.round((j(a) - j(de)) / 86400000)
}

/** « dans 40 jours », « demain », « aujourd'hui », « il y a 3 jours ». */
export function delai(iso, aujourdhui = dateDuJour()) {
  const n = joursEntre(aujourdhui, iso)
  if (n === null) return ''
  if (n === 0) return 'aujourd’hui'
  if (n === 1) return 'demain'
  if (n === -1) return 'hier'
  return n > 0 ? `dans ${n} jours` : `il y a ${-n} jours`
}

/** Une tâche ouverte dont la date d'exécution est passée. */
export function enRetard(tache, aujourdhui = dateDuJour()) {
  if (!tache || tache.status === 'completed') return false
  const d = tache.execution_date
  return !!d && d < aujourdhui
}

// ── À venir ─────────────────────────────────────────────────────────────────
//
// Les prochaines dates du projet, tâches et logistique MÉLANGÉES : le montage
// du 14 et la commande du 7 sont la même question — qu'est-ce qui arrive. Un
// point logistique porte aussi des tâches générées (une par personne) : on ne
// montre que le point, sinon le montage apparaîtrait trois fois.

export function aVenir({ taches = [], logistique = [], aujourdhui = dateDuJour(), limite = 5, nomsTypes = {} } = {}) {
  const items = []
  for (const p of Array.isArray(logistique) ? logistique : []) {
    if (!p?.date || p.date < aujourdhui) continue
    const personnes = Array.isArray(p.assignees) ? p.assignees.filter(Boolean) : []
    const detail = [p.vehicle, personnes.length ? listeNoms(personnes) : ''].filter(Boolean).join(', ')
    items.push({ cle: `l-${p.uid || p.date}`, date: p.date, titre: nomsTypes[p.type] || p.type || 'Logistique', detail, logistique: true })
  }
  for (const t of Array.isArray(taches) ? taches : []) {
    if (t.status === 'completed' || !t.execution_date || t.execution_date < aujourdhui) continue
    if (t.category_data?.source_logistics_uid) continue
    items.push({ cle: `t-${t.id}`, date: t.execution_date, titre: t.title, detail: t.responsible || '', logistique: false })
  }
  return items.sort((a, b) => a.date.localeCompare(b.date) || (a.logistique === b.logistique ? 0 : a.logistique ? -1 : 1)).slice(0, limite)
}

/** « Arnaud et Guillaume », « Arnaud, Gabin et Guillaume ». */
export function listeNoms(noms) {
  const n = (noms || []).filter(Boolean)
  if (n.length <= 1) return n[0] || ''
  return `${n.slice(0, -1).join(', ')} et ${n[n.length - 1]}`
}

// ── Synthèse ────────────────────────────────────────────────────────────────
//
// La synthèse est rédigée en rubriques (« **Où on en est** », « **Ce qui est
// décidé** »…). La fiche n'en montre que la première, en paragraphe : c'est
// celle qui répond à la question qu'on se pose en ouvrant un projet. Le reste
// s'ouvre à la demande, avec le fil des mises à jour.

export function decouperSynthese(texte) {
  const brut = String(texte || '').replace(/\r/g, '').trim()
  if (!brut) return { resume: '', reste: [] }
  const sections = []
  let courante = null
  for (const ligne of brut.split('\n')) {
    const titre = ligne.match(/^\s*\*\*(.+?)\*\*\s*(.*)$/)
    if (titre) {
      courante = { titre: titre[1].trim(), lignes: titre[2] ? [titre[2]] : [] }
      sections.push(courante)
      continue
    }
    if (!courante) { courante = { titre: '', lignes: [] }; sections.push(courante) }
    if (ligne.trim()) courante.lignes.push(ligne.trim())
  }
  const premiere = sections.find(s => s.lignes.length) || { lignes: [] }
  // Le résumé est de la PROSE : une liste à puces en tête se lit mal en
  // paragraphe, on la joint par des points-virgules.
  const resume = premiere.lignes.map(l => l.replace(/^[-•]\s*/, '')).join(' ')
  const reste = sections.filter(s => s !== premiere && s.lignes.length)
    .map(s => ({ titre: s.titre, lignes: s.lignes.map(l => l.replace(/^[-•]\s*/, '')) }))
  return { resume, reste }
}

// ── Liste des projets ───────────────────────────────────────────────────────
//
// La liste range chaque projet à son statut, le même que sur la frise de sa
// fiche. Un projet en pause sort des statuts — il n'avance pas, le ranger en
// « Prod. en cours » mentirait.

/** Statut d'un projet tel que le renvoie la liste (`quote_data` allégé). */
export function statutProjet(p, facture = false) {
  return statutCourant({ statut: p?.statut, phase: p?.phase, statutOffre: p?.quote_data?.status, facture })
}

const parLivraison = (a, b) => {
  if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline)
  if (a.deadline) return -1
  if (b.deadline) return 1
  return (Number(b.numero) || 0) - (Number(a.numero) || 0)
}

/**
 * Groupes par statut, dans l'ordre de la frise ; les projets en pause à part,
 * en dernier. `factures` : ids des projets qui ont une facture. Avec `vides`,
 * tous les statuts sortent, même sans projet (les colonnes d'un kanban).
 */
export function groupesParStatut(projets = [], { factures = new Set(), vides = false } = {}) {
  const groupes = STATUTS.map(e => ({ cle: e.cle, nom: e.nom, auto: !!e.auto, projets: [] }))
  const pause = { cle: 'pause', nom: 'En pause', auto: true, projets: [] }
  for (const p of projets) {
    if (p.suspended) { pause.projets.push(p); continue }
    groupes.find(g => g.cle === statutProjet(p, factures.has(String(p.id)))).projets.push(p)
  }
  return [...groupes, pause].filter(g => vides || g.projets.length).map(g => ({ ...g, projets: [...g.projets].sort(parLivraison) }))
}

/** Groupes par date de livraison : en retard, cette semaine, ce mois, plus tard, sans date. */
export function groupesParLivraison(projets = [], aujourdhui = dateDuJour()) {
  const groupes = [
    { cle: 'retard', nom: 'En retard', projets: [] },
    { cle: 'semaine', nom: 'Dans les 7 jours', projets: [] },
    { cle: 'mois', nom: 'Dans les 30 jours', projets: [] },
    { cle: 'tard', nom: 'Plus tard', projets: [] },
    { cle: 'sans', nom: 'Sans date de livraison', projets: [] },
  ]
  for (const p of projets) {
    const n = p.deadline ? joursEntre(aujourdhui, p.deadline.slice(0, 10)) : null
    // Un projet monté, terminé ou facturé a été livré : il n'est plus « en
    // retard » sur sa livraison.
    const cle = n === null ? 'sans' : n < 0 ? (livre(p) ? 'tard' : 'retard') : n <= 7 ? 'semaine' : n <= 30 ? 'mois' : 'tard'
    groupes.find(g => g.cle === cle).projets.push(p)
  }
  return groupes.filter(g => g.projets.length).map(g => ({ ...g, projets: [...g.projets].sort(parLivraison) }))
}

// Livré : en exploitation, terminé ou facturé — ou une ancienne phase posée.
const livre = p => ['exploitation', 'termine'].includes(p?.statut) || !!p?.phase

/** Un projet dont la livraison est passée sans qu'il soit marqué livré. */
export function livraisonEnRetard(p, aujourdhui = dateDuJour()) {
  if (!p?.deadline || livre(p) || p.suspended) return false
  return p.deadline.slice(0, 10) < aujourdhui
}
