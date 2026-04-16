import { getSupabaseServer } from '../../lib/supabase-server'

/**
 * GET  /api/clock-session?userName=X  → session en cours ou null
 * POST /api/clock-session             → { userName, clock_in_at, date } → upsert
 * DELETE /api/clock-session?userName=X → supprime la session
 */
export default async function handler(req, res) {
  const supabase = getSupabaseServer()

  if (req.method === 'GET') {
    const { userName } = req.query
    if (!userName) return res.status(400).json({ error: 'userName requis' })
    const { data } = await supabase
      .from('clock_sessions')
      .select('*')
      .eq('user_name', userName)
      .maybeSingle()
    return res.status(200).json(data || null)
  }

  if (req.method === 'POST') {
    const { userName, clock_in_at, date } = req.body
    if (!userName || !clock_in_at) return res.status(400).json({ error: 'Paramètres manquants' })
    const { data, error } = await supabase
      .from('clock_sessions')
      .upsert({ user_name: userName, clock_in_at, date }, { onConflict: 'user_name' })
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  if (req.method === 'DELETE') {
    const { userName } = req.query
    if (!userName) return res.status(400).json({ error: 'userName requis' })
    const { error } = await supabase
      .from('clock_sessions')
      .delete()
      .eq('user_name', userName)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
