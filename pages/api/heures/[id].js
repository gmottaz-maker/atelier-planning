// Heures imputées : modification et suppression d'une ligne.
//
// Une ligne d'un collègue est traitée comme inexistante pour un membre : un
// 403 confirmerait qu'elle existe (même règle que les tâches privées).
import { getSupabaseServer } from '../../../lib/supabase-server'
import { requireUser, isAdminUser } from '../../../lib/requireAdmin'
import { erreurApi } from '../../../lib/apiError'
import { validerEntree, chevauche } from '../../../lib/heures'
import { CHAMPS_HEURE } from './index'

const MODIFIABLES = ['date', 'debut', 'fin', 'project_id', 'activite', 'note']

export default async function handler(req, res) {
  const user = await requireUser(req, res)
  if (!user) return
  const admin = isAdminUser(user)
  const supabase = getSupabaseServer()
  const { id } = req.query

  const { data: existante } = await supabase
    .from('heures').select('id, user_name, date, debut, fin, project_id, activite, note').eq('id', id).maybeSingle()
  if (!existante || (!admin && existante.user_name !== user.name)) {
    return res.status(404).json({ error: 'Entrée introuvable' })
  }

  if (req.method === 'PUT') {
    const b = req.body || {}
    const fusion = {}
    for (const k of MODIFIABLES) fusion[k] = k in b ? b[k] : existante[k]

    const { data: activites, error: errAct } = await supabase.from('activites').select('code, libelle, famille, actif')
    if (errAct) return erreurApi(req, res, 'internal', errAct, { route: 'heures/[id]' })

    const v = validerEntree(fusion, { activites: activites || [], tolererInactive: existante.activite })
    if (!v.ok) return res.status(400).json({ error: v.erreur })

    if (v.valeur.project_id && v.valeur.project_id !== existante.project_id) {
      const { data: p } = await supabase.from('projects').select('id').eq('id', v.valeur.project_id).maybeSingle()
      if (!p) return res.status(400).json({ error: 'Projet introuvable' })
    }

    const { data: jour, error: errJour } = await supabase
      .from('heures').select('id, debut, fin').eq('user_name', existante.user_name).eq('date', v.valeur.date)
    if (errJour) return erreurApi(req, res, 'internal', errJour, { route: 'heures/[id]' })
    const conflit = chevauche(v.valeur, jour || [], existante.id)
    if (conflit) {
      return res.status(409).json({
        error: `Recouvre une entrée déjà saisie de ${String(conflit.debut).slice(0, 5)} à ${String(conflit.fin).slice(0, 5)}`,
      })
    }

    const { data, error } = await supabase
      .from('heures')
      .update({ ...v.valeur, updated_at: new Date().toISOString() })
      .eq('id', existante.id)
      .select(CHAMPS_HEURE)
      .single()
    if (error) return erreurApi(req, res, 'internal', error, { route: 'heures/[id]' })
    return res.status(200).json(data)
  }

  if (req.method === 'DELETE') {
    const { error } = await supabase.from('heures').delete().eq('id', existante.id)
    if (error) return erreurApi(req, res, 'internal', error, { route: 'heures/[id]' })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Méthode non autorisée' })
}
