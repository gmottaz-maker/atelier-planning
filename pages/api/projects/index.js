import { getSupabaseServer } from '../../../lib/supabase-server'

async function logActivity(actor, action, project) {
  if (!actor) return
  const supabase = getSupabaseServer()
  try {
    await supabase.from('activity_log').insert({
      actor,
      action,
      entity_type: 'project',
      entity_id: project?.id ? String(project.id) : null,
      entity_name: project?.name || null,
      metadata: project?.client ? { client: project.client } : null,
    })
  } catch (_) {}
}

export default async function handler(req, res) {
  const supabase = getSupabaseServer()
  const actor = req.headers['x-actor'] || null

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('deadline', { ascending: true })
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  if (req.method === 'POST') {
    const {
      name, client, description, deadline, delivery_type, responsible, color_override, notes,
      logistics_address, logistics_time, logistics_contact, logistics_notes,
      disassembly_date, disassembly_address, disassembly_time, disassembly_contact, disassembly_notes,
    } = req.body

    if (!name || !client || !deadline) {
      return res.status(400).json({ error: 'Champs obligatoires manquants' })
    }

    const { data, error } = await supabase.from('projects').insert([{
      name, client, description, deadline, delivery_type, responsible, color_override, notes,
      logistics_address, logistics_time, logistics_contact, logistics_notes,
      disassembly_date: disassembly_date || null,
      disassembly_address, disassembly_time, disassembly_contact, disassembly_notes,
      status: 'active',
    }]).select()

    if (error) return res.status(500).json({ error: error.message })
    await logActivity(actor, 'project_created', data[0])
    return res.status(201).json(data[0])
  }

  return res.status(405).json({ error: 'Méthode non autorisée' })
}
