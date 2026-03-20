import { supabase } from '../../../lib/supabase'

async function logActivity(actor, action, project) {
  if (!actor) return
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
  const { id } = req.query
  const actor = req.headers['x-actor'] || null

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single()
    if (error) return res.status(404).json({ error: error.message })
    return res.status(200).json(data)
  }

  if (req.method === 'PUT') {
    const {
      name, client, description, deadline, delivery_type, responsible, color_override, notes, status,
      logistics_address, logistics_time, logistics_contact, logistics_notes,
      disassembly_date, disassembly_address, disassembly_time, disassembly_contact, disassembly_notes,
      logistics_data,
      site_visit_data,
      site_visit_summary,
    } = req.body

    const payload = {
      name, client, description, deadline, delivery_type, responsible, color_override, notes, status,
      logistics_address, logistics_time, logistics_contact, logistics_notes,
      disassembly_date: disassembly_date || null,
      disassembly_address, disassembly_time, disassembly_contact, disassembly_notes,
      updated_at: new Date().toISOString(),
    }

    if (site_visit_data !== undefined) payload.site_visit_data = site_visit_data
    if (site_visit_summary !== undefined) payload.site_visit_summary = site_visit_summary

    // Persist new logistics_data and keep legacy fields in sync
    if (logistics_data !== undefined) {
      payload.logistics_data = logistics_data
      const m = logistics_data.montage || {}
      payload.logistics_address = m.address || ''
      payload.logistics_time    = m.time    || ''
      payload.logistics_contact = m.contact || ''
      payload.logistics_notes   = m.notes   || ''
      const d = logistics_data.demontage || {}
      payload.disassembly_date    = d.date    || null
      payload.disassembly_address = d.address || ''
      payload.disassembly_time    = d.time    || ''
      payload.disassembly_contact = d.contact || ''
      payload.disassembly_notes   = d.notes   || ''
    }

    const { data, error } = await supabase.from('projects')
      .update(payload)
      .eq('id', id)
      .select()

    if (error) return res.status(500).json({ error: error.message })
    await logActivity(actor, 'project_updated', data[0])
    return res.status(200).json(data[0])
  }

  if (req.method === 'DELETE') {
    const { data: proj } = await supabase.from('projects').select('id, name, client').eq('id', id).single()
    const { error } = await supabase.from('projects').delete().eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    await logActivity(actor, 'project_deleted', proj)
    return res.status(200).json({ success: true })
  }

  return res.status(405).json({ error: 'Méthode non autorisée' })
}
