// Économat : le catalogue et son arbre de catégories.
//
// UNE SEULE lecture renvoie les deux listes. Quatre-vingts articles et une
// cinquantaine de catégories, c'est petit, et l'écran a besoin des deux à la
// fois : les compteurs de l'arbre se calculent sur les articles, et la
// recherche porte aussi sur le nom des catégories.
//
// Lecture ET écriture pour tout membre — celui qui vide la boîte doit pouvoir
// corriger la fiche sans demander l'admin. Seule la SUPPRESSION définitive est
// réservée à l'admin : tout le monde peut archiver.
import { getSupabaseServer } from '../../../lib/supabase-server'
import { requireUser, isAdminUser } from '../../../lib/requireAdmin'
import { erreurApi } from '../../../lib/apiError'
import { validerArticle } from '../../../lib/economat'

const supabase = getSupabaseServer()

const CHAMPS = `id, code, jeton, designation, photo_path, categorie_id, fournisseur_id,
  fournisseur_alt_id, reference, url_produit, delai, delai_jours, unite, stock_cible, seuil_bas,
  seuil_commander, quantite_commande, emplacement, notes, etat, etat_le, archived, created_by,
  created_at, updated_at`

export default async function handler(req, res) {
  const utilisateur = await requireUser(req, res)
  if (!utilisateur) return

  if (req.method === 'GET') {
    const [articles, categories, fournisseurs] = await Promise.all([
      supabase.from('economat_articles').select(CHAMPS).order('designation'),
      supabase.from('economat_categories').select('id, nom, parent_id, couleur, archived').order('nom'),
      supabase.from('economat_fournisseurs').select('id, nom, annuaire_id, archived').order('nom'),
    ])
    const souci = articles.error || categories.error || fournisseurs.error
    if (souci) return erreurApi(req, res, 'internal', souci, { route: 'economat' })
    return res.status(200).json({
      articles: articles.data, categories: categories.data, fournisseurs: fournisseurs.data,
    })
  }

  if (req.method === 'POST') {
    const { ok, erreur, valeur } = validerArticle(req.body)
    if (!ok) return res.status(400).json({ error: erreur })
    // `code` et `jeton` viennent de la base (séquence et défaut) : personne ne
    // les choisit, et ils ne sont jamais réattribués.
    const { data, error } = await supabase.from('economat_articles')
      .insert({ ...valeur, created_by: utilisateur.name || utilisateur.email || null })
      .select(CHAMPS).single()
    if (error) return erreurApi(req, res, 'internal', error, { route: 'economat' })
    return res.status(201).json(data)
  }

  if (req.method === 'PUT') {
    const id = Number(req.body?.id)
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id requis' })
    const { ok, erreur, valeur } = validerArticle(req.body, { partiel: true })
    if (!ok) return res.status(400).json({ error: erreur })

    const { data, error } = await supabase.from('economat_articles')
      .update({ ...valeur, updated_at: new Date().toISOString() })
      .eq('id', id).select(CHAMPS).maybeSingle()
    if (error) return erreurApi(req, res, 'internal', error, { route: 'economat' })
    if (!data) return res.status(404).json({ error: 'Article introuvable' })
    return res.status(200).json(data)
  }

  if (req.method === 'DELETE') {
    const id = Number(req.body?.id)
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id requis' })
    // Un article se range, il ne se jette pas : son code est imprimé sur une
    // carte et cité dans l'historique des commandes. Supprimer pour de bon
    // emporterait ce journal (CASCADE) — réservé à l'admin, et seulement pour
    // une ligne créée par erreur.
    if (!isAdminUser(utilisateur)) return res.status(403).json({ error: 'Archive l\'article plutôt que de le supprimer.' })
    const { error } = await supabase.from('economat_articles').delete().eq('id', id)
    if (error) return erreurApi(req, res, 'internal', error, { route: 'economat' })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Méthode non autorisée' })
}
