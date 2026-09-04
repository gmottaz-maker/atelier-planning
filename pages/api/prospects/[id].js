// Un prospect : lecture, modification, suppression.
import { getSupabaseServer } from '../../../lib/supabase-server'
import { requireAdmin } from '../../../lib/requireAdmin'
import { erreurApi } from '../../../lib/apiError'
import { payload } from './index'

const supabase = getSupabaseServer()
const AVEC_TOUT = '*, prospect_people(*), prospect_interactions(*)'

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return
  const { id } = req.query
  if (!id) return res.status(400).json({ error: 'id requis' })

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('prospects').select(AVEC_TOUT).eq('id', id).maybeSingle()
    if (error) return erreurApi(req, res, 'internal', error, { route: 'prospects/[id]' })
    if (!data) return res.status(404).json({ error: 'Prospect introuvable' })
    return res.status(200).json(data)
  }

  if (req.method === 'PATCH') {
    const { data, error } = await supabase.from('prospects').update(payload(req.body))
      .eq('id', id).select(AVEC_TOUT).single()
    if (error) return erreurApi(req, res, 'internal', error, { route: 'prospects/[id]' })
    return res.status(200).json(data)
  }

  if (req.method === 'DELETE') {
    // Le journal et les personnes partent avec (ON DELETE CASCADE). Un prospect
    // CONVERTI ne se supprime pas ici : sa fiche cliente s'appuie sur son
    // journal, l'effacer viderait l'historique du client.
    const { data: p } = await supabase.from('prospects').select('converted_to_contact_id').eq('id', id).maybeSingle()
    if (p?.converted_to_contact_id) {
      return res.status(409).json({ error: 'Ce prospect est devenu client : son journal appartient désormais à sa fiche cliente. Supprime la société côté contacts si besoin.' })
    }
    const { error } = await supabase.from('prospects').delete().eq('id', id)
    if (error) return erreurApi(req, res, 'internal', error, { route: 'prospects/[id]' })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Méthode non autorisée' })
}
