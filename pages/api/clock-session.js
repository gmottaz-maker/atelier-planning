import { getSupabaseServer } from '../../lib/supabase-server'
import { requireUser, ADMIN_USER } from '../../lib/requireAdmin'

/**
 * GET  /api/clock-session?userName=X  → session en cours ou null
 * POST /api/clock-session             → { userName, clock_in_at, date } → upsert
 * DELETE /api/clock-session?userName=X → supprime la session
 * L'identité est vérifiée par JWT : un non-admin ne pointe que pour lui-même.
 */
export default async function handler(req, res) {
  const authUser = await requireUser(req, res)
  if (!authUser) return
  const isAdmin = authUser.name === ADMIN_USER
  const ownName = (requested) => (isAdmin ? (requested || authUser.name) : authUser.name)
  const supabase = getSupabaseServer()

  if (req.method === 'GET') {
    const userName = ownName(req.query.userName)
    if (!userName) return res.status(400).json({ error: 'userName requis' })
    const { data } = await supabase
      .from('clock_sessions')
      .select('*')
      .eq('user_name', userName)
      .maybeSingle()
    return res.status(200).json(data || null)
  }

  if (req.method === 'POST') {
    const { clock_in_at, date } = req.body
    const userName = ownName(req.body.userName)
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
    const userName = ownName(req.query.userName)
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
