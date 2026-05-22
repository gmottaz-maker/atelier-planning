// Endpoint admin : liste TOUS les frais (justificatifs) tous utilisateurs confondus.
import { getSupabaseServer } from '../../../lib/supabase-server'
import { requireAdmin } from '../../../lib/requireAdmin'

const supabase = getSupabaseServer()
const BUCKET = 'receipts'

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return
  if (req.method !== 'GET') return res.status(405).end()

  const { year, payment_method } = req.query
  const y    = year || new Date().getFullYear()
  const from = `${y}-01-01`
  const to   = `${y}-12-31`

  let q = supabase.from('expenses').select('*')
    .gte('date', from).lte('date', to)
    .order('date', { ascending: false })
  if (payment_method) q = q.eq('payment_method', payment_method)

  const { data, error } = await q
  if (error) return res.status(500).json({ error: error.message })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const rows = (data || []).map(e => ({
    ...e,
    receipt_url: e.receipt_path ? `${url}/storage/v1/object/public/${BUCKET}/${e.receipt_path}` : null,
  }))
  return res.status(200).json(rows)
}
