// Les catégories de l'annuaire : par TECHNIQUE, jamais par région.
//
// L'arbre n'a pas de profondeur imposée en base ; l'écran en montre deux.
// Supprimer une catégorie emporte ses sous-catégories et les rattachements
// (ON DELETE CASCADE) — les entrées, elles, restent : elles se retrouvent sans
// catégorie, pas à la corbeille.
import { getSupabaseServer } from '../../lib/supabase-server'
import { requireUser } from '../../lib/requireAdmin'
import { erreurApi } from '../../lib/apiError'
import { validerCategorie, descendantes } from '../../lib/annuaire'

const supabase = getSupabaseServer()

async function toutesLesCategories() {
  const { data } = await supabase.from('annuaire_categories').select('id, nom, parent_id')
  return data || []
}

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return

  if (req.method === 'POST') {
    const existantes = await toutesLesCategories()
    const { ok, erreur, valeur } = validerCategorie(req.body, existantes)
    if (!ok) return res.status(400).json({ error: erreur })

    const { data, error } = await supabase.from('annuaire_categories')
      .insert(valeur).select('id, nom, parent_id').single()
    if (error) return erreurApi(req, res, 'internal', error, { route: 'annuaire-categories' })
    return res.status(200).json(data)
  }

  if (req.method === 'PUT') {
    const id = Number(req.body?.id)
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id requis' })
    const existantes = await toutesLesCategories()
    const { ok, erreur, valeur } = validerCategorie(req.body, existantes, { id })
    if (!ok) return res.status(400).json({ error: erreur })

    const { data, error } = await supabase.from('annuaire_categories')
      .update({ ...valeur, updated_at: new Date().toISOString() })
      .eq('id', id).select('id, nom, parent_id').maybeSingle()
    if (error) return erreurApi(req, res, 'internal', error, { route: 'annuaire-categories' })
    if (!data) return res.status(404).json({ error: 'Catégorie introuvable' })
    return res.status(200).json(data)
  }

  if (req.method === 'DELETE') {
    const id = Number(req.body?.id)
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id requis' })
    const existantes = await toutesLesCategories()
    const { error } = await supabase.from('annuaire_categories').delete().eq('id', id)
    if (error) return erreurApi(req, res, 'internal', error, { route: 'annuaire-categories' })
    // Le décompte sert au message de l'écran, qui l'annonce AVANT de supprimer.
    return res.status(200).json({ ok: true, sousCategories: descendantes(id, existantes).length })
  }

  return res.status(405).json({ error: 'Méthode non autorisée' })
}
