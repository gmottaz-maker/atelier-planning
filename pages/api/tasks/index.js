import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}

export default async function handler(req, res) {
  const supabase = getSupabase()

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('tasks')
      .select('*, projects(id, name, color_override)')
      .order('execution_date', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  if (req.method === 'POST') {
    const { title, project_id, responsible, execution_date, due_date, is_private, notes } = req.body

    if (!title || !responsible || !execution_date) {
      return res.status(400).json({ error: 'Champs obligatoires manquants' })
    }

    const { data, error } = await supabase.from('tasks').insert({
      title,
      project_id: project_id || null,
      responsible,
      execution_date,
      due_date: due_date || null,
      is_private: is_private || false,
      notes: notes || null,
      status: 'active',
    }).select().single()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
