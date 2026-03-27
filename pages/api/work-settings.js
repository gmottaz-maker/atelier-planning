import { getSupabaseServer } from '../../lib/supabase-server'

export default async function handler(req, res) {
  const supabase = getSupabaseServer()
  const year = parseInt(req.query.year) || new Date().getFullYear()

  // GET – settings for one user (or all users for admin)
  if (req.method === 'GET') {
    const { userName } = req.query

    if (!userName) {
      // Admin: return all users' settings for the year
      const { data, error } = await supabase
        .from('work_settings')
        .select('*')
        .eq('year', year)
        .order('user_name')
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json(data)
    }

    const { data, error } = await supabase
      .from('work_settings')
      .select('*')
      .eq('user_name', userName)
      .eq('year', year)
      .single()

    if (error && error.code === 'PGRST116') {
      // Not found → return defaults
      return res.status(200).json({
        user_name: userName,
        year,
        vacation_days: 20,
        weekly_hours: 42.0,
        off_days: [],
      })
    }
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  // POST – upsert settings
  if (req.method === 'POST') {
    const { userName, vacation_days, weekly_hours, off_days } = req.body

    if (!userName) return res.status(400).json({ error: 'userName requis' })

    const { data, error } = await supabase
      .from('work_settings')
      .upsert(
        {
          user_name:    userName,
          year,
          vacation_days: parseInt(vacation_days),
          weekly_hours:  parseFloat(weekly_hours),
          off_days:      Array.isArray(off_days) ? off_days : [],
        },
        { onConflict: 'user_name,year' }
      )
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  return res.status(405).end()
}
