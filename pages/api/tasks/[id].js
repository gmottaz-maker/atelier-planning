import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}

async function logActivity(supabase, actor, action, task) {
  if (!actor) return
  try {
    await supabase.from('activity_log').insert({
      actor,
      action,
      entity_type: 'task',
      entity_id: task?.id ? String(task.id) : null,
      entity_name: task?.title || null,
      metadata: task?.responsible ? { responsible: task.responsible } : null,
    })
  } catch (_) { /* log errors are non-fatal */ }
}

export default async function handler(req, res) {
  const supabase = getSupabase()
  const { id } = req.query
  const actor = req.headers['x-actor'] || null

  if (req.method === 'PUT') {
    // Strip any nested join data (e.g. projects) sent from the client
    const { projects: _p, prev_status, ...cleanBody } = req.body
    const updates = { ...cleanBody, updated_at: new Date().toISOString() }

    // Si on complète la tâche, on note l'heure
    if (updates.status === 'completed' && !updates.completed_at) {
      updates.completed_at = new Date().toISOString()
    }
    // Si on remet active, on efface completed_at
    if (updates.status === 'active') {
      updates.completed_at = null
    }

    const { data, error } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })

    // Activity logging — use prev_status sent by client to distinguish actions
    const wasCompleted = updates.status === 'completed' && prev_status !== 'completed'
    const wasUncompleted = updates.status === 'active' && prev_status === 'completed'
    if (wasCompleted) {
      await logActivity(supabase, actor, 'task_completed', data)
    } else if (wasUncompleted) {
      await logActivity(supabase, actor, 'task_uncompleted', data)
    } else {
      await logActivity(supabase, actor, 'task_updated', data)
    }

    return res.status(200).json(data)
  }

  if (req.method === 'DELETE') {
    const { data: taskData } = await supabase
      .from('tasks').select('id, title, responsible').eq('id', id).single()
    const { error } = await supabase.from('tasks').delete().eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    await logActivity(supabase, actor, 'task_deleted', taskData)
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
