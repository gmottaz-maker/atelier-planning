// Formatage des montants, indépendant de la version de Node.
//
// `Intl.NumberFormat('fr-CH')` s'appuie sur les données ICU embarquées dans
// Node : le séparateur de milliers a changé d'une version à l'autre. La CI
// (Node 20) et la machine de développement (Node 25) ne produisaient donc pas
// le même texte, et surtout : le séparateur imprimé sur une facture dépendait
// de la version de Node qu'exécutait Vercel ce jour-là.
//
// L'usage suisse est l'apostrophe pour les milliers et la virgule pour les
// décimales. On l'écrit donc explicitement, une fois pour toutes.

const APOSTROPHE = "'"

/** 1234.5 → « 1'234,50 ». Toujours deux décimales. */
export function fmtCHF(n) {
  return fmtNombre(n, 2)
}

/** 1234.5 → « 1'235 ». Pour les vues d'ensemble, sans centimes. */
export function fmtCHF0(n) {
  return fmtNombre(n, 0)
}

export function fmtNombre(n, decimales = 2) {
  const valeur = Number(n)
  const sur = Number.isFinite(valeur) ? valeur : 0
  const negatif = sur < 0 || Object.is(sur, -0)
  const fixe = Math.abs(sur).toFixed(decimales)
  const [entiere, frac] = fixe.split('.')
  const groupee = entiere.replace(/\B(?=(\d{3})+(?!\d))/g, APOSTROPHE)
  return `${negatif && Number(fixe) !== 0 ? '−' : ''}${groupee}${frac ? ',' + frac : ''}`
}
