// Une présentation : lecture, enregistrement, suppression.
//
// L'écran enregistre le deck ENTIER à chaque modification — c'est un document,
// pas une base de données, et une sauvegarde partielle laisserait une page
// incohérente avec la suivante. `validerMajPresentation` dit ce que la requête
// a le droit de changer : le corps n'est jamais recopié en bloc.
import { getSupabaseServer } from '../../../lib/supabase-server'
import { requireUser } from '../../../lib/requireAdmin'
import { erreurApi } from '../../../lib/apiError'
import { validerMajPresentation } from '../../../lib/presentation'
import { trous } from '../../../lib/deck'

// Un deck avec ses textes tient largement dessous ; les visuels, eux, passent
// par la route d'image et ne transitent jamais dans ce corps.
export const config = { api: { bodyParser: { sizeLimit: '2mb' } } }

const supabase = getSupabaseServer()
const CHAMPS = `id, project_id, titre, contenu, consignes, fichiers,
  kdrive_id, kdrive_nom, envoyee_le, created_by, created_at, updated_at`

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return
  const { id } = req.query

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('presentations').select(CHAMPS).eq('id', id).maybeSingle()
    if (error) return erreurApi(req, res, 'internal', error, { route: 'presentations/[id]' })
    if (!data) return res.status(404).json({ error: 'Présentation introuvable' })
    return res.status(200).json({ ...data, trous: trous(data.contenu || {}) })
  }

  if (req.method === 'PUT') {
    const { maj, error: refus } = validerMajPresentation(req.body || {})
    if (refus) return res.status(400).json({ error: refus })

    const { data, error } = await supabase.from('presentations').update(maj).eq('id', id).select(CHAMPS).maybeSingle()
    if (error) return erreurApi(req, res, 'internal', error, { route: 'presentations/[id]' })
    if (!data) return res.status(404).json({ error: 'Présentation introuvable' })
    return res.status(200).json({ ...data, trous: trous(data.contenu || {}) })
  }

  if (req.method === 'DELETE') {
    // Le PDF déposé sur kDrive n'est PAS supprimé : une fois envoyé au client,
    // il est une pièce du dossier et ne dépend plus de ce brouillon.
    const { error } = await supabase.from('presentations').delete().eq('id', id)
    if (error) return erreurApi(req, res, 'internal', error, { route: 'presentations/[id]' })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Méthode non autorisée' })
}
