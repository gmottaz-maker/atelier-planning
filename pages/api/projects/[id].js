import { supabase } from '../../../lib/supabase'

export default async function handler(req, res) {
  const { id } = req.query

  // PUT — modifier un projet
  if (req.method === 'PUT') {
    const { name, client, description, deadline, delivery_type, responsible, color_override, notes, status,
            logistics_address, logistics_time, logistics_contact, logistics_notes } = req.body

    const { data, error } = await supabase
      .from('projects')
      .update({ name, client, description, deadline, delivery_type, responsible, color_override, notes, status,
                logistics_address, logistics_time, logistics_contact, logistics_notes,
                updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data[0])
  }

  // DELETE — supprimer un projet
  if (req.method === 'DELETE') {
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id)

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ success: true })
  }

  return res.status(405).json({ error: 'Méthode non autorisée' })
}
