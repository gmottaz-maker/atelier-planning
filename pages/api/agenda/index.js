// Agenda : liste et création de blocs.
//
// Un membre ne lit et n'écrit que SON agenda, quoi que dise la requête : le
// nom vient du JWT. L'admin voit toute l'équipe et place pour chacun — c'est
// lui qui tient le planning de l'atelier (il en est le seul garant).
//
// Toute la validation vit dans `lib/agenda.js`, testée sans base ni réseau.
// `source` est posée par le serveur : un client ne se fait pas passer pour le
// planificateur, dont les blocs peuvent être replacés automatiquement.
import { getSupabaseServer } from '../../../lib/supabase-server'
import { requireUser, isAdminUser } from '../../../lib/requireAdmin'
import { erreurApi } from '../../../lib/apiError'
import { validerBloc } from '../../../lib/agenda'

export const CHAMPS_BLOC = `id, user_name, date, demi, type, project_id, activite, minutes,
  titre, lieu, note, source, fige, created_by, created_at, updated_at,
  projects(numero, name, client, color_override)`

export default async function handler(req, res) {
  const user = await requireUser(req, res)
  if (!user) return
  const admin = isAdminUser(user)
  const supabase = getSupabaseServer()

  if (req.method === 'GET') {
    const { from, to } = req.query
    // Un membre est ramené à son nom ; l'admin choisit, et sans choix voit tout.
    const qui = admin ? (req.query.user || null) : user.name
    let q = supabase.from('agenda').select(CHAMPS_BLOC).order('date').order('demi')
    if (qui && qui !== '*') q = q.eq('user_name', qui)
    if (from) q = q.gte('date', from)
    if (to) q = q.lte('date', to)
    const { data, error } = await q
    if (error) return erreurApi(req, res, 'internal', error, { route: 'agenda' })
    return res.status(200).json(data)
  }

  if (req.method === 'POST') {
    const b = req.body || {}
    const pour = admin && b.user_name ? String(b.user_name).trim() : user.name

    const [activites, projets] = await Promise.all([
      supabase.from('activites').select('code, libelle, famille, actif'),
      supabase.from('projects').select('id'),
    ])
    if (activites.error || projets.error) {
      return erreurApi(req, res, 'internal', activites.error || projets.error, { route: 'agenda' })
    }

    const v = validerBloc(b, { activites: activites.data || [], projets: projets.data || [] })
    if (!v.ok) return res.status(400).json({ error: v.erreur })

    const { data, error } = await supabase
      .from('agenda')
      .insert({ ...v.valeur, user_name: pour, source: 'main', created_by: user.name })
      .select(CHAMPS_BLOC)
      .single()
    if (error) return erreurApi(req, res, 'internal', error, { route: 'agenda' })
    return res.status(201).json(data)
  }

  return res.status(405).json({ error: 'Méthode non autorisée' })
}
