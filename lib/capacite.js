// La jauge de charge : ce qu'on doit faire, contre le temps qu'il reste.
//
// C'est la première brique du planning, et c'est volontairement la plus bête :
// elle ne pose aucun bloc, ne choisit aucun ordre, ne connaît ni le séchage de
// la peinture ni les délais de livraison. Elle répond à UNE question, qui est
// la plus coûteuse quand on y répond mal :
//
//     « Est-ce qu'on peut prendre ce projet ? »
//
// Tout ce qu'elle lit existe déjà : les heures de l'offre (chaque ligne de
// main-d'œuvre porte son code d'activité), les heures imputées, les congés de
// `/schedule`, les réglages de `work_settings`. Aucune table nouvelle.
//
// ── Ce qu'elle NE dit pas ───────────────────────────────────────────────────
//
// Elle suppose le travail infiniment divisible et ignore l'ordre des étapes :
// vingt heures de peinture « rentrent » dans vingt heures libres, même si le
// séchage les étale sur trois semaines. C'est l'affaire du planificateur, pas
// de la jauge. Une jauge qui dit « ça ne rentre pas » a donc toujours raison ;
// une jauge qui dit « ça rentre » dit seulement « il n'y a pas de mur ».

import { JOURS_TRAVAILLES } from './joursOuvres'
import { heuresParActivite } from './rentabilite'

const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n }
const arrondi = n => Math.round(n * 100) / 100

const FORME = /^\d{4}-\d{2}-\d{2}$/

/** 'YYYY-MM-DD' → Date à minuit LOCAL, ou null. Même précaution que joursOuvres. */
export function versDate(s) {
  if (!FORME.test(String(s || ''))) return null
  const [y, m, j] = String(s).split('-').map(Number)
  const d = new Date(y, m - 1, j)
  return d.getDate() === j && d.getMonth() === m - 1 ? d : null
}

export const enChaine = d =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// ── La fenêtre ───────────────────────────────────────────────────────────────

/** Décale une date de `n` jours. */
export function decaler(jour, n) {
  const d = versDate(jour)
  if (!d) return jour
  d.setDate(d.getDate() + n)
  return enChaine(d)
}

// Le plancher de l'horizon. Sans lui, un atelier dont tout est livré dans
// quinze jours n'aurait que quinze jours de capacité à opposer au prochain
// client, et refuserait un projet qu'il a tout le temps de faire. La question
// est « est-ce que je peux le prendre ? », pas « est-ce que je peux le prendre
// avant ma dernière livraison ? ».
export const PLANCHER_JOURS = 56

/**
 * De quand à quand on mesure.
 *
 *   — le début est DEMAIN : la journée en cours est entamée, et la compter
 *     entière promet des heures qu'on n'a plus ;
 *   — la fin est la dernière échéance engagée, jamais à moins de huit semaines.
 *
 * Les deux se laissent déplacer, mais seulement dans le sens qui ne ment pas :
 * un début peut être repoussé — « et si on ne comptait qu'à partir du 1er
 * novembre ? » — jamais ramené dans le passé, qui rendrait des heures déjà
 * consommées. Une fin demandée avant le début est ignorée de même : elle
 * donnerait une capacité nulle, donc un refus, pour une faute de frappe.
 *
 * `motif` et `debut` disent laquelle des règles a tranché — l'écran ne doit pas
 * annoncer « jusqu'à la dernière échéance » quand c'est le plancher qui a parlé.
 */
export function fenetre({ aujourdhui, echeances = [], duDemande = '', auDemande = '' } = {}) {
  const parDefaut = decaler(aujourdhui, 1)
  const du = (versDate(duDemande) && duDemande > parDefaut) ? duDemande : parDefaut

  const triees = echeances.filter(d => versDate(d)).sort()
  const derniere = triees[triees.length - 1]
  const plancher = decaler(du, PLANCHER_JOURS)
  const naturel = derniere && derniere > plancher ? derniere : plancher
  const demandee = (versDate(auDemande) && auDemande >= du) ? auDemande : null

  const au = demandee || naturel
  return {
    du,
    au,
    debut: du === parDefaut ? 'demain' : 'demande',
    motif: demandee ? 'demande' : (au === derniere ? 'echeance' : 'plancher'),
  }
}

