// L'annuaire : entrées, catégories et rattachements.
//
// UNE SEULE lecture renvoie les trois listes. Elles sont petites — quelques
// dizaines de lignes — et l'écran a besoin des trois à la fois : les compteurs
// de l'arbre se calculent sur les liens, et la recherche porte aussi sur les
// noms de catégories. Trois appels auraient fait clignoter la page en trois
// temps pour la même information.
//
// Lecture ET écriture pour tout membre : c'est un savoir d'atelier, celui qui
// trouve un bon tôlier doit pouvoir l'inscrire sans demander à l'admin.
import { getSupabaseServer } from '../../lib/supabase-server'
import { requireUser } from '../../lib/requireAdmin'
import { erreurApi } from '../../lib/apiError'
import { validerEntree } from '../../lib/annuaire'

const supabase = getSupabaseServer()
const CHAMPS = `id, nom, quoi, site, email, telephone, contact_nom, adresse, ville, notes,
  archived, created_by, created_at, updated_at`

/** Réécrit les rattachements d'une entrée : on remplace, on n'ajoute pas. */
async function poserCategories(entreeId, categories) {
  await supabase.from('annuaire_liens').delete().eq('entree_id', entreeId)
  if (!categories || categories.length === 0) return null
  const { error } = await supabase.from('annuaire_liens')
    .insert(categories.map(c => ({ entree_id: entreeId, categorie_id: c })))
  return error || null
}

export default async function handler(req, res) {
  const utilisateur = await requireUser(req, res)
  if (!utilisateur) return

  if (req.method === 'GET') {
    const [entrees, categories, liens] = await Promise.all([
      supabase.from('annuaire').select(CHAMPS).order('nom'),
      supabase.from('annuaire_categories').select('id, nom, parent_id').order('nom'),
      supabase.from('annuaire_liens').select('entree_id, categorie_id'),
    ])
    const souci = entrees.error || categories.error || liens.error
    if (souci) return erreurApi(req, res, 'internal', souci, { route: 'annuaire' })
    return res.status(200).json({ entrees: entrees.data, categories: categories.data, liens: liens.data })
  }

  if (req.method === 'POST') {
    const { ok, erreur, valeur, categories } = validerEntree(req.body)
    if (!ok) return res.status(400).json({ error: erreur })

    const { data, error } = await supabase.from('annuaire')
      // L'identité vient du jeton, jamais du corps de la requête.
      .insert({ ...valeur, created_by: utilisateur.email || null }).select(CHAMPS).single()
    if (error) return erreurApi(req, res, 'internal', error, { route: 'annuaire' })

    const souci = await poserCategories(data.id, categories)
    if (souci) return erreurApi(req, res, 'internal', souci, { route: 'annuaire' })
    return res.status(200).json(data)
  }

  if (req.method === 'PUT') {
    const id = Number(req.body?.id)
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id requis' })
    const { ok, erreur, valeur, categories } = validerEntree(req.body, { partiel: true })
    if (!ok) return res.status(400).json({ error: erreur })

    const { data, error } = await supabase.from('annuaire')
      .update({ ...valeur, updated_at: new Date().toISOString() }).eq('id', id).select(CHAMPS).maybeSingle()
    if (error) return erreurApi(req, res, 'internal', error, { route: 'annuaire' })
    if (!data) return res.status(404).json({ error: 'Entrée introuvable' })

    // `categories: null` veut dire « on n'y touche pas » ; une liste vide veut
    // dire « plus aucune ». La distinction compte : une modification du seul
    // numéro de téléphone ne doit pas déranger le rangement.
    if (categories !== null) {
      const souci = await poserCategories(id, categories)
      if (souci) return erreurApi(req, res, 'internal', souci, { route: 'annuaire' })
    }
    return res.status(200).json(data)
  }

  if (req.method === 'DELETE') {
    const id = Number(req.body?.id)
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id requis' })
    // Les rattachements partent avec l'entrée (ON DELETE CASCADE).
    const { error } = await supabase.from('annuaire').delete().eq('id', id)
    if (error) return erreurApi(req, res, 'internal', error, { route: 'annuaire' })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Méthode non autorisée' })
}
