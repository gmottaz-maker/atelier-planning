import { getSupabaseServer } from '../../../lib/supabase-server'
import { requireUser } from '../../../lib/requireAdmin'
import * as todoist from '../../../lib/todoist'

async function logActivity(supabase, actor, action, task) {
  if (!actor) return
  await supabase.from('activity_log').insert({
    actor,
    action,
    entity_type: 'task',
    entity_id: task?.id || null,
    entity_name: task?.title || null,
    metadata: task?.responsible ? { responsible: task.responsible } : null,
  })
}

export default async function handler(req, res) {
  const user = await requireUser(req, res)
  if (!user) return
  const supabase = getSupabaseServer()
  const actor = user.name

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
    const { title, project_id, responsible, execution_date, due_date, is_private, notes, category, category_data } = req.body

    if (!title || !responsible) {
      return res.status(400).json({ error: 'Titre et responsable requis' })
    }

    const { data, error } = await supabase.from('tasks').insert({
      title,
      project_id: project_id || null,
      responsible,
      execution_date: execution_date || null,
      due_date: due_date || null,
      is_private: is_private || false,
      notes: notes || null,
      category: category || null,
      category_data: category_data || {},
      status: 'active',
    }).select().single()

    if (error) return res.status(500).json({ error: error.message })

    await logActivity(supabase, actor, 'task_created', data)

    // Sync Todoist : tâches de Guillaume → inbox Todoist
    if (data.responsible === todoist.TODOIST_SYNC_USER && todoist.todoistEnabled()) {
      const tid = await todoist.createTask(data)
      if (tid) {
        await supabase.from('tasks').update({ todoist_id: tid }).eq('id', data.id)
        data.todoist_id = tid
      }
    }

    return res.status(201).json(data)
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