// ── Absences ─────────────────────────────────────────────────────────────────
// Les types viennent de `/schedule`, qui les enregistre déjà dans
// `work_entries`. On ne les redéfinit pas ici : on dit juste ce qu'ils COÛTENT
// en capacité.
const COUT_ABSENCE = {
  VACATION:    1,
  SICK:        1,
  HOLIDAY:     1,
  VACATION_AM: 0.5,
  VACATION_PM: 0.5,
}

/**
 * Part de la journée retirée à quelqu'un, de 0 (présent) à 1 (absent).
 *
 * Deux demi-journées se cumulent, et le total est borné à 1 : une saisie
 * incohérente — un congé entier ET une demi-journée le même jour — ne doit pas
 * produire une capacité NÉGATIVE, qui ferait mentir toute la jauge.
 */
export function partAbsente(entrees = []) {
  const total = entrees.reduce((s, e) => s + (COUT_ABSENCE[e.type] || 0), 0)
  return Math.min(1, total)
}

/**
 * Heures d'une journée de travail pleine.
 *
 * `weekly_hours` est un contrat hebdomadaire ; l'atelier ne travaille que
 * quatre jours. Diviser par 5 donnerait une journée trop courte et une jauge
 * trop pessimiste — on diviserait le temps d'un jour qui n'existe pas.
 */
export function heuresParJour(reglages) {
  const h = num(reglages?.weekly_hours)
  if (!h) return 0
  return arrondi(h / JOURS_TRAVAILLES.length)
}

/**
 * Capacité d'une personne entre deux dates incluses.
 *
 * `du` est normalement DEMAIN et non aujourd'hui : la journée en cours est
 * déjà entamée, et la compter en entier promet des heures qu'on n'a plus.
 */
export function capacitePersonne(nom, du, au, { reglages = {}, absences = [], feries = [] } = {}) {
  const debut = versDate(du)
  const fin   = versDate(au)
  const parJour = heuresParJour(reglages)
  if (!debut || !fin || fin < debut || !parJour) {
    return { nom, heures: 0, jours: 0, joursAbsents: 0, parJour }
  }

  const feriesSet = new Set(feries)
  const parDate = new Map()
  for (const a of absences) {
    if (a.user_name !== nom) continue
    if (!parDate.has(a.date)) parDate.set(a.date, [])
    parDate.get(a.date).push(a)
  }

  let heures = 0, jours = 0, joursAbsents = 0
  for (const d = new Date(debut); d <= fin; d.setDate(d.getDate() + 1)) {
    if (!JOURS_TRAVAILLES.includes(d.getDay())) continue
    const cle = enChaine(d)
    if (feriesSet.has(cle)) { joursAbsents += 1; continue }
    const absent = partAbsente(parDate.get(cle) || [])
    if (absent >= 1) { joursAbsents += 1; continue }
    jours += 1 - absent
    heures += parJour * (1 - absent)
  }
  return { nom, heures: arrondi(heures), jours: arrondi(jours), joursAbsents, parJour }
}

// ── Compétences ──────────────────────────────────────────────────────────────
//
// Rangées dans `app_settings` sous la clé `competences`, pas dans une table :
// deux personnes et une vingtaine d'activités, c'est quarante cases qui bougent
// une fois par an. Même arbitrage que les coefficients de peinture.
//
// Forme : `{ "Arnaud": [1,2,3…], "Guillaume": [1,2,…] }` — la liste des codes
// que la personne SAIT faire. Une personne absente de l'objet sait tout faire :
// c'est le cas au démarrage, et il vaut mieux une jauge optimiste qu'une jauge
// qui refuse tout parce qu'on n'a pas encore rempli un écran.
export function saitFaire(nom, code, competences = {}) {
  const liste = competences?.[nom]
  if (!Array.isArray(liste)) return true
  return liste.map(Number).includes(Number(code))
}

