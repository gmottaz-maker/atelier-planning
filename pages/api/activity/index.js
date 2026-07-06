import { getSupabaseServer } from '../../../lib/supabase-server'
const supabase = getSupabaseServer()
import { requireUser } from '../../../lib/requireAdmin'

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
