// Journal des échanges d'un prospect.
//
// Chaque ligne porte son canal — c'est le point : savoir par quel moyen on a
// touché la société, et ce qui a fini par marcher.
import { getSupabaseServer } from '../../../../lib/supabase-server'
import { requireAdmin } from '../../../../lib/requireAdmin'
import { erreurApi } from '../../../../lib/apiError'
import { CANAUX } from '../../../../lib/prospects'

const supabase = getSupabaseServer()
const CHAMPS = ['person_id', 'occurred_on', 'channel', 'direction', 'notes', 'follow_up_on', 'follow_up_done']

function payload(body) {
  const p = {}
  for (const k of CHAMPS) if (k in (body || {})) p[k] = body[k] === '' ? null : body[k]
  return p
}

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res)
  if (!admin) return
  const { id, iid } = req.query
  if (!id) return res.status(400).json({ error: 'id requis' })

  if (req.method === 'POST') {
    const p = payload(req.body)
    // Le canal est validé ici ET par la base : le CHECK protège les données,
    // ce message-ci protège l'utilisateur d'une erreur illisible.
    if (!CANAUX.some(c => c.cle === p.channel)) {
      return res.status(400).json({ error: 'Canal inconnu.' })
    }
    // L'auteur vient du JWT, jamais du corps : un champ envoyé par le
    // navigateur est une déclaration, pas une identité.
    const { data, error } = await supabase.from('prospect_interactions')
      .insert({ ...p, prospect_id: id, author: admin.name }).select().single()
    if (error) return erreurApi(req, res, 'internal', error, { route: 'prospects/interactions' })
    return res.status(201).json(data)
  }

  if (req.method === 'PATCH') {
    if (!iid) return res.status(400).json({ error: 'iid requis' })
    const p = payload(req.body)
    if ('channel' in p && !CANAUX.some(c => c.cle === p.channel)) {
      return res.status(400).json({ error: 'Canal inconnu.' })
    }
    const { data, error } = await supabase.from('prospect_interactions')
      .update(p).eq('id', iid).eq('prospect_id', id).select().single()
    if (error) return erreurApi(req, res, 'internal', error, { route: 'prospects/interactions' })
    return res.status(200).json(data)
  }

  if (req.method === 'DELETE') {
    if (!iid) return res.status(400).json({ error: 'iid requis' })
    // `eq('prospect_id', id)` en plus de l'identifiant de ligne : sans lui, un
    // iid d'un autre prospect passerait.
    const { error } = await supabase.from('prospect_interactions')
      .delete().eq('id', iid).eq('prospect_id', id)
    if (error) return erreurApi(req, res, 'internal', error, { route: 'prospects/interactions' })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Méthode non autorisée' })
}
