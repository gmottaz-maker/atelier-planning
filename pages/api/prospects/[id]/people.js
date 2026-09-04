// Personnes rattachées à un prospect.
//
// Séparées de `contacts` tant qu'on démarche : ces personnes n'ont ni rôle de
// facturation, ni société cliente. Elles y basculent à la conversion.
import { getSupabaseServer } from '../../../../lib/supabase-server'
import { requireAdmin } from '../../../../lib/requireAdmin'
import { erreurApi } from '../../../../lib/apiError'

const supabase = getSupabaseServer()
const CHAMPS = ['name', 'role', 'email', 'phone', 'notes']

function payload(body) {
  const p = {}
  for (const k of CHAMPS) if (k in (body || {})) p[k] = body[k] === '' ? null : body[k]
  return p
}

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return
  const { id, pid } = req.query
  if (!id) return res.status(400).json({ error: 'id requis' })

  if (req.method === 'POST') {
    const p = payload(req.body)
    if (!p.name) return res.status(400).json({ error: 'Le nom est requis.' })
    const { data, error } = await supabase.from('prospect_people')
      .insert({ ...p, prospect_id: id }).select().single()
    if (error) return erreurApi(req, res, 'internal', error, { route: 'prospects/people' })
    return res.status(201).json(data)
  }

  if (req.method === 'PATCH') {
    if (!pid) return res.status(400).json({ error: 'pid requis' })
    const { data, error } = await supabase.from('prospect_people')
      .update(payload(req.body)).eq('id', pid).eq('prospect_id', id).select().single()
    if (error) return erreurApi(req, res, 'internal', error, { route: 'prospects/people' })
    return res.status(200).json(data)
  }

  if (req.method === 'DELETE') {
    if (!pid) return res.status(400).json({ error: 'pid requis' })
    const { error } = await supabase.from('prospect_people')
      .delete().eq('id', pid).eq('prospect_id', id)
    if (error) return erreurApi(req, res, 'internal', error, { route: 'prospects/people' })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Méthode non autorisée' })
}
