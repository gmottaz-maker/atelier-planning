import { getSupabaseServer } from '../../../lib/supabase-server'
import { findMatches } from '../../../lib/bankMatching'
import { requireAdmin } from '../../../lib/requireAdmin'

const supabase = getSupabaseServer()

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  if (!(await requireAdmin(req, res))) return

  const { status, suggestions } = req.query  // status: 'all'|'matched'|'unmatched', suggestions: '1'

  let q = supabase.from('bank_transactions').select('*').order('booking_date', { ascending: false })
  if (status === 'matched')   q = q.not('matched_to_type', 'is', null)
  if (status === 'unmatched') q = q.is('matched_to_type', null)

  const { data: transactions, error } = await q
  if (error) return res.status(500).json({ error: error.message })

  let result = transactions
  if (suggestions === '1') {
    // Charger les candidats pertinents (factures pending + dépenses récentes)
    const [{ data: suppliers }, { data: customers }, { data: expenses }] = await Promise.all([
      supabase.from('supplier_invoices').select('*').eq('status', 'pending'),
      supabase.from('customer_invoices').select('*').eq('status', 'pending'),
      supabase.from('expenses').select('*').order('date', { ascending: false }).limit(200),
    ])
    const candidates = {
      supplier_invoices: suppliers || [],
      customer_invoices: customers || [],
      expenses: expenses || [],
    }
    result = transactions.map(tx => ({
      ...tx,
      suggestions: tx.matched_to_type ? [] : findMatches(tx, candidates).slice(0, 5),
    }))
  }
  return res.status(200).json(result)
}
