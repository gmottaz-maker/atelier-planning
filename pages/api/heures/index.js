// Heures imputées : liste et création.
//
// Un membre ne lit et n'écrit que SES heures, quoi que dise la requête : le
// nom vient du JWT. L'admin peut saisir pour un collègue — c'est lui qui
// reportera les feuilles scannées.
import { getSupabaseServer } from '../../../lib/supabase-server'
import { requireUser, isAdminUser } from '../../../lib/requireAdmin'
import { erreurApi } from '../../../lib/apiError'
import { validerEntree, chevauche } from '../../../lib/heures'

export const CHAMPS_HEURE = `id, user_name, date, debut, fin, minutes, project_id, activite, note,
  source, created_by, created_at, updated_at, projects(numero, name, client)`

export default async function handler(req, res) {
  const user = await requireUser(req, res)
  if (!user) return
  const admin = isAdminUser(user)
  const supabase = getSupabaseServer()

  if (req.method === 'GET') {
    const { from, to, project } = req.query
    const qui = admin ? (req.query.user || null) : user.name
    let q = supabase.from('heures').select(CHAMPS_HEURE).order('date').order('debut')
    if (qui && qui !== '*') q = q.eq('user_name', qui)
    if (from) q = q.gte('date', from)
    if (to) q = q.lte('date', to)
    if (project) q = q.eq('project_id', project)
    const { data, error } = await q
    if (error) return erreurApi(req, res, 'internal', error, { route: 'heures' })
    return res.status(200).json(data)
  }

  if (req.method === 'POST') {
    const b = req.body || {}
    const pour = admin && b.user_name ? String(b.user_name).trim() : user.name

    const { data: activites, error: errAct } = await supabase.from('activites').select('code, libelle, famille, actif')
    if (errAct) return erreurApi(req, res, 'internal', errAct, { route: 'heures' })

    const v = validerEntree(b, { activites: activites || [] })
    if (!v.ok) return res.status(400).json({ error: v.erreur })

    if (v.valeur.project_id) {
      const { data: p } = await supabase.from('projects').select('id').eq('id', v.valeur.project_id).maybeSingle()
      if (!p) return res.status(400).json({ error: 'Projet introuvable' })
    }

    const { data: jour, error: errJour } = await supabase
      .from('heures').select('id, debut, fin').eq('user_name', pour).eq('date', v.valeur.date)
    if (errJour) return erreurApi(req, res, 'internal', errJour, { route: 'heures' })
    const conflit = chevauche(v.valeur, jour || [])
    if (conflit) {
      return res.status(409).json({
        error: `Recouvre une entrée déjà saisie de ${String(conflit.debut).slice(0, 5)} à ${String(conflit.fin).slice(0, 5)}`,
      })
    }

    const { data, error } = await supabase
      .from('heures')
      .insert({ ...v.valeur, user_name: pour, source: 'saisie', created_by: user.name })
      .select(CHAMPS_HEURE)
      .single()
    if (error) return erreurApi(req, res, 'internal', error, { route: 'heures' })
    return res.status(201).json(data)
  }

  return res.status(405).json({ error: 'Méthode non autorisée' })
}
