import { getSupabaseServer } from '../../../lib/supabase-server'
import { requireUser } from '../../../lib/requireAdmin'

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

  // GET laissé sans auth : l'écran mural /display (page publique, TV atelier)
  // liste les projets sans session. Toutes les mutations exigent un JWT.
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('deadline', { ascending: true })
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  const user = await requireUser(req, res)
  if (!user) return
  const actor = user.name

  if (req.method === 'POST') {
    const {
      name, client, description, short_description, deadline, delivery_type, responsible, color_override, notes,
      logistics_address, logistics_time, logistics_contact, logistics_notes,
      disassembly_date, disassembly_address, disassembly_time, disassembly_contact, disassembly_notes,
      kdrive_folder_id,
      client_address, client_contact_id, reference, phase,
    } = req.body

    if (!name || !client) {
      return res.status(400).json({ error: 'Nom et client requis' })
    }

    const { data, error } = await supabase.from('projects').insert([{
      name, client, description, short_description, delivery_type, responsible, color_override, notes,
      deadline: deadline || null,
      client_address: client_address || null,
      client_contact_id: client_contact_id || null,
      reference: reference || null,
      phase: phase || null,
      logistics_address, logistics_time, logistics_contact, logistics_notes,
      disassembly_date: disassembly_date || null,
      disassembly_address, disassembly_time, disassembly_contact, disassembly_notes,
      kdrive_folder_id: kdrive_folder_id || null,
      status: 'active',
    }]).select()

    if (error) return res.status(500).json({ error: error.message })
    await logActivity(actor, 'project_created', data[0])
    return res.status(201).json(data[0])
  }

  return res.status(405).json({ error: 'Méthode non autorisée' })
}