/** Qui, parmi `personnes`, sait faire cette activité. */
export function quiSaitFaire(code, personnes = [], competences = {}) {
  return personnes.filter(p => saitFaire(p.nom, code, competences)).map(p => p.nom)
}

// ── Demande ──────────────────────────────────────────────────────────────────

/**
 * Ce qu'un projet doit encore, activité par activité.
 *
 * `heuresParActivite` fait déjà le gros du travail : prévu depuis l'offre,
 * réel depuis les heures imputées. Le reste est une soustraction, bornée à
 * zéro — une activité où l'on a dépassé ne RAJOUTE pas du temps disponible
 * ailleurs, elle est simplement finie.
 */
export function resteProjet(projet, heuresDuProjet = [], activites = []) {
  const { lignes, prevuSansCode } = heuresParActivite(projet?.quote_data, heuresDuProjet, activites)
  const parActivite = lignes
    .map(l => ({ code: l.code, libelle: l.libelle, prevu: l.prevu, reel: l.reel, reste: arrondi(Math.max(0, l.prevu - l.reel)) }))
    .filter(l => l.reste > 0)
  return {
    parActivite,
    // Les offres d'avant les codes d'activité tombent entièrement ici. Ce
    // n'est pas une erreur, mais ces heures ne peuvent être attribuées à
    // personne : l'écran doit le dire plutôt que de les diluer.
    sansCode: prevuSansCode,
    total: arrondi(parActivite.reduce((s, l) => s + l.reste, 0)),
  }
}

// ── Le verdict ───────────────────────────────────────────────────────────────

/**
 * Est-ce que ça tient ?
 *
 * Avec deux personnes, l'attribution se résout EXACTEMENT, sans heuristique :
 *
 *   — une activité qu'une seule personne sait faire est IMPOSÉE à celle-ci ;
 *   — ce que tout le monde sait faire va dans un pot commun.
 *
 * Ça tient si chacun absorbe ce qui lui est imposé, ET si le total rentre dans
 * le total. C'est la condition nécessaire et suffisante — démontrable sur deux
 * personnes, et un test la garde.
 *
 * C'est aussi ce qui fait voir les GOULOTS : un total large peut cacher une
 * activité que seul l'un des deux sait faire et qui déborde. Une jauge globale
 * dirait « ça passe », et on travaillerait le week-end.
 */
export function verdict(besoins, personnes, competences = {}) {
  const capa = new Map(personnes.map(p => [p.nom, p.heures]))
  const impose = new Map(personnes.map(p => [p.nom, 0]))
  let commun = 0
  const orphelines = []

  for (const b of besoins) {
    const qui = quiSaitFaire(b.code, personnes, competences)
    if (qui.length === 0) { orphelines.push(b); continue }
    if (qui.length === 1) impose.set(qui[0], impose.get(qui[0]) + b.reste)
    else commun += b.reste
  }

  const parPersonne = personnes.map(p => {
    const i = arrondi(impose.get(p.nom) || 0)
    return {
      nom: p.nom,
      capacite: p.heures,
      impose: i,
      // Ce qui reste à cette personne pour absorber le pot commun.
      libre: arrondi(Math.max(0, p.heures - i)),
      manque: arrondi(Math.max(0, i - p.heures)),
    }
  })

  const demandeTotale = arrondi([...impose.values()].reduce((s, v) => s + v, 0) + commun)
  const capaciteTotale = arrondi([...capa.values()].reduce((s, v) => s + v, 0))
  const manqueGlobal = arrondi(Math.max(0, demandeTotale - capaciteTotale))
  const goulots = parPersonne.filter(p => p.manque > 0)

  return {
    demande: demandeTotale,
    capacite: capaciteTotale,
    commun: arrondi(commun),
    parPersonne,
    goulots,
    orphelines,
    manque: arrondi(Math.max(manqueGlobal, goulots.reduce((s, g) => s + g.manque, 0))),
    tient: manqueGlobal === 0 && goulots.length === 0,
  }
}

