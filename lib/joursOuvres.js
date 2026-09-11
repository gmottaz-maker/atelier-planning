// Décompte de l'écran de l'atelier, en jours TRAVAILLÉS.
//
// L'atelier travaille le lundi, le mardi, le jeudi et le vendredi : ni le
// mercredi, ni le week-end. Un « J-7 » calendaire annonçait une semaine et
// demie de travail là où il en reste quatre jours — de quoi se croire large
// la veille d'un rendu.
//
// Seul le NOMBRE affiché change. Les couleurs d'urgence, les groupes « Cette
// semaine » / « 2 prochaines semaines » et la longueur des barres du planning
// restent calendaires : ce sont des repères de calendrier, et une barre doit
// tomber sur la bonne colonne de date.
//
// Les dates se comparent en chaînes YYYY-MM-DD et se construisent en heure
// LOCALE (cf. lib/aujourdhui.js) : `new Date('2026-09-15')` est minuit UTC,
// soit la veille à 22h ou 23h en Suisse selon la saison.

import { dateDuJour } from './aujourdhui'

/** getDay() des jours travaillés : lundi, mardi, jeudi, vendredi. */
export const JOURS_TRAVAILLES = [1, 2, 4, 5]

export const estJourTravaille = d => JOURS_TRAVAILLES.includes(d.getDay())

const FORME = /^\d{4}-\d{2}-\d{2}$/

/** 'YYYY-MM-DD' → Date à minuit LOCAL, ou null. */
function versDate(s) {
  if (!FORME.test(String(s || ''))) return null
  const [y, m, j] = s.split('-').map(Number)
  const d = new Date(y, m - 1, j)
  // Rejette le 31 février, que Date replierait en silence sur le 3 mars.
  return d.getDate() === j && d.getMonth() === m - 1 ? d : null
}

/**
 * Jours travaillés entre demain et l'échéance incluse.
 * null sans date valable ou si l'échéance est passée.
 */
export function joursOuvresRestants(deadline, aujourdhui = dateDuJour()) {
  const fin = versDate(deadline)
  const debut = versDate(aujourdhui)
  if (!fin || !debut || deadline < aujourdhui) return null
  let n = 0
  const d = new Date(debut)
  for (;;) {
    // setDate et non + 86 400 000 ms : les journées de changement d'heure
    // font 23 ou 25 heures.
    d.setDate(d.getDate() + 1)
    if (d > fin) break
    if (estJourTravaille(d)) n += 1
  }
  return n
}

/** Jours CALENDAIRES de retard : c'est du temps écoulé, pas du travail. */
export function joursDeRetard(deadline, aujourdhui = dateDuJour()) {
  const fin = versDate(deadline)
  const debut = versDate(aujourdhui)
  if (!fin || !debut || deadline >= aujourdhui) return 0
  return Math.round((debut - fin) / 86_400_000)
}

/** Le libellé du décompte : « Sans date », « Retard 2j », « Aujourd'hui ! », « J-4 ». */
export function decompte(deadline, aujourdhui = dateDuJour()) {
  if (!versDate(deadline)) return 'Sans date'
  if (deadline === aujourdhui) return "Aujourd'hui !"
  if (deadline < aujourdhui) return `Retard ${joursDeRetard(deadline, aujourdhui)}j`
  return `J-${joursOuvresRestants(deadline, aujourdhui)}`
}
