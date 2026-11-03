import { getSupabaseServer } from '../../../lib/supabase-server'
import { requireUser } from '../../../lib/requireAdmin'
import { visibleTasks, resolvePrivateOwner } from '../../../lib/taskAccess'
import * as todoist from '../../../lib/todoist'
import { erreurApi } from '../../../lib/apiError'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
    // `?project=<uuid>` : le filtre est fait par la BASE. La fiche projet
    // lisait toutes les tâches de l'application — 51 Ko — pour n'en garder
    // que les siennes, et le tri côté client cachait ce gâchis.
    //
    // La forme de l'identifiant est vérifiée ici : la colonne est de type
    // uuid, et un `?project=foo` partirait sinon en erreur Postgres remontée
    // en 500 alors que c'est la requête qui est mauvaise.
    const projet = String(req.query.project || '')
    if (projet && !UUID.test(projet)) {
      return res.status(400).json({ error: 'Identifiant de projet invalide' })
    }

    let requete = supabase
      .from('tasks')
      .select('*, projects(id, name, color_override)')
    if (projet) requete = requete.eq('project_id', projet)
    const { data, error } = await requete
      .order('execution_date', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) return erreurApi(req, res, 'internal', error, { route: 'tasks/index' })
    // Les tâches privées des autres ne sortent jamais de l'API : ni ici, ni
    // dans les compteurs, suggestions ou caches qui consomment cette réponse.
    return res.status(200).json(visibleTasks(data, user))
  }

  if (req.method === 'POST') {
    const { title, project_id, responsible, execution_date, due_date, is_private, notes, category, category_data } = req.body

    if (!title || !responsible) {
      return res.status(400).json({ error: 'Titre et responsable requis' })
    }
    // Une tâche privée destinée à un tiers demande le rôle admin ; sinon elle
    // revient à son auteur.
    const owner = is_private ? resolvePrivateOwner(responsible, user) : responsible

    const { data, error } = await supabase.from('tasks').insert({
      title,
      project_id: project_id || null,
      responsible: owner,
      execution_date: execution_date || null,
      due_date: due_date || null,
      is_private: is_private || false,
      notes: notes || null,
      category: category || null,
      category_data: category_data || {},
      status: 'active',
    }).select().single()

    if (error) return erreurApi(req, res, 'internal', error, { route: 'tasks/index' })

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
