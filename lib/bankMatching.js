// Matching algo : transaction bancaire ↔ supplier_invoice / customer_invoice / expense.
// Retourne des suggestions avec un score 0-10, et un drapeau `certain`.
import { merchantKey } from './merchantAccounts'

function norm(s) {
  return (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

function daysBetween(a, b) {
  if (!a || !b) return Infinity
  const da = new Date(a), db = new Date(b)
  return Math.abs((da - db) / 86400000)
}

function levenshteinSim(a, b) {
  a = norm(a); b = norm(b)
  if (!a || !b) return 0
  if (a === b) return 1
  // Approximation simple : longueur de la plus longue sous-chaîne commune
  const longer = a.length > b.length ? a : b
  const shorter = a.length > b.length ? b : a
  if (shorter.length === 0) return 0
  if (longer.includes(shorter)) return shorter.length / longer.length
  // Levenshtein simplifié
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return 1 - (dp[m][n] / Math.max(m, n))
}

// Le libellé bancaire d'une carte porte l'enseigne PLUS la succursale et un
// numéro : « MIGROS LAUSANNE GARE 4144 » là où le ticket dit « Migros ».
//
// `levenshteinSim` traitait ce cas par un ratio de longueurs — 0,24 pour cet
// exemple, sous le seuil du « nom proche ». Autrement dit, le commerçant le
// plus évident du monde ne rapportait aucun point. C'est ce qui empêchait le
// rapprochement automatique de se déclencher sur les tickets de courses.
//
// On compare donc sur la clé normalisée de merchantAccounts (accents, formes
// juridiques, ponctuation et suffixes web retirés), et l'INCLUSION vaut
// identité. Le garde-fou est la longueur : sous 4 caractères, une clé se
// retrouve dans trop de noms pour rien vouloir dire.
export function memeCommercant(a, b) {
  const ka = merchantKey(a), kb = merchantKey(b)
  if (!ka || !kb) return false
  if (ka === kb) return true
  const court = ka.length <= kb.length ? ka : kb
  const long  = ka.length <= kb.length ? kb : ka
  return court.length >= 4 && long.includes(court)
}

function refContains(haystack, needle) {
  if (!haystack || !needle) return false
  const a = String(haystack).replace(/\s/g, '')
  const b = String(needle).replace(/\s/g, '')
  if (!b || b.length < 4) return false
  return a.toLowerCase().includes(b.toLowerCase()) || b.toLowerCase().includes(a.toLowerCase())
}

/**
 * Score un candidat. Retourne un objet { score, reasons }.
 * tx: bank_transactions row (signed amount: + crédit, - débit)
 * candidate: row from supplier_invoices | customer_invoices | expenses
 * candidateType: 'supplier_invoice' | 'customer_invoice' | 'expense'
 */
export function scoreCandidate(tx, candidate, candidateType) {
  let score = 0
  const reasons = []
  const txAmount = Math.abs(parseFloat(tx.amount))
  const candAmount = Math.abs(parseFloat(candidate.amount))

  // 1) Direction (débit vs crédit) — éliminatoire
  const isCredit = parseFloat(tx.amount) > 0
  if (candidateType === 'supplier_invoice' && isCredit) return { score: 0, reasons: ['mauvais sens'] }
  if (candidateType === 'customer_invoice' && !isCredit) return { score: 0, reasons: ['mauvais sens'] }
  if (candidateType === 'expense' && isCredit) return { score: 0, reasons: ['mauvais sens'] }

  // 2) Montant
  const delta = Math.abs(txAmount - candAmount)
  const montantExact = delta < 0.01
  if (montantExact) { score += 5; reasons.push('montant exact') }
  else if (delta < 1)   { score += 3; reasons.push('montant à 1 CHF près') }
  else if (delta / candAmount < 0.02) { score += 1; reasons.push('montant ±2%') }
  else return { score: 0, reasons: [`montant différent (${delta.toFixed(2)})`] }

  // 3) Référence
  const candRef = candidate.payment_reference || candidate.qr_reference || candidate.invoice_number || null
  if (candRef && (refContains(tx.reference, candRef) || refContains(tx.description, candRef) || refContains(tx.end_to_end_id, candRef))) {
    score += 5
    reasons.push('référence trouvée')
  }

  // 4) IBAN bénéficiaire (pour supplier_invoice)
  if (candidateType === 'supplier_invoice' && candidate.iban && tx.counterparty_iban
      && candidate.iban.replace(/\s/g, '').toLowerCase() === tx.counterparty_iban.replace(/\s/g, '').toLowerCase()) {
    score += 3
    reasons.push('IBAN match')
  }

  // 5) Nom contrepartie
  const candName = candidate.supplier_name || candidate.client_name || candidate.merchant || null
  let commercantIdentique = false
  if (candName && tx.counterparty_name) {
    if (memeCommercant(candName, tx.counterparty_name)) {
      commercantIdentique = true
      score += 2
      reasons.push('commerçant identique')
    } else if (levenshteinSim(candName, tx.counterparty_name) > 0.6) {
      score += 1
      reasons.push('nom proche')
    }
  }

  // 6) Date — bookingDate vs issue_date / due_date
  const candDate = candidate.due_date || candidate.issue_date || candidate.date
  const days = daysBetween(tx.booking_date, candDate)
  if (days <= 3)  { score += 2; reasons.push('date proche (≤3j)') }
  else if (days <= 14) { score += 1; reasons.push('date proche (≤14j)') }
  else if (days > 90)  { score -= 2; reasons.push(`date éloignée (${Math.round(days)}j)`) }

  // 7) Ordre transmis à la banque : le débit tombe sur la date de paiement annoncée
  if (candidate.scheduled_payment_date && daysBetween(tx.booking_date, candidate.scheduled_payment_date) <= 5) {
    score += 2
    reasons.push('date de paiement annoncée')
  }

  // Montant exact ET commerçant identique : il n'y a plus rien à départager.
  // C'est une CERTITUDE, pas un score élevé — elle se suffit à elle-même, quelle
  // que soit la date. Un ticket peut être déposé des semaines après l'achat.
  const certain = montantExact && commercantIdentique

  return { score: Math.max(0, Math.min(10, score)), reasons, certain }
}

/**
 * Pour une transaction donnée, classe tous les candidats et retourne le top.
 * candidates: { supplier_invoices: [], customer_invoices: [], expenses: [] }
 */
export function findMatches(tx, candidates) {
  const suggestions = []
  for (const [type, list] of [
    ['supplier_invoice', candidates.supplier_invoices || []],
    ['customer_invoice', candidates.customer_invoices || []],
    ['expense',          candidates.expenses || []],
  ]) {
    for (const c of list) {
      const r = scoreCandidate(tx, c, type)
      if (r.score > 0) suggestions.push({ type, candidate: c, score: r.score, reasons: r.reasons, certain: r.certain })
    }
  }
  suggestions.sort((a, b) => b.score - a.score)
  return suggestions
}
