// Coûts réels d'un projet : matériaux, sous-traitance et autres frais payés.
//
// Réservé à l'admin, lecture comprise : ces montants, rapprochés de l'offre,
// disent la marge réellement faite sur le projet.
//
// Chaque ligne est lue, modifiée et supprimée À TRAVERS son projet : un
// identifiant de coût envoyé dans le corps ne touche jamais la ligne d'un
// autre projet.
import { getSupabaseServer } from '../../../../lib/supabase-server'
import { requireAdmin } from '../../../../lib/requireAdmin'
import { erreurApi } from '../../../../lib/apiError'
import { validerCout } from '../../../../lib/rentabilite'

const CHAMPS = 'id, categorie, libelle, fournisseur, montant_ht, date, created_by, created_at'
const MODIFIABLES = ['categorie', 'libelle', 'fournisseur', 'montant_ht', 'date']

export default async function handler(req, res) {
  const user = await requireAdmin(req, res)
  if (!user) return
  const supabase = getSupabaseServer()
  const { id } = req.query

  const { data: projet } = await supabase.from('projects').select('id').eq('id', id).maybeSingle()
  if (!projet) return res.status(404).json({ error: 'Projet introuvable' })

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('project_couts').select(CHAMPS).eq('project_id', id).order('created_at')
    if (error) return erreurApi(req, res, 'internal', error, { route: 'projects/[id]/couts' })
    return res.status(200).json(data)
  }

  if (req.method === 'POST') {
    const v = validerCout(req.body)
    if (!v.ok) return res.status(400).json({ error: v.erreur })
    const { data, error } = await supabase
      .from('project_couts')
      .insert({ ...v.valeur, project_id: id, created_by: user.name })
      .select(CHAMPS)
      .single()
    if (error) return erreurApi(req, res, 'internal', error, { route: 'projects/[id]/couts' })
    return res.status(201).json(data)
  }

  if (req.method === 'PATCH' || req.method === 'DELETE') {
    const coutId = req.body?.coutId
    if (!coutId) return res.status(400).json({ error: 'coutId requis' })
    const { data: existant } = await supabase
      .from('project_couts').select(CHAMPS).eq('id', coutId).eq('project_id', id).maybeSingle()
    if (!existant) return res.status(404).json({ error: 'Coût introuvable' })

    if (req.method === 'DELETE') {
      const { error } = await supabase.from('project_couts').delete().eq('id', coutId).eq('project_id', id)
      if (error) return erreurApi(req, res, 'internal', error, { route: 'projects/[id]/couts' })
      return res.status(200).json({ ok: true })
    }

    const fusion = {}
    for (const k of MODIFIABLES) fusion[k] = k in req.body ? req.body[k] : existant[k]
    const v = validerCout(fusion)
    if (!v.ok) return res.status(400).json({ error: v.erreur })
    const { data, error } = await supabase
      .from('project_couts').update(v.valeur).eq('id', coutId).eq('project_id', id).select(CHAMPS).single()
    if (error) return erreurApi(req, res, 'internal', error, { route: 'projects/[id]/couts' })
    return res.status(200).json(data)
  }

  return res.status(405).json({ error: 'Méthode non autorisée' })
}
