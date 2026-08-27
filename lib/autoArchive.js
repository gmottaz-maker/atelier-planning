// Archivage automatique en fin de mois.
//
// Règle métier commune aux offres et aux factures : une pièce qui a atteint son
// terme (offre facturée, facture payée) reste visible jusqu'à la fin du mois où
// elle l'a atteint, puis disparaît de la liste courante. Elle reste accessible
// par le filtre « archivées ».
//
// C'est une règle DÉRIVÉE, pas un champ écrit en base, et c'est délibéré :
//   - rien à planifier, aucun cron, aucune migration ;
//   - rien n'est écrit au chargement d'une page — un rendu ne doit pas avoir
//     d'effet de bord sur les données ;
//   - l'archivage manuel (`quote_data.archived`) continue de fonctionner à
//     côté, et prime.

/** Le mois de `dateISO` est-il révolu ? (strictement antérieur au mois courant) */
export function moisRevolu(dateISO, maintenant = new Date()) {
  if (!dateISO) return false
  const d = new Date(dateISO)
  if (Number.isNaN(d.getTime())) return false
  const moisPiece = d.getFullYear() * 12 + d.getMonth()
  const moisCourant = maintenant.getFullYear() * 12 + maintenant.getMonth()
  return moisPiece < moisCourant
}

/**
 * Une offre est archivée si elle l'a été à la main, ou si elle a été facturée
 * dans un mois désormais révolu.
 */
export function offreArchivee(offre, maintenant = new Date()) {
  if (offre?.archived) return true
  const inv = offre?.invoice
  return !!inv && moisRevolu(inv.issue_date || inv.created_at, maintenant)
}

/**
 * Une facture est archivée si elle est payée et que le mois du paiement est
 * révolu. On se rabat sur la date d'émission quand `paid_at` est vide — une
 * facture marquée payée sans date ne doit pas rester indéfiniment en tête de
 * liste.
 */
export function factureArchivee(inv, maintenant = new Date()) {
  if (inv?.status !== 'paid') return false
  return moisRevolu(inv.paid_at || inv.issue_date || inv.created_at, maintenant)
}
