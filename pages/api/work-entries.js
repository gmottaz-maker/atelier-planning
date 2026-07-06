import { getSupabaseServer } from '../../lib/supabase-server'
import { requireUser, ADMIN_USER } from '../../lib/requireAdmin'

export default async function handler(req, res) {
  const authUser = await requireUser(req, res)
  if (!authUser) return
  const isAdmin = authUser.name === ADMIN_USER
  // Un non-admin ne peut lire/écrire que ses propres heures, quel que soit
  // le userName envoyé par le client.
  const ownName = (requested) => (isAdmin ? (requested || authUser.name) : authUser.name)
  const supabase = getSupabaseServer()

  // ── GET – list entries ────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { from, to } = req.query
    const userName = ownName(req.query.userName)

    let query = supabase
      .from('work_entries')
      .select('*')
      .eq('user_name', userName)
      .order('date')

    if (from) query = query.gte('date', from)
    if (to)   query = query.lte('date', to)

    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  // ── POST – create / update entry (upsert by user_name+date+type) ──────────
  if (req.method === 'POST') {
    const { date, type, hours, pause_hours, note, arrival_time, departure_time } = req.body
    const userName = ownName(req.body.userName)

    if (!userName || !date || !type) {
      return res.status(400).json({ error: 'userName, date et type requis' })
    }
    const h = type === 'WORK' ? parseFloat(hours) : null
    const p = type === 'WORK' ? parseFloat(pause_hours ?? 1.0) : null
    if (type === 'WORK' && hours != null && hours !== '' && !Number.isFinite(h)) {
      return res.status(400).json({ error: 'hours invalide' })
    }
    if (type === 'WORK' && !Number.isFinite(p)) {
      return res.status(400).json({ error: 'pause_hours invalide' })
    }

    const { data, error } = await supabase
      .from('work_entries')
      .upsert(
        {
          user_name:      userName,
          date,
          type,
          hours:          Number.isFinite(h) ? h : null,
          pause_hours:    p,
          arrival_time:   type === 'WORK' ? (arrival_time || null) : null,
          departure_time: type === 'WORK' ? (departure_time || null) : null,
          note:           note || null,
          updated_at:     new Date().toISOString(),
        },
        { onConflict: 'user_name,date,type' }
      )
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  // ── DELETE – remove an entry by id ────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { id } = req.query
    const userName = ownName(req.query.userName)
    if (!id || !userName) return res.status(400).json({ error: 'id et userName requis' })

    const { error } = await supabase
      .from('work_entries')
      .delete()
      .eq('id', id)
      .eq('user_name', userName)

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ success: true })
  }

  return res.status(405).end()
}
