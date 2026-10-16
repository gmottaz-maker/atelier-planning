// Agenda : modification et suppression d'un bloc.
//
// On vérifie à QUI appartient le bloc avant d'y toucher : sans cette lecture,
// un identifiant deviné suffirait à déplacer la journée d'un collègue. Un
// membre ne touche que les siens ; l'admin touche tout.
import { getSupabaseServer } from '../../../lib/supabase-server'
import { requireUser, isAdminUser } from '../../../lib/requireAdmin'
import { erreurApi } from '../../../lib/apiError'
import { validerBloc } from '../../../lib/agenda'
import { CHAMPS_BLOC } from './index'

export default async function handler(req, res) {
  const user = await requireUser(req, res)
  if (!user) return
  const admin = isAdminUser(user)
  const supabase = getSupabaseServer()

  const id = Number(req.query.id)
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Identifiant invalide' })

  const { data: existant, error: errLecture } = await supabase
    .from('agenda').select('id, user_name').eq('id', id).maybeSingle()
  if (errLecture) return erreurApi(req, res, 'internal', errLecture, { route: 'agenda/[id]' })
  if (!existant) return res.status(404).json({ error: 'Bloc introuvable' })
  // Même réponse que pour un bloc absent : dire « interdit » apprendrait que
  // l'identifiant existe.
  if (!admin && existant.user_name !== user.name) return res.status(404).json({ error: 'Bloc introuvable' })

  if (req.method === 'PUT') {
    const b = req.body || {}
    const [activites, projets] = await Promise.all([
      supabase.from('activites').select('code, libelle, famille, actif'),
      supabase.from('projects').select('id'),
    ])
    if (activites.error || projets.error) {
      return erreurApi(req, res, 'internal', activites.error || projets.error, { route: 'agenda/[id]' })
    }

    const v = validerBloc(b, { activites: activites.data || [], projets: projets.data || [] })
    if (!v.ok) return res.status(400).json({ error: v.erreur })

    // Seul l'admin déplace un bloc d'une personne à une autre ; sinon il reste
    // à son propriétaire, quoi que le corps de la requête prétende.
    const pour = admin && b.user_name ? String(b.user_name).trim() : existant.user_name

    const { data, error } = await supabase
      .from('agenda')
      .update({ ...v.valeur, user_name: pour, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(CHAMPS_BLOC)
      .single()
    if (error) return erreurApi(req, res, 'internal', error, { route: 'agenda/[id]' })
    return res.status(200).json(data)
  }

  if (req.method === 'DELETE') {
    const { error } = await supabase.from('agenda').delete().eq('id', id)
    if (error) return erreurApi(req, res, 'internal', error, { route: 'agenda/[id]' })
    return res.status(204).end()
  }

  return res.status(405).json({ error: 'Méthode non autorisée' })
}
