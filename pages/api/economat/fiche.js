// La fiche lue après un scan : un article désigné par le jeton de sa carte.
//
// Route séparée du catalogue parce que le téléphone n'a que faire des
// quatre-vingts autres articles : il lui faut UNE fiche, sa couleur, de quoi
// écrire les quantités (unités), et l'historique récent. C'est aussi ce qui
// garde la vue rapide utilisable sur un réseau d'atelier.
import { getSupabaseServer } from '../../../lib/supabase-server'
import { requireUser } from '../../../lib/requireAdmin'
import { erreurApi } from '../../../lib/apiError'

const supabase = getSupabaseServer()

const CHAMPS = `id, code, jeton, type, designation, sous_titre, photo_path, categorie_id,
  emplacement_id, fournisseur_id, fournisseur_alt_id, reference, url_produit,
  suivi, unite_stock_id, decoupage, cible, seuil_orange, seuil_rouge, stock,
  mode_appro, quantite_cmd, unite_cmd_id, delai_id, note_appro, notes,
  reappro_par, reappro_le, etat, etat_le, delai, delai_jours, archived`

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return
  if (req.method !== 'GET') return res.status(405).json({ error: 'Méthode non autorisée' })

  const jeton = String(req.query?.jeton || '').trim()
  if (!jeton) return res.status(400).json({ error: 'jeton requis' })

  const { data: article, error } = await supabase.from('economat_articles')
    .select(CHAMPS).eq('jeton', jeton).maybeSingle()
  if (error) return erreurApi(req, res, 'internal', error, { route: 'economat/fiche' })
  if (!article) return res.status(404).json({ error: 'Carte inconnue' })

  // L'arbre entier plutôt que la seule catégorie : c'est la RACINE qui porte
  // la couleur du bandeau, et elle peut être deux crans au-dessus.
  const [categories, fournisseurs, unites, delais, emplacements, mouvements] = await Promise.all([
    supabase.from('economat_categories').select('id, nom, parent_id, couleur'),
    supabase.from('economat_fournisseurs').select('id, nom'),
    supabase.from('economat_unites').select('id, nom, pluriel, feminin'),
    supabase.from('economat_delais').select('id, libelle'),
    supabase.from('economat_emplacements').select('id, nom'),
    supabase.from('economat_mouvements')
      .select('id, le, par, type, avant, apres, decoupage, annule_le')
      .eq('article_id', article.id).order('id', { ascending: false }).limit(8),
  ])
  return res.status(200).json({
    article,
    categories: categories.data || [],
    fournisseurs: fournisseurs.data || [],
    unites: unites.data || [],
    delais: delais.data || [],
    emplacements: emplacements.data || [],
    mouvements: mouvements.data || [],
  })
}
