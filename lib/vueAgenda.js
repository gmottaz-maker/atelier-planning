// Calculs de l'agenda d'essai (/agenda/essai).
//
// L'agenda reste celui de lib/agenda.js — mêmes blocs, mêmes demi-journées,
// même semaine type. Ce fichier ne fait que dire, pour l'écran, ce que montre
// une demi-journée : une absence, des blocs, la place qui reste.

import { minutesPlacees, placeLibre, typeDe } from './agenda'

export const ABSENCES = {
  VACATION: 'Vacances',
  VACATION_AM: 'Congé le matin',
  VACATION_PM: 'Congé l’après-midi',
  SICK: 'Maladie',
  HOLIDAY: 'Férié',
}

/** Ce qui rend une demi-journée indisponible, pour une personne, ce jour-là. */
export function absenceDe(entrees = [], nom, date, demi) {
  for (const e of entrees) {
    if (e.user_name !== nom || e.date !== date) continue
    if (e.type === 'VACATION' || e.type === 'SICK' || e.type === 'HOLIDAY') return ABSENCES[e.type]
    if (e.type === 'VACATION_AM' && demi === 'am') return ABSENCES.VACATION_AM
    if (e.type === 'VACATION_PM' && demi === 'pm') return ABSENCES.VACATION_PM
  }
  return null
}

// Trois familles, pas huit couleurs : où l'on est quand le bloc a lieu.
// À l'atelier (encre), dehors chez le client (cobalt), au bureau (gris).
const FAMILLES = {
  production: 'atelier', entretien: 'atelier',
  montage: 'dehors', demontage: 'dehors', trajet: 'dehors',
  meeting: 'bureau', admin: 'bureau', autre: 'bureau',
}
export const NOMS_FAMILLES = { atelier: 'À l’atelier', dehors: 'Dehors', bureau: 'Bureau' }
export const familleBloc = type => FAMILLES[type] || 'bureau'

/** Ce que dit un bloc en une ligne : son type, puis le projet ou le titre. */
export function libelleBloc(b) {
  const type = typeDe(b?.type)?.label || b?.type || 'bloc'
  const p = b?.projects
  return {
    type: type[0].toUpperCase() + type.slice(1),
    numero: p?.numero ?? null,
    quoi: p?.name || b?.titre || '',
  }
}

/**
 * Une demi-journée telle que l'écran la dessine. Sans contrat connu
 * (`parJour` nul), on ne sait pas ce qu'elle vaut : ni place libre ni
 * dépassement, plutôt que de les inventer.
 */
export function demiJournee({ blocs = [], absence = null, defaut = null, parJour = 0 } = {}) {
  if (absence) return { absence, blocs: [], libre: null, trop: false, defaut: null }
  const connu = parJour > 0
  return {
    absence: null,
    blocs,
    libre: connu && blocs.length ? placeLibre(blocs, parJour) : null,
    trop: connu && minutesPlacees(blocs, parJour) > Math.round((parJour / 2) * 60),
    defaut: blocs.length ? null : defaut,
  }
}

/** Le résumé d'une semaine : combien de blocs, combien de demi-journées dehors. */
export function resumeSemaine(blocs = []) {
  const dehors = new Set(blocs.filter(b => familleBloc(b.type) === 'dehors').map(b => `${b.user_name}|${b.date}|${b.demi}`))
  return { blocs: blocs.length, dehors: dehors.size }
}

/** « 2 h 30 », « 4 h » — le grain est la demi-heure. */
export const duree = m => (m % 60 === 0 ? `${m / 60} h` : `${Math.floor(m / 60)} h ${m % 60}`)
