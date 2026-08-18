// Exécution du rapprochement automatique côté base : chargement des candidats,
// application des matchs certains, mise à jour des statuts de factures.
// Utilisé à l'import CAMT (transactions → candidats) et au dépôt d'un
// justificatif (nouveau frais → transactions non rapprochées).
import { planAutoReconcile, paymentDateOf } from './bankReconcile'

const INVOICE_TABLE = { supplier_invoice: 'supplier_invoices', customer_invoice: 'customer_invoices' }

// Ensemble des candidats déjà rapprochés à une transaction, par type, pour ne
// pas les reproposer (un frais/facture ne se paie qu'une fois).
async function matchedIds(supabase, type) {
  const { data } = await supabase.from('bank_transactions')
    .select('matched_to_id').eq('matched_to_type', type)
  return new Set((data || []).map(r => String(r.matched_to_id)))
}

// Charge les documents rapprochables (non déjà payés / non déjà liés).
export async function loadCandidates(supabase) {
  const [sup, cus, exp, mSup, mCus, mExp] = await Promise.all([
    supabase.from('supplier_invoices').select('*').in('status', ['pending', 'sent_to_bank']),
    supabase.from('customer_invoices').select('*').eq('status', 'pending'),
    supabase.from('expenses').select('*').eq('payment_method', 'company'),
    matchedIds(supabase, 'supplier_invoice'),
    matchedIds(supabase, 'customer_invoice'),
    matchedIds(supabase, 'expense'),
  ])
  return {
    supplier_invoices: (sup.data || []).filter(i => !mSup.has(String(i.id))),
    customer_invoices: (cus.data || []).filter(i => !mCus.has(String(i.id))),
    expenses:          (exp.data || []).filter(e => !mExp.has(String(e.id))),
  }
}

// Ancien chemin : deux UPDATE successifs. Conservé UNIQUEMENT comme repli tant
// que schema-integrite-financiere.sql n'a pas été joué. Il n'est pas atomique :
// si la seconde écriture échoue, la transaction reste marquée rapprochée et la
// facture impayée.
async function applyMatchNonAtomique(supabase, m, paidAt, matchedBy) {
  const { error: e1 } = await supabase.from('bank_transactions').update({
    matched_to_type: m.type,
    matched_to_id: m.candidate.id,
    matched_at: new Date().toISOString(),
    matched_by: matchedBy,
    match_confidence: m.score,
  }).eq('id', m.tx.id)
  if (e1) { console.error('Reconcile match error:', e1.message); return false }

  const table = INVOICE_TABLE[m.type]
  if (table) {
    const { error: e2 } = await supabase.from(table).update({
      status: 'paid', paid_transaction_id: m.tx.id, paid_at: paidAt,
    }).eq('id', m.candidate.id)
    if (e2) {
      console.error('INCOHÉRENCE : transaction', m.tx.id, 'rapprochée mais facture non soldée —', e2.message)
      return false
    }
  }
  return true
}

// Applique un match certain : lie la transaction ET solde la facture, dans une
// seule transaction PostgreSQL. Les deux écritures réussissent ou aucune.
async function applyMatch(supabase, m, adminName) {
  const paidAt = paymentDateOf(m.tx)
  const matchedBy = adminName ? `${adminName} (auto)` : 'auto'

  const { data, error } = await supabase.rpc('reconcile_match', {
    p_tx_id: m.tx.id,
    p_type: m.type,
    p_candidate_id: m.candidate.id,
    p_paid_at: paidAt,
    p_matched_by: matchedBy,
    p_score: m.score,
  })

  if (error) {
    // Fonction absente : la migration n'a pas encore été jouée.
    if (!/(does not exist|schema cache|not find the function)/i.test(error.message || '')) {
      console.error('reconcile_match:', error.message)
      return null
    }
    console.warn('reconcile_match absente — repli non atomique. Jouer schema-integrite-financiere.sql.')
    if (!await applyMatchNonAtomique(supabase, m, paidAt, matchedBy)) return null
  } else if (!data?.ok) {
    // Refus légitime : transaction déjà rapprochée, ou facture déjà payée par
    // une autre transaction. Ce n'est pas une erreur, on passe au suivant.
    return null
  }

  return {
    type: m.type,
    candidate_id: m.candidate.id,
    label: m.candidate.supplier_name || m.candidate.client_name || m.candidate.merchant || '—',
    number: m.candidate.invoice_number || null,
    amount: m.candidate.amount,
    paid_at: paidAt,
    score: m.score,
    reasons: m.reasons,
  }
}

// À l'import CAMT : confronte les transactions non rapprochées à tous les
// candidats. Balaie tous les débits/crédits libres, pas seulement ceux de cet
// import (un document saisi après coup se rapproche au CAMT suivant).
export async function reconcileTransactions(supabase, adminName) {
  const { data: txs, error } = await supabase.from('bank_transactions')
    .select('*').is('matched_to_type', null)
  if (error) { console.error('Reconcile read error:', error.message); return { reconciled: [], ambiguous: 0 } }

  const candidates = await loadCandidates(supabase)
  const { matched, ambiguous } = planAutoReconcile(txs || [], candidates)
  const reconciled = []
  for (const m of matched) {
    const r = await applyMatch(supabase, m, adminName)
    if (r) reconciled.push(r)
  }
  return { reconciled, ambiguous: ambiguous.length }
}

// Annote chaque frais d'un `matched_transaction` (date + montant du débit lié)
// pour afficher son statut de rapprochement dans la liste des justificatifs.
export async function withExpenseMatches(supabase, expenses) {
  const list = Array.isArray(expenses) ? expenses : []
  const ids = list.map(e => e.id)
  if (ids.length === 0) return list
  const { data } = await supabase.from('bank_transactions')
    .select('id, amount, booking_date, matched_to_id')
    .eq('matched_to_type', 'expense').in('matched_to_id', ids)
  const byId = new Map((data || []).map(t => [String(t.matched_to_id), t]))
  return list.map(e => {
    const t = byId.get(String(e.id))
    return { ...e, matched_transaction: t ? { id: t.id, amount: t.amount, date: t.booking_date } : null }
  })
}

// Au dépôt d'un justificatif : cherche le débit qui le solde. Renvoie
// 'matched' (lié tout seul), 'ambiguous' (plusieurs candidats, à valider), ou
// 'none'. N'écrit que dans le cas certain.
export async function reconcileNewExpense(supabase, expense, adminName) {
  if (!expense || expense.payment_method !== 'company') return { status: 'none' }
  const { data: txs } = await supabase.from('bank_transactions')
    .select('*').is('matched_to_type', null).lt('amount', 0)

  const { matched, ambiguous } = planAutoReconcile(txs || [], { expenses: [expense] })
  if (matched.length > 0) {
    const r = await applyMatch(supabase, matched[0], adminName)
    return { status: r ? 'matched' : 'none', transaction: r ? matched[0].tx : null }
  }
  if (ambiguous.length > 0) return { status: 'ambiguous', count: ambiguous[0].candidates.length }
  return { status: 'none' }
}
