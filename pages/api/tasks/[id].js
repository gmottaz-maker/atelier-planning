import { createClient } from '@supabase/supabase-js'
import { notifyTeam } from '../../../lib/push-server'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}

async function maybeNotifyTransition(prev, next, actor) {
  if (!next?.category) return
  const prevData = prev?.category_data || {}
  const nextData = next.category_data || {}
  const projectName = next.projects?.name || prev?.projects?.name || ''
  const projectLabel = projectName ? ` · ${projectName}` : ''

  if (next.category === 'commande' && !prevData.received_at && nextData.received_at) {
    await notifyTeam({
      title: 'Commande réceptionnée',
      body: `${next.title}${projectLabel}`,
      url: next.project_id ? `/projects/${next.project_id}` : '/tasks',
      tag: `commande-${next.id}`,
      excludeUser: actor,
    })
    return
  }

  if (next.category === 'sous_traitance') {
    // La transition "Prêt à récupérer" crée une tâche dédiée pour Arnaud côté client,
    // donc pas de push ici. Seule la complétion ("À l'atelier") notifie le reste de l'équipe.
    if (!prevData.picked_up_at && nextData.picked_up_at) {
      await notifyTeam({
        title: 'Sous-traitance à l\'atelier',
        body: `${next.title}${nextData.subcontractor ? ` — ${nextData.subcontractor}` : ''}${projectLabel}`,
        url: next.project_id ? `/projects/${next.project_id}` : '/tasks',
        tag: `sst-done-${next.id}`,
        excludeUser: actor,
      })
    }
  }
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

    // Récupère la version précédente pour détecter les transitions de catégorie
    const { data: prevTask } = await supabase
      .from('tasks').select('category, category_data, project_id, projects(name)').eq('id', id).maybeSingle()

    const { data, error } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', id)
      .select('*, projects(name)')
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

    // Push notifications sur transitions de catégorie
    await maybeNotifyTransition(prevTask, data, actor)

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
