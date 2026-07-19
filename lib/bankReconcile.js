// Rapprochement automatique des paiements fournisseurs à l'import d'un CAMT.
//
// Marquer une facture payée à tort est plus coûteux qu'un rapprochement manuel :
// on n'automatise donc que les cas certains, et on laisse le reste à la main.
import { findMatches } from './bankMatching'

// Un score de 8 demande au minimum le montant exact plus une preuve d'identité
// du bénéficiaire (référence QR ou IBAN) — cf. scoreCandidate.
export const AUTO_MIN_SCORE = 8
// Deux factures voisines (même fournisseur, même montant) doivent être
// départagées à la main plutôt qu'au hasard.
export const AUTO_MIN_GAP = 2

/**
 * Décide, sans rien écrire, ce qui peut être rapproché tout seul.
 * transactions : lignes bank_transactions (montant signé, + crédit / − débit)
 * invoices     : supplier_invoices candidates (statuts pending / sent_to_bank)
 *
 * Retourne { matched: [{ tx, invoice, score, reasons }], ambiguous: [{ tx, candidates }] }
 */
export function planAutoReconcile(transactions, invoices) {
  const matched = []
  const ambiguous = []
  const taken = new Set()   // une facture ne peut être payée que par un seul débit

  for (const tx of transactions) {
    if (tx.matched_to_type) continue
    if (parseFloat(tx.amount) >= 0) continue   // un paiement fournisseur est un débit

    const pool = invoices.filter(i => !taken.has(i.id))
    const suggestions = findMatches(tx, { supplier_invoices: pool })
    const [best, second] = suggestions
    if (!best || best.score < AUTO_MIN_SCORE) continue

    if (second && best.score - second.score < AUTO_MIN_GAP) {
      ambiguous.push({ tx, candidates: [best, second] })
      continue
    }

    taken.add(best.candidate.id)
    matched.push({ tx, invoice: best.candidate, score: best.score, reasons: best.reasons })
  }
  return { matched, ambiguous }
}

// Date réelle du paiement : la date de comptabilisation du débit au relevé.
export function paymentDateOf(tx) {
  return String(tx.booking_date || tx.value_date || '').slice(0, 10) || null
}