/**
 * Fusionne les besoins de plusieurs projets, activité par activité.
 * Les heures d'une même activité sur deux chantiers sont interchangeables :
 * c'est la même personne qui les fera.
 */
export function cumuler(restes = []) {
  const par = new Map()
  let sansCode = 0
  for (const r of restes) {
    sansCode += r.sansCode || 0
    for (const l of r.parActivite || []) {
      const p = par.get(l.code) || { code: l.code, libelle: l.libelle, reste: 0 }
      p.reste = arrondi(p.reste + l.reste)
      par.set(l.code, p)
    }
  }
  return {
    parActivite: [...par.values()].sort((a, b) => a.code - b.code),
    sansCode: arrondi(sansCode),
    total: arrondi([...par.values()].reduce((s, l) => s + l.reste, 0)),
  }
}

// ── Le mur ───────────────────────────────────────────────────────────────────

/**
 * La charge cumulée, échéance par échéance — et la première date où ça casse.
 *
 * C'est la vraie réponse à « est-ce qu'on peut prendre ce projet ». Un verdict
 * sur une seule date ment par omission : le total de décembre peut tenir alors
 * que la semaine du 20 octobre est déjà impossible, parce que trois chantiers
 * tombent le même jour. On évalue donc CHAQUE échéance, avec tout ce qui est
 * dû avant elle.
 *
 * Les projets SANS échéance ne figurent dans aucun cumul : on ne sait pas
 * quand ils sont dus. Leurs heures sont rendues à part — c'est une dette
 * réelle, mais elle n'a pas de mur.
 *
 * Les échéances DÉJÀ PASSÉES ne font pas de palier non plus. Elles ne
 * tiendraient jamais — il n'y a plus une heure disponible avant elles — et
 * le « mur » désignerait alors toujours la plus vieille date en retard, au
 * lieu de la prochaine qui va céder. Ces heures sont rendues à part, et elles
 * continuent de peser sur tous les paliers suivants : un retard ne s'efface
 * pas, il se reporte.
 */
export function parEcheance(projets = [], { du, personnes = [], competences = {}, reglages = {}, absences = [], feries = [] } = {}) {
  const avec = projets.filter(p => versDate(p.deadline))
  const sansDate = projets.filter(p => !versDate(p.deadline))
  const retard = du ? avec.filter(p => p.deadline < du) : []
  // Comparaison de chaînes : 'YYYY-MM-DD' s'ordonne comme la date.
  const dates = [...new Set(avec.map(p => p.deadline).filter(d => !du || d >= du))].sort()

  const paliers = dates.map(date => {
    const concernes = projets.filter(p => p.deadline && p.deadline <= date)
    const besoins = cumuler(concernes.map(p => p.reste)).parActivite
    // La capacité se recalcule à chaque palier : les congés ne sont pas
    // répartis uniformément, et une semaine de vacances juste avant une
    // échéance ne se voit pas dans une moyenne.
    const gens = personnes.map(nom => ({
      ...capacitePersonne(nom, du, date, { reglages: reglages[nom] || {}, absences, feries }),
    }))
    const v = verdict(besoins, gens, competences)
    return { date, projets: concernes.map(p => p.id), ...v }
  })

  return {
    paliers,
    // Le premier palier qui ne tient pas : c'est là qu'il faut agir, et pas
    // avant. Tous les suivants en découlent.
    mur: paliers.find(p => !p.tient) || null,
    sansEcheance: {
      projets: sansDate.map(p => p.id),
      heures: arrondi(sansDate.reduce((s, p) => s + (p.reste?.total || 0), 0)),
    },
    // Ce qui est dû depuis une date déjà passée. Ce n'est pas un problème de
    // capacité mais de livraison : aucune heure ne peut plus y être placée.
    enRetard: {
      projets: retard.map(p => p.id),
      heures: arrondi(retard.reduce((s, p) => s + (p.reste?.total || 0), 0)),
    },
  }
}
