import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  // Todoist envoie des POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Vérification du secret dans l'URL
  const { secret } = req.query
  if (!process.env.TODOIST_WEBHOOK_SECRET || secret !== process.env.TODOIST_WEBHOOK_SECRET) {
    console.warn('Todoist webhook: secret invalide')
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { event_name, event_data } = req.body

  // On ne traite que la création de projet
  if (event_name !== 'project:added') {
    return res.status(200).json({ ok: true, skipped: `event ignoré: ${event_name}` })
  }

  if (!event_data || !event_data.name) {
    return res.status(400).json({ error: 'Données projet manquantes' })
  }

  // Deadline par défaut : 30 jours à partir d'aujourd'hui
  const deadline = new Date()
  deadline.setDate(deadline.getDate() + 30)
  const deadlineStr = deadline.toISOString().split('T')[0]

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  // Vérifier si ce projet Todoist n'existe pas déjà (via les notes)
  const todoistTag = `todoist:${event_data.id}`
  const { data: existing } = await supabase
    .from('projects')
    .select('id')
    .ilike('notes', `%${todoistTag}%`)
    .limit(1)

  if (existing && existing.length > 0) {
    return res.status(200).json({ ok: true, skipped: 'projet déjà importé' })
  }

  // Créer le projet dans Supabase
  const { error } = await supabase.from('projects').insert({
    name: event_data.name,
    client: 'À définir',
    deadline: deadlineStr,
    delivery_type: 'Livraison',
    responsible: 'Arnaud',
    status: 'active',
    notes: todoistTag, // permet de détecter les doublons et de garder la trace
  })

  if (error) {
    console.error('Supabase insert error:', error)
    return res.status(500).json({ error: error.message })
  }

  console.log(`✅ Projet Todoist importé: "${event_data.name}"`)
  return res.status(200).json({ ok: true, imported: event_data.name })
}
