// Les catégories de l'économat : on range par FONCTION dans l'atelier.
//
// Auto-référence, aucune profondeur imposée en base, deux niveaux à l'écran —
// même forme que l'annuaire et le catalogue. Rien n'est codé en dur : les
// douze catégories du brief sont SEMÉES par la migration, pas écrites dans le
// code, et tout se renomme, se recolore et s'archive depuis l'écran.
//
// Supprimer une catégorie emporte ses sous-catégories (CASCADE) mais JAMAIS
// ses articles : `economat_articles.categorie_id` est en ON DELETE SET NULL.
// Un article est un objet physique dans une boîte ; ranger la taxonomie ne
// doit pas l'effacer.
import { getSupabaseServer } from '../../../lib/supabase-server'
import { requireUser } from '../../../lib/requireAdmin'
import { erreurApi } from '../../../lib/apiError'
import { validerCategorie, descendantes } from '../../../lib/economat'

const supabase = getSupabaseServer()
const CHAMPS = 'id, nom, parent_id, couleur, archived'

async function toutes() {
  const { data } = await supabase.from('economat_categories').select(CHAMPS)
  return data || []
}

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return

  if (req.method === 'POST') {
    const existantes = await toutes()
    const { ok, erreur, valeur } = validerCategorie(req.body, existantes)
    if (!ok) return res.status(400).json({ error: erreur })
    const { data, error } = await supabase.from('economat_categories').insert(valeur).select(CHAMPS).single()
    if (error) return erreurApi(req, res, 'internal', error, { route: 'economat/categories' })
    return res.status(201).json(data)
  }

  if (req.method === 'PUT') {
    const id = Number(req.body?.id)
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id requis' })
    const existantes = await toutes()
    const { ok, erreur, valeur } = validerCategorie(req.body, existantes, { id })
    if (!ok) return res.status(400).json({ error: erreur })
    const { data, error } = await supabase.from('economat_categories')
      .update({ ...valeur, updated_at: new Date().toISOString() })
      .eq('id', id).select(CHAMPS).maybeSingle()
    if (error) return erreurApi(req, res, 'internal', error, { route: 'economat/categories' })
    if (!data) return res.status(404).json({ error: 'Catégorie introuvable' })
    return res.status(200).json(data)
  }

  if (req.method === 'DELETE') {
    const id = Number(req.body?.id)
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id requis' })
    const existantes = await toutes()
    const { error } = await supabase.from('economat_categories').delete().eq('id', id)
    if (error) return erreurApi(req, res, 'internal', error, { route: 'economat/categories' })
    // Le décompte sert au message de l'écran, qui l'annonce AVANT de supprimer.
    return res.status(200).json({ ok: true, sousCategories: descendantes(id, existantes).length })
  }

  return res.status(405).json({ error: 'Méthode non autorisée' })
}
