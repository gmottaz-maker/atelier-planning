// Total d'un devis. L'implémentation vit dans lib/quoteLines.js, seule source
// du barème : l'éditeur, le PDF et la validation serveur des factures doivent
// compter pareil, sans quoi une facture juste finit refusée.
import { totauxDevis } from './quoteLines'

export function computeQuoteTotal(q) {
  return totauxDevis(q).total
}
