// Prospects : liste et création.
//
// La liste embarque personnes ET journal en une requête : la page calcule la
// prochaine relance de chaque prospect pour trier, et un aller-retour par
// prospect rendrait l'écran inutilisable dès la vingtaine.
import { getSupabaseServer } from '../../../lib/supabase-server'
import { requireAdmin } from '../../../lib/requireAdmin'
import { erreurApi } from '../../../lib/apiError'

const supabase = getSupabaseServer()

// Liste blanche explicite : sans elle, toute colonne ajoutée plus tard
// devient inscriptible depuis le navigateur.
export const CHAMPS = ['name', 'city', 'street', 'zip', 'country', 'website', 'phone',
  'sector', 'stage', 'source', 'source_detail', 'owner', 'lost_reason', 'notes']

export function payload(body, { creation = false } = {}) {
  const p = {}
  for (const k of CHAMPS) if (k in (body || {})) p[k] = body[k] === '' ? null : body[k]
  if (!creation) p.updated_at = new Date().toISOString()
  return p
}

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return

  if (req.method === 'GET') {
    let q = supabase
      .from('prospects')
      .select('*, prospect_people(*), prospect_interactions(*)')
      .order('name', { ascending: true })

    // `?converted_to=<id>` : la fiche cliente s'en sert pour retrouver le
    // journal du démarchage qui l'a précédée. Sans ce filtre elle chargerait
    // tous les prospects pour en garder un seul.
    if (req.query.converted_to) q = q.eq('converted_to_contact_id', req.query.converted_to)

    const { data, error } = await q
    if (error) return erreurApi(req, res, 'internal', error, { route: 'prospects' })
    return res.status(200).json(data)
  }

  if (req.method === 'POST') {
    const p = payload(req.body, { creation: true })
    if (!p.name) return res.status(400).json({ error: 'Le nom de la société est requis.' })
    const { data, error } = await supabase.from('prospects').insert(p)
      .select('*, prospect_people(*), prospect_interactions(*)').single()
    if (error) return erreurApi(req, res, 'internal', error, { route: 'prospects' })
    return res.status(201).json(data)
  }

  return res.status(405).json({ error: 'Méthode non autorisée' })
}
