// Webhook Todoist : authentifié par secret d'URL (TODOIST_WEBHOOK_SECRET),
// pas par JWT utilisateur. Client service-role pour ne pas dépendre de RLS.
import { getSupabaseServer } from '../../lib/supabase-server'

const getSupabase = getSupabaseServer

export default async function handler(req, res) {
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
  const supabase = getSupabase()

  // ── Création de projet (Todoist → projet Maze) ─────────────────────────────
  if (event_name === 'project:added') {
    if (!event_data || !event_data.name) {
      return res.status(400).json({ error: 'Données projet manquantes' })
    }
    const deadline = new Date()
    deadline.setDate(deadline.getDate() + 30)
    const deadlineStr = deadline.toISOString().split('T')[0]

    const todoistTag = `todoist:${event_data.id}`
    const { data: existing } = await supabase
      .from('projects').select('id').ilike('notes', `%${todoistTag}%`).limit(1)
    if (existing && existing.length > 0) {
      return res.status(200).json({ ok: true, skipped: 'projet déjà importé' })
    }

    const { error } = await supabase.from('projects').insert({
      name: event_data.name,
      client: 'À définir',
      deadline: deadlineStr,
      delivery_type: 'Livraison',
      responsible: 'Arnaud',
      status: 'active',
      notes: todoistTag,
    })
    if (error) {
      console.error('Supabase insert error:', error)
      return res.status(500).json({ error: error.message })
    }
    console.log(`✅ Projet Todoist importé: "${event_data.name}"`)
    return res.status(200).json({ ok: true, imported: event_data.name })
  }

  // ── Complétion d'une tâche (Todoist → Maze) ────────────────────────────────
  if (event_name === 'item:completed' || event_name === 'item:uncompleted') {
    const todoistId = event_data?.id ? String(event_data.id) : null
    if (!todoistId) return res.status(200).json({ ok: true, skipped: 'pas d\'id' })

    // Retrouver la tâche Maze liée
    const { data: task } = await supabase
      .from('tasks').select('id, status').eq('todoist_id', todoistId).maybeSingle()
    if (!task) return res.status(200).json({ ok: true, skipped: 'aucune tâche Maze liée' })

    const completed = event_name === 'item:completed'
    // Évite une boucle : ne met à jour que si l'état diffère
    if ((completed && task.status === 'completed') || (!completed && task.status === 'active')) {
      return res.status(200).json({ ok: true, skipped: 'déjà à jour' })
    }

    const { error } = await supabase.from('tasks').update({
      status: completed ? 'completed' : 'active',
      completed_at: completed ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq('id', task.id)
    if (error) return res.status(500).json({ error: error.message })

    console.log(`✅ Tâche Maze ${completed ? 'complétée' : 'réactivée'} via Todoist (todoist_id ${todoistId})`)
    return res.status(200).json({ ok: true, synced: task.id })
  }

  return res.status(200).json({ ok: true, skipped: `event ignoré: ${event_name}` })
}
