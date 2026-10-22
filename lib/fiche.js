// Calculs de la nouvelle fiche projet (/projects/[id]/essai).
//
// L'écran ne calcule rien : la frise, la liste « À venir », le découpage de la
// synthèse et les retards se décident ici, testés sans navigateur.

import { dateDuJour } from './aujourdhui'

// ── Frise du projet ─────────────────────────────────────────────────────────
//
// Six étapes, toujours les mêmes, dans cet ordre. Aucune n'est stockée : on la
// DÉDUIT de ce que le projet sait déjà — le statut de l'offre, la phase posée
// à la main, les dates de la logistique. Une étape enregistrée à part finirait
// par contredire la phase qu'elle prétend résumer.

export const ETAPES = [
  { cle: 'preparation', nom: 'Préparation' },
  { cle: 'offre',       nom: 'Offre' },
  { cle: 'production',  nom: 'Production' },
  { cle: 'montage',     nom: 'Montage' },
  { cle: 'demontage',   nom: 'Démontage' },
  { cle: 'termine',     nom: 'Terminé' },
]

const TYPES_MONTAGE   = ['montage', 'livraison', 'envoi_dhl', 'envoi_ete']
const TYPES_DEMONTAGE = ['demontage', 'recuperation']

const LIBELLE_OFFRE = {
  brouillon: 'brouillon', envoye: 'envoyée', a_corriger: 'à corriger', accepte: 'acceptée', refuse: 'refusée',
}

/** Première date (YYYY-MM-DD) parmi les points logistiques des types donnés. */
export function premiereDate(logistique, types) {
  const dates = (Array.isArray(logistique) ? logistique : [])
    .filter(p => p && types.includes(p.type) && /^\d{4}-\d{2}-\d{2}$/.test(p.date || ''))
    .map(p => p.date)
    .sort()
  return dates[0] || null
}

/**
 * L'étape en cours.
 *
 * La phase posée à la main a le dernier mot : c'est la seule information qui
 * dise qu'un montage A EU lieu. Sans phase, l'offre décide — acceptée, on
 * produit ; envoyée, on attend le client ; sinon, on prépare.
 */
export function etapeCourante({ phase, statutOffre }) {
  if (phase === 'termine') return 'termine'
  if (phase === 'demontage') return 'demontage'
  if (phase === 'en_cours') return 'montage'
  if (statutOffre === 'accepte') return 'production'
  if (statutOffre === 'envoye' || statutOffre === 'a_corriger') return 'offre'
  return 'preparation'
}

/**
 * Les six étapes, chacune avec son état (`fait`, `ici`, `avenir`) et une
 * précision courte : le statut de l'offre, ou la date prévue sur place.
 */
export function parcours({ phase, statutOffre, logistique, disassemblyDate } = {}) {
  const ici = etapeCourante({ phase, statutOffre })
  const rang = ETAPES.findIndex(e => e.cle === ici)
  const montage = premiereDate(logistique, TYPES_MONTAGE)
  const demontage = premiereDate(logistique, TYPES_DEMONTAGE) || disassemblyDate || null
  return ETAPES.map((e, i) => {
    let detail = ''
    if (e.cle === 'offre' && statutOffre && statutOffre !== 'brouillon') detail = LIBELLE_OFFRE[statutOffre] || ''
    if (e.cle === 'production' && i === rang) detail = 'en cours'
    if (e.cle === 'montage') detail = montage ? dateCourte(montage) : ''
    if (e.cle === 'demontage') detail = demontage ? dateCourte(demontage) : ''
    if (e.cle === 'termine' && ici === 'termine') detail = ''
    return { ...e, etat: i < rang || ici === 'termine' ? 'fait' : i === rang ? 'ici' : 'avenir', detail }
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
// La liste reprend l'étape de la frise : un projet s'y range là où sa fiche
// dit qu'il en est. Un projet en pause sort des étapes — il n'avance pas, le
// ranger en « Production » mentirait.

/** Étape d'un projet tel que le renvoie la liste (`quote_data` allégé). */
export function etapeProjet(p) {
  return etapeCourante({ phase: p?.phase, statutOffre: p?.quote_data?.status })
}

const parLivraison = (a, b) => {
  if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline)
  if (a.deadline) return -1
  if (b.deadline) return 1
  return (Number(b.numero) || 0) - (Number(a.numero) || 0)
}

/** Groupes par étape, dans l'ordre de la frise ; les projets en pause à part, en dernier. */
export function groupesParEtape(projets = []) {
  const groupes = ETAPES.map(e => ({ cle: e.cle, nom: e.nom, projets: [] }))
  const pause = { cle: 'pause', nom: 'En pause', projets: [] }
  for (const p of projets) {
    if (p.suspended) { pause.projets.push(p); continue }
    groupes.find(g => g.cle === etapeProjet(p)).projets.push(p)
  }
  return [...groupes, pause].filter(g => g.projets.length).map(g => ({ ...g, projets: [...g.projets].sort(parLivraison) }))
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
    // Une phase posée (en cours, démontage, terminé) dit que la livraison a eu
    // lieu : le projet n'est plus « en retard » sur elle.
    const cle = n === null ? 'sans' : n < 0 ? (p.phase ? 'tard' : 'retard') : n <= 7 ? 'semaine' : n <= 30 ? 'mois' : 'tard'
    groupes.find(g => g.cle === cle).projets.push(p)
  }
  return groupes.filter(g => g.projets.length).map(g => ({ ...g, projets: [...g.projets].sort(parLivraison) }))
}

/** Un projet dont la livraison est passée sans qu'aucune phase ne la marque. */
export function livraisonEnRetard(p, aujourdhui = dateDuJour()) {
  if (!p?.deadline || p.phase || p.suspended) return false
  return p.deadline.slice(0, 10) < aujourdhui
}
