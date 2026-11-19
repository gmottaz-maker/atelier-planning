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
 * Une facture est archivée si on l'a rangée à la main, ou si elle est payée et
 * que le mois du paiement est révolu. On se rabat sur la date d'émission quand
 * `paid_at` est vide — une facture marquée payée sans date ne doit pas rester
 * indéfiniment en tête de liste.
 *
 * `archived_at` PRIME, comme `quote_data.archived` prime pour une offre : la
 * règle automatique ne sait ranger que ce qui finit par être payé, et une
 * facture annulée ou un brouillon jamais envoyé ne le seront jamais. Ils
 * restaient donc dans la liste courante à vie.
 */
export function factureArchivee(inv, maintenant = new Date()) {
  if (inv?.archived_at) return true
  if (inv?.status !== 'paid') return false
  return moisRevolu(inv.paid_at || inv.issue_date || inv.created_at, maintenant)
}

/**
 * Peut-on ranger cette facture à la main ?
 *
 * Non quand de l'argent est encore attendu. Une facture envoyée ou en attente
 * est une créance ouverte : la sortir de la liste courante, c'est se retirer
 * de sous les yeux la ligne qu'on doit relancer. Le total « à encaisser » la
 * compterait toujours, et l'écart entre le chiffre et la liste serait
 * incompréhensible.
 *
 * Oui pour ce qui est clos (payée, annulée) et pour un brouillon jamais parti,
 * qui est le cas le plus fréquent : une facture créée par erreur.
 */
export const ARCHIVABLES = ['created', 'paid', 'cancelled']

export function peutArchiver(inv) {
  if (!inv || inv.archived_at) return false
  return ARCHIVABLES.includes(inv.status)
}
