// Jours fériés du canton de Vaud.
//
// Extrait de `pages/schedule.js`, où il vivait au milieu d'un composant : la
// jauge de charge en a besoin aussi, et deux copies d'un calcul de Pâques
// finiraient par diverger — ou, pire, par ne pas diverger tout en étant
// fausses toutes les deux.
//
// Il MANQUAIT le Lundi du Jeûne fédéral, qui est férié dans le canton : une
// journée de travail comptée en trop chaque année, et une jauge d'autant trop
// optimiste au mois de septembre.
//
// Le 1er mai n'y est pas, et c'est volontaire : il est férié à Genève et dans
// quelques communes, pas dans le canton de Vaud.

/** Dimanche de Pâques (algorithme grégorien de Gauss / Meeus). */
export function paques(annee) {
  const a = annee % 19, b = Math.floor(annee / 100), c = annee % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mois = Math.floor((h + l - 7 * m + 114) / 31) - 1
  const jour = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(annee, mois, jour)
}

/**
 * Lundi du Jeûne fédéral : le lundi qui suit le TROISIÈME dimanche de
 * septembre. C'est le seul férié vaudois qui ne se déduit ni d'une date fixe
 * ni de Pâques, et c'est pour ça qu'il avait été oublié.
 */
export function lundiDuJeune(annee) {
  const premier = new Date(annee, 8, 1)          // 1er septembre
  // getDay() : 0 = dimanche. Décalage jusqu'au premier dimanche du mois.
  const premierDimanche = 1 + ((7 - premier.getDay()) % 7)
  const troisieme = new Date(annee, 8, premierDimanche + 14)
  troisieme.setDate(troisieme.getDate() + 1)
  return troisieme
}

const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const plus = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r }

/** Les fériés vaudois d'une année : `[{ date: 'YYYY-MM-DD', label }]`, triés. */
export function joursFeries(annee) {
  const p = paques(annee)
  return [
    { date: fmt(new Date(annee, 0, 1)),   label: 'Nouvel An' },
    { date: fmt(new Date(annee, 0, 2)),   label: 'Berchtoldstag' },
    { date: fmt(plus(p, -2)),             label: 'Vendredi Saint' },
    { date: fmt(plus(p, 1)),              label: 'Lundi de Pâques' },
    { date: fmt(plus(p, 39)),             label: 'Ascension' },
    { date: fmt(plus(p, 50)),             label: 'Lundi de Pentecôte' },
    { date: fmt(new Date(annee, 7, 1)),   label: 'Fête nationale' },
    { date: fmt(lundiDuJeune(annee)),     label: 'Lundi du Jeûne fédéral' },
    { date: fmt(new Date(annee, 11, 25)), label: 'Noël' },
  ].sort((a, b) => a.date.localeCompare(b.date))
}

/** Les dates seules, sur plusieurs années — ce dont la jauge a besoin. */
export function datesFeriees(deAnnee, aAnnee = deAnnee) {
  const out = []
  for (let a = deAnnee; a <= aAnnee; a++) out.push(...joursFeries(a).map(j => j.date))
  return out
}
