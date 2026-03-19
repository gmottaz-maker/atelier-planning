import { supabase } from '../../../lib/supabase'

export default async function handler(req, res) {
  // GET — liste tous les projets
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('deadline', { ascending: true })

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  // POST — créer un projet
  if (req.method === 'POST') {
    const { name, client, description, deadline, delivery_type, responsible, color_override, notes,
            logistics_address, logistics_time, logistics_contact, logistics_notes } = req.body

    if (!name || !client || !deadline) {
      return res.status(400).json({ error: 'Champs obligatoires manquants : name, client, deadline' })
    }

    const { data, error } = await supabase
      .from('projects')
      .insert([{ name, client, description, deadline, delivery_type, responsible, color_override, notes,
                 logistics_address, logistics_time, logistics_contact, logistics_notes, status: 'active' }])
      .select()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data[0])
  }

  return res.status(405).json({ error: 'Méthode non autorisée' })
}
