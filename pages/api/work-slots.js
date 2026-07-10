import { getSupabaseServer } from '../../lib/supabase-server'
import { requireUser } from '../../lib/requireAdmin'

const supabase = getSupabaseServer()

export default async function handler(req, res) {
  const user = await requireUser(req, res)
  if (!user) return

  // ── GET ?from=&to= : plages sur une plage de dates ──
  if (req.method === 'GET') {
    const { from, to } = req.query
    let q = supabase.from('work_slots').select('*, projects(name, color_override)').order('date')
    if (from) q = q.gte('date', from)
    if (to)   q = q.lte('date', to)
    const { data, error } = await q
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  // ── POST : créer une plage ──
  if (req.method === 'POST') {
    const { user_name, project_id, label, date, half } = req.body || {}
    if (!user_name || !date) return res.status(400).json({ error: 'user_name et date requis' })
    const { data, error } = await supabase.from('work_slots').insert({
      user_name,
      project_id: project_id || null,
      label: label || null,
      date,
      half: half === 'pm' ? 'pm' : 'am',
    }).select('*, projects(name, color_override)').single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  }

  // ── DELETE ?id= ──
  if (req.method === 'DELETE') {
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'id requis' })
    const { error } = await supabase.from('work_slots').delete().eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
