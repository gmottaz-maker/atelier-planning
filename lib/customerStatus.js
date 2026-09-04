// Statuts d'une facture cliente.
//
// Stockés en base : created | sent | pending | paid | cancelled
// Calculé à l'affichage : overdue (échéance dépassée, rien n'est encore rentré)
// — ne jamais l'écrire en base.
//
// Le pendant de lib/supplierStatus.js, et les deux vocabulaires sont bien
// DISTINCTS : « pending » ne veut pas dire la même chose des deux côtés. Les
// confondre a déjà coûté cher (cf. loadCandidates dans lib/reconcileRun.js).
import { dateDuJour } from './aujourdhui'

export const STATUTS_STOCKES = ['created', 'sent', 'pending', 'paid', 'cancelled']

// Comparaison de chaînes YYYY-MM-DD, volontaire : `new Date('2026-09-04')` est
// interprété en UTC, et faisait basculer une facture « en retard » dès la
// veille au soir en heure suisse.
export function effectiveStatus(inv, today = dateDuJour()) {
  if (!inv) return 'created'
  if (inv.status === 'paid' || inv.status === 'cancelled') return inv.status
  if (inv.status === 'created') return 'created'
  const due = String(inv.due_date || '').slice(0, 10)
  if (due && due < today) return 'overdue'
  return inv.status === 'sent' ? 'sent' : 'pending'
}

/**
 * La facture entre-t-elle dans le filtre choisi ?
 *
 * « En retard » est une lecture TRANSVERSALE, pas un état qui en remplace un
 * autre : une facture envoyée et échue reste une facture envoyée. Le filtre
 * « Envoyée » la garde donc, et « En attente » de même — sinon les plus
 * urgentes disparaissent des deux filtres où on les cherche.
 *
 * C'est pour ça qu'on interroge ici le statut STOCKÉ et non le calculé :
 * `effectiveStatus` écrase « sent » et « pending » par « overdue », et ne
 * permet plus de savoir lequel des deux c'était.
 *
 * `archived` n'est pas traité ici : l'archivage se décide sur d'autres
 * critères (lib/autoArchive.js) et la page le filtre en amont.
 */
export function correspondAuFiltre(inv, filtre, today = dateDuJour()) {
  if (!filtre || filtre === 'all') return true
  if (filtre === 'overdue') return effectiveStatus(inv, today) === 'overdue'
  if (filtre === 'sent' || filtre === 'pending') return inv?.status === filtre
  return effectiveStatus(inv, today) === filtre
}
