import { getSupabaseServer } from '../../../lib/supabase-server'
import { requireUser } from '../../../lib/requireAdmin'
import { canSeeTask, resolvePrivateOwner } from '../../../lib/taskAccess'
import { notifyTeam } from '../../../lib/push-server'
import * as todoist from '../../../lib/todoist'
import { erreurApi } from '../../../lib/apiError'

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
  const user = await requireUser(req, res)
  if (!user) return
  const supabase = getSupabaseServer()
  const { id } = req.query
  const actor = user.name

  // Garde-fou commun à toutes les méthodes : une tâche privée n'appartenant ni
  // à l'admin ni à son responsable est traitée comme inexistante — un 403
  // confirmerait qu'elle existe.
  const { data: existing } = await supabase
    .from('tasks').select('id, is_private, responsible, status').eq('id', id).maybeSingle()
  if (!existing) return res.status(404).json({ error: 'Tâche introuvable' })
  if (!canSeeTask(existing, user)) return res.status(404).json({ error: 'Tâche introuvable' })

  if (req.method === 'PUT') {
    // Liste blanche plutôt que `{ ...req.body }` : un corps de requête arbitraire
    // pouvait écrire n'importe quelle colonne, `id` et `created_at` compris, et
    // aurait accueilli sans broncher toute colonne ajoutée plus tard.
    const MODIFIABLES = [
      'title', 'project_id', 'responsible', 'execution_date', 'due_date',
      'is_private', 'status', 'completed_at', 'notes', 'category', 'category_data',
    ]
    const updates = { updated_at: new Date().toISOString() }
    for (const k of MODIFIABLES) if (k in req.body) updates[k] = req.body[k]

    // Une tâche privée ne se transfère pas à un collègue par un simple PUT :
    // seul l'admin peut en désigner le responsable.
    if ((updates.is_private ?? existing.is_private) && 'responsible' in updates) {
      updates.responsible = resolvePrivateOwner(updates.responsible, user)
    }

    // Si on complète la tâche, on note l'heure
    if (updates.status === 'completed' && !updates.completed_at) {
      updates.completed_at = new Date().toISOString()
    }
    // Si on remet active, on efface completed_at
    if (updates.status === 'active') {
      updates.completed_at = null
    }

    // Récupère la version précédente pour détecter les transitions de catégorie + sync Todoist
    const { data: prevTask } = await supabase
      .from('tasks').select('category, category_data, project_id, responsible, todoist_id, projects(name)').eq('id', id).maybeSingle()

    const { data, error } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', id)
      .select('*, projects(name)')
      .single()

    if (error) return erreurApi(req, res, 'internal', error, { route: 'tasks/[id]' })

    // Statut précédent lu en base, pas dans le corps de la requête : le champ
    // `prev_status` envoyé par le client est une déclaration, pas un fait.
    const prevStatus = existing.status
    const wasCompleted = updates.status === 'completed' && prevStatus !== 'completed'
    const wasUncompleted = updates.status === 'active' && prevStatus === 'completed'
    if (wasCompleted) {
      await logActivity(supabase, actor, 'task_completed', data)
    } else if (wasUncompleted) {
      await logActivity(supabase, actor, 'task_uncompleted', data)
    } else {
      await logActivity(supabase, actor, 'task_updated', data)
    }

    // Push notifications sur transitions de catégorie
    await maybeNotifyTransition(prevTask, data, actor)

    // ── Sync Todoist (Maze → Todoist) ────────────────────────────────────────
    if (todoist.todoistEnabled()) {
      const SYNC  = todoist.TODOIST_SYNC_USER
      const isMine = data.responsible === SYNC
      const tid   = data.todoist_id || prevTask?.todoist_id || null

      if (isMine && !tid) {
        // Devenue mienne (réassignée à Guillaume) → créer dans Todoist
        const newTid = await todoist.createTask(data)
        if (newTid) {
          await supabase.from('tasks').update({ todoist_id: newTid }).eq('id', id)
          data.todoist_id = newTid
          if (data.status === 'completed') await todoist.closeTask(newTid)
        }
      } else if (isMine && tid) {
        // Mise à jour titre/date + propagation de la complétion
        await todoist.updateTask(tid, data)
        if (data.status === 'completed') await todoist.closeTask(tid)
        else if (data.status === 'active') await todoist.reopenTask(tid)
      } else if (!isMine && tid) {
        // Réassignée à quelqu'un d'autre → retirer de mon inbox Todoist
        await todoist.deleteTask(tid)
        await supabase.from('tasks').update({ todoist_id: null }).eq('id', id)
        data.todoist_id = null
      }
    }

    return res.status(200).json(data)
  }

  if (req.method === 'DELETE') {
    const { data: taskData } = await supabase
      .from('tasks').select('id, title, responsible, todoist_id').eq('id', id).single()
    const { error } = await supabase.from('tasks').delete().eq('id', id)
    if (error) return erreurApi(req, res, 'internal', error, { route: 'tasks/[id]' })
    // Sync Todoist : supprimer la tâche liée
    if (taskData?.todoist_id) await todoist.deleteTask(taskData.todoist_id)
    await logActivity(supabase, actor, 'task_deleted', taskData)
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
