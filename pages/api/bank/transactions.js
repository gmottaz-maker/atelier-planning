import { getSupabaseServer } from '../../../lib/supabase-server'
import { findMatches } from '../../../lib/bankMatching'
import { loadCandidates } from '../../../lib/reconcileRun'
import { requireAdmin } from '../../../lib/requireAdmin'

const supabase = getSupabaseServer()

// Colonnes utiles à la liste et au tiroir — surtout PAS `raw` (bloc CAMT
// complet, lourd et jamais affiché).
const COLS = 'id, booking_date, value_date, amount, currency, description, reference, ' +
             'counterparty_name, counterparty_iban, account_iban, ' +
             'matched_to_type, matched_to_id, matched_at, matched_by, match_confidence'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  if (!(await requireAdmin(req, res))) return

  const { status, suggest_for } = req.query

  // Suggestions détaillées pour UNE transaction (à l'ouverture du tiroir).
  if (suggest_for) {
    const { data: tx, error } = await supabase.from('bank_transactions').select(COLS).eq('id', suggest_for).maybeSingle()
    if (error) return res.status(500).json({ error: error.message })
    if (!tx) return res.status(404).json({ error: 'Transaction introuvable' })
    if (tx.matched_to_type) return res.status(200).json({ suggestions: [] })
    const candidates = await loadCandidates(supabase)
    return res.status(200).json({ suggestions: findMatches(tx, candidates).slice(0, 5) })
  }

  let q = supabase.from('bank_transactions').select(COLS).order('booking_date', { ascending: false })
  if (status === 'matched')   q = q.not('matched_to_type', 'is', null)
  if (status === 'unmatched') q = q.is('matched_to_type', null)

  const { data: transactions, error } = await q
  if (error) return res.status(500).json({ error: error.message })

  // Badge « suggéré » : uniquement le meilleur score (un nombre), pas les
  // candidats complets — le détail est chargé à la demande via suggest_for.
  const unmatched = (transactions || []).filter(t => !t.matched_to_type)
  if (unmatched.length > 0) {
    const candidates = await loadCandidates(supabase)
    for (const tx of unmatched) tx.top_score = findMatches(tx, candidates)[0]?.score || 0
  }
  return res.status(200).json(transactions)
}
