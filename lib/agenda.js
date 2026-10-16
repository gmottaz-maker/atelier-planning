// L'agenda de l'atelier : qui fait quoi, quelle demi-journée.
//
// Il remplace cinq calendriers Google qui ne se parlaient pas — vacances,
// jours de congé, réunions, montages extérieurs, production — et dont aucun ne
// savait à quel projet il appartenait. C'est ce lien qui manquait : un bloc
// d'agenda porte le projet et l'ACTIVITÉ VENDUE qu'il avance, donc il décharge
// quelque chose. Un calendrier de plus n'aurait rien réglé.
//
// ── Pas d'heure de début ────────────────────────────────────────────────────
//
// Une demi-journée, et c'est tout. Un atelier ne commence pas une soudure à
// 9 h 15 parce qu'un calendrier l'a écrit, et un horaire faux à la minute est
// un horaire qu'on cesse de lire. Une journée entière, c'est deux blocs.
//
// La DURÉE, elle, se compte en demi-heures : trois heures de peinture ne sont
// pas un bloc de trois heures mais une demi-heure, un séchage, un ponçage
// léger et une reprise. `minutes` sert à ça ; vide, le bloc prend toute la
// demi-journée.
//
// Rien ici ne lit la base ni le réseau.
import { JOURS_TRAVAILLES } from './joursOuvres'
import { versDate, enChaine, decaler } from './capacite'

export const DEMIS = ['am', 'pm']
export const libelleDemi = d => (d === 'pm' ? 'après-midi' : 'matin')

/**
 * Les types de bloc. Liste FERMÉE, comme les fournisseurs d'économat :
 * « montage » et « Montage ext. » dans la même colonne libre, et plus aucun
 * filtre ne marche six mois plus tard.
 *
 * `atelier` dit si le bloc se passe dans les murs — ce qui décide s'il peut
 * cohabiter avec un autre le même jour, et plus tard si un trajet manque
 * devant lui.
 */
export const TYPES = [
  { key: 'production', label: 'production',   atelier: true,  exigeProjet: true },
  { key: 'montage',    label: 'montage',      atelier: false, exigeProjet: false },
  { key: 'demontage',  label: 'démontage',    atelier: false, exigeProjet: false },
  { key: 'trajet',     label: 'trajet',       atelier: false, exigeProjet: false },
  { key: 'meeting',    label: 'meeting',      atelier: false, exigeProjet: false },
  { key: 'admin',      label: 'admin',        atelier: true,  exigeProjet: false },
  { key: 'entretien',  label: 'entretien',    atelier: true,  exigeProjet: false },
  { key: 'autre',      label: 'autre',        atelier: false, exigeProjet: false },
]
export const typeDe = key => TYPES.find(t => t.key === key) || null

const PAS = 30                 // la demi-heure : le grain de toute durée
const MINUTES_MAX = 300        // cinq heures : au-delà, ce n'est plus une demi-journée
const FORME = /^\d{4}-\d{2}-\d{2}$/

/** Le lundi de la semaine qui contient `jour`. */
export function lundiDe(jour) {
  const d = versDate(jour)
  if (!d) return null
  return decaler(jour, -((d.getDay() + 6) % 7))
}

/**
 * Les jours TRAVAILLÉS de la semaine de `jour` : lundi, mardi, jeudi,
 * vendredi. Le mercredi n'est pas une case grisée, il n'est pas là — une case
 * vide invite à y poser quelque chose.
 */
export function semaineOuvree(jour) {
  const lundi = lundiDe(jour)
  if (!lundi) return []
  const out = []
  for (let i = 0; i < 7; i++) {
    const d = decaler(lundi, i)
    if (JOURS_TRAVAILLES.includes(versDate(d).getDay())) out.push(d)
  }
  return out
}

/** Ce jour-là s'il est travaillé, sinon le prochain qui l'est. */
export function prochainJourTravaille(jour) {
  let d = versDate(jour)
  if (!d) return jour
  let courant = enChaine(d)
  for (let i = 0; i < 7; i++) {
    if (JOURS_TRAVAILLES.includes(versDate(courant).getDay())) return courant
    courant = decaler(courant, 1)
  }
  return courant
}

/** Un samedi, un dimanche, un mercredi : pas un jour d'atelier. */
export const estJourTravaille = jour => {
  const d = versDate(jour)
  return !!d && JOURS_TRAVAILLES.includes(d.getDay())
}

/**
 * Valide un bloc et rend une valeur PROPRE, champ par champ.
 *
 * Jamais `{ ...req.body }` : une route qui recopie le corps de la requête
 * laisse écrire n'importe quelle colonne, `user_name` comprise — l'identité
 * vient du JWT, jamais du client.
 *
 * Une date passée est permise, et une date future aussi : l'agenda sert
 * autant à prévoir qu'à consigner. C'est la seule différence avec `heures`,
 * qui refuse d'imputer à l'avance.
 */
