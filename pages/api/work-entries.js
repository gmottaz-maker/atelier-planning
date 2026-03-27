import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}

export default async function handler(req, res) {
  const supabase = getSupabase()

  // ── GET – list entries ────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { userName, from, to } = req.query
    if (!userName) return res.status(400).json({ error: 'userName requis' })

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
    const { userName, date, type, hours, note } = req.body

    if (!userName || !date || !type) {
      return res.status(400).json({ error: 'userName, date et type requis' })
    }

    const { data, error } = await supabase
      .from('work_entries')
      .upsert(
        {
          user_name: userName,
          date,
          type,
          hours:      type === 'WORK' ? parseFloat(hours) || null : null,
          note:       note || null,
          updated_at: new Date().toISOString(),
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
    const { id, userName } = req.query
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
