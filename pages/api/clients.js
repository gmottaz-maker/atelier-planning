import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const { q, limit = 20 } = req.query

  let query = supabase
    .from('clients')
    .select('id, name, email, phone, city, is_company, active')
    .eq('active', true)
    .order('name')
    .limit(Number(limit))

  if (q) {
    query = query.ilike('name', `%${q}%`)
  }

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })

  return res.status(200).json(data)
}