export function validerBloc(brut, { activites = [], projets = null } = {}) {
  const e = brut || {}

  const date = String(e.date || '')
  if (!FORME.test(date) || !versDate(date)) return { ok: false, erreur: 'Date invalide' }

  const demi = String(e.demi || '')
  if (!DEMIS.includes(demi)) return { ok: false, erreur: 'Demi-journée invalide (am ou pm)' }

  const type = typeDe(String(e.type || ''))
  if (!type) return { ok: false, erreur: 'Type de bloc inconnu' }

  const project_id = e.project_id ? String(e.project_id) : null
  if (type.exigeProjet && !project_id) {
    // Un bloc de production sans projet ne décharge rien : il occupe une
    // demi-journée dans l'écran sans avancer une seule heure vendue, et la
    // jauge continuerait d'annoncer le travail comme restant à faire.
    return { ok: false, erreur: 'Un bloc de production doit porter un projet' }
  }
  if (project_id && Array.isArray(projets) && !projets.some(p => String(p.id) === project_id)) {
    return { ok: false, erreur: 'Projet introuvable' }
  }

  let activite = null
  if (e.activite !== '' && e.activite != null) {
    const code = Number(e.activite)
    const a = activites.find(x => Number(x.code) === code)
    if (!Number.isInteger(code) || !a) return { ok: false, erreur: 'Activité inconnue' }
    if (a.actif === false) return { ok: false, erreur: `Activité ${code} désactivée` }
    activite = code
  }
  if (type.exigeProjet && activite === null) {
    return { ok: false, erreur: 'Un bloc de production doit porter une activité' }
  }

  let minutes = null
  if (e.minutes !== '' && e.minutes != null) {
    const m = Number(e.minutes)
    if (!Number.isInteger(m) || m <= 0 || m % PAS !== 0) {
      return { ok: false, erreur: 'La durée se compte par demi-heures' }
    }
    if (m > MINUTES_MAX) return { ok: false, erreur: 'Plus de 5 h : ce n\'est plus une demi-journée' }
    minutes = m
  }

  const texte = (v, n) => {
    const t = String(v ?? '').trim().slice(0, n)
    return t || null
  }
  return {
    ok: true,
    valeur: {
      date, demi, type: type.key, project_id, activite, minutes,
      titre: texte(e.titre, 200), lieu: texte(e.lieu, 200), note: texte(e.note, 500),
      fige: e.fige === true,
    },
  }
}

// ── Lectures ────────────────────────────────────────────────────────────────

/** Les blocs d'une personne sur une demi-journée. */
export function blocsDe(blocs = [], nom, date, demi) {
  return blocs.filter(b => b.user_name === nom && b.date === date && b.demi === demi)
}

/**
 * Minutes posées par une liste de blocs.
 *
 * Un bloc sans durée prend toute la demi-journée — la moitié de la journée
 * contractuelle, pas une valeur en dur : à 33,6 h sur quatre jours, une
 * demi-journée fait 4,2 h, pas 4.
 */
export function minutesPlacees(blocs = [], heuresParJour = 0) {
  const pleine = Math.round((heuresParJour / 2) * 60)
  return blocs.reduce((s, b) => s + (b.minutes || pleine), 0)
}

/**
 * Ce qui reste de libre dans une demi-journée, en minutes.
 *
 * Une demi-journée peut porter plusieurs blocs — un trajet puis un montage —
 * mais pas six heures de travail dans quatre heures. Borné à zéro : un
 * dépassement se signale, il ne se soustrait pas ailleurs.
 */
export function placeLibre(blocs = [], heuresParJour = 0) {
  const pleine = Math.round((heuresParJour / 2) * 60)
  return Math.max(0, pleine - minutesPlacees(blocs, heuresParJour))
}

/**
 * Le type que porte une demi-journée VIDE, d'après la semaine type.
 *
 * La semaine type n'écrit aucune ligne : elle colore le fond. Guillaume a des
 * demi-journées d'administratif et des demi-journées d'atelier qui reviennent
 * chaque semaine ; les matérialiser en centaines de blocs identiques
 * obligerait à les supprimer un par un le jour où ça change.
 *
 * Forme : `{ "Guillaume": { "1": ["admin", "production"], "4": [...] } }` —
 * la clé est le jour de la semaine au sens de `getDay()` (1 = lundi), la
 * valeur le couple [matin, après-midi].
 */
export function typeParDefaut(semaineType = {}, nom, date) {
  const d = versDate(date)
  if (!d) return [null, null]
  const jours = semaineType?.[nom]
  if (!jours) return [null, null]
  const couple = jours[String(d.getDay())]
  if (!Array.isArray(couple)) return [null, null]
  return [couple[0] || null, couple[1] || null]
}

/**
 * Ce que la semaine type réserve à l'atelier, pour une personne.
 *
 * Attention à ce que ça NE dit PAS : ces demi-journées ne se retirent pas de
 * la capacité de la jauge. Une partie de l'administratif est de la gestion de
 * projet, qui est vendue et porte son code d'activité — la retirer de la
 * capacité ET la compter dans la demande la compterait deux fois.
 */
export function demiJourneesAtelier(semaineType = {}, nom) {
  const jours = semaineType?.[nom]
  if (!jours) return null              // aucune semaine type : rien à dire
  let n = 0
  for (const j of JOURS_TRAVAILLES) {
    const couple = jours[String(j)]
    if (!Array.isArray(couple)) continue
    for (const t of couple) {
      const ty = typeDe(t)
      if (ty && ty.atelier && ty.key !== 'admin') n += 1
    }
  }
  return n
}

/** Groupe les blocs par date puis par personne — la forme que lit l'écran. */
export function parJourEtPersonne(blocs = []) {
  const out = {}
  for (const b of blocs) {
    out[b.date] ||= {}
    out[b.date][b.user_name] ||= { am: [], pm: [] }
    const demi = b.demi === 'pm' ? 'pm' : 'am'
    out[b.date][b.user_name][demi].push(b)
  }
  return out
}

/** Minutes posées par projet, toutes personnes confondues. */
export function minutesParProjet(blocs = [], heuresParJour = 0) {
  const out = {}
  for (const b of blocs) {
    if (!b.project_id) continue
    out[b.project_id] = (out[b.project_id] || 0) + minutesPlacees([b], heuresParJour)
  }
  return out
}

export { enChaine }
