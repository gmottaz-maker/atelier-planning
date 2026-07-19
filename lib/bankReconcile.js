// Rapprochement automatique des paiements à l'import d'un CAMT, et au dépôt d'un
// justificatif.
//
// Marquer un document payé/rapproché à tort est plus coûteux qu'un rapprochement
// manuel : on n'automatise donc que les cas certains, et on laisse le reste à la
// main sur la page Banque.
import { findMatches } from './bankMatching'

// Un score de 8 exige, selon le type :
//  - facture (fournisseur/émise) : montant exact + référence QR ou IBAN,
//  - frais : montant exact + nom du commerçant + date proche.
// Dans tous les cas, une seule preuve « faible » ne suffit jamais.
export const AUTO_MIN_SCORE = 8
// Deux candidats voisins doivent être départagés à la main, pas au hasard.
export const AUTO_MIN_GAP = 2

// Une transaction ne matche que des candidats du bon sens :
//  - débit (sortie)  → facture fournisseur ou frais
//  - crédit (entrée) → facture émise
function poolFor(isCredit, candidates) {
  return isCredit
    ? { customer_invoices: candidates.customer_invoices || [] }
    : { supplier_invoices: candidates.supplier_invoices || [], expenses: candidates.expenses || [] }
}

/**
 * Décide, sans rien écrire, ce qui peut être rapproché tout seul.
 * transactions : lignes bank_transactions (montant signé, + crédit / − débit)
 * candidates   : { supplier_invoices, customer_invoices, expenses }
 *
 * Retourne { matched: [{ tx, type, candidate, score, reasons }], ambiguous: [{ tx, candidates }] }
 */
export function planAutoReconcile(transactions, candidates) {
  const matched = []
  const ambiguous = []
  const taken = new Set()   // un candidat (type#id) ne peut être rapproché qu'une fois

  for (const tx of transactions) {
    if (tx.matched_to_type) continue
    const amt = parseFloat(tx.amount)
    if (!amt) continue
    const isCredit = amt > 0

    // Retire les candidats déjà pris dans ce même passage
    const pool = poolFor(isCredit, candidates)
    const free = {}
    for (const [type, list] of Object.entries(pool)) {
      const t = type === 'customer_invoices' ? 'customer_invoice'
              : type === 'supplier_invoices' ? 'supplier_invoice' : 'expense'
      free[type] = list.filter(c => !taken.has(`${t}#${c.id}`))
    }

    const suggestions = findMatches(tx, free)
    const [best, second] = suggestions
    if (!best || best.score < AUTO_MIN_SCORE) continue

    if (second && best.score - second.score < AUTO_MIN_GAP) {
      ambiguous.push({ tx, candidates: [best, second] })
      continue
    }

    taken.add(`${best.type}#${best.candidate.id}`)
    matched.push({ tx, type: best.type, candidate: best.candidate, score: best.score, reasons: best.reasons })
  }
  return { matched, ambiguous }
}

// Date réelle du paiement : la date de comptabilisation du débit au relevé.
export function paymentDateOf(tx) {
  return String(tx.booking_date || tx.value_date || '').slice(0, 10) || null
}
