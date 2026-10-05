// Économat : le catalogue, son arbre de catégories et ses listes.
//
// UNE SEULE lecture renvoie tout. Quatre-vingts articles, une cinquantaine de
// catégories et quatre petites listes (fournisseurs, unités, délais,
// emplacements), c'est petit, et l'écran a besoin de tout à la fois : les
// compteurs de l'arbre se calculent sur les articles, la recherche porte sur
// les noms des catégories et des emplacements, et une quantité ne s'affiche
// pas sans son unité.
//
// Lecture ET écriture pour tout membre — celui qui vide la boîte doit pouvoir
// corriger la fiche sans demander l'admin. Seule la SUPPRESSION définitive est
// réservée à l'admin : tout le monde peut archiver.
import { getSupabaseServer } from '../../../lib/supabase-server'
import { requireUser, isAdminUser } from '../../../lib/requireAdmin'
import { erreurApi } from '../../../lib/apiError'
import { validerArticle, validerStock, validerCorrection, toucheStock, etatCalcule, LISTES } from '../../../lib/economat'

const supabase = getSupabaseServer()

const CHAMPS = `id, code, jeton, type, designation, sous_titre, photo_path, categorie_id,
  emplacement_id, fournisseur_id, fournisseur_alt_id, reference, url_produit,
  suivi, unite_stock_id, decoupage, cible, seuil_orange, seuil_rouge, stock,
  mode_appro, quantite_cmd, unite_cmd_id, delai_id, note_appro, notes,
  unite, stock_cible, seuil_bas, seuil_commander, quantite_commande, delai, emplacement,
  reappro_par, reappro_le, etat, etat_le, archived, created_by, created_at, updated_at`

// Les projets associés (§3.2) arrivent sous forme d'une liste d'UUID.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function projetsValides(brut) {
  if (brut === undefined) return { ok: true, valeur: undefined }
  if (!Array.isArray(brut)) return { ok: false, erreur: 'Projets : une liste attendue' }
  const ids = [...new Set(brut.map(String))]
  if (ids.length > 50 || ids.some(id => !UUID.test(id))) return { ok: false, erreur: 'Projet inconnu' }
  return { ok: true, valeur: ids }
}

/** Remplace les liens d'un article. Deux écritures, sans transaction : un
 *  échec entre les deux laisse un article SANS projets, jamais avec ceux
 *  d'un autre — et la fiche se réenregistre. */
async function poserProjets(articleId, ids) {
  const { error: e1 } = await supabase.from('economat_article_projets').delete().eq('article_id', articleId)
  if (e1) return e1
  if (!ids.length) return null
  const { error: e2 } = await supabase.from('economat_article_projets')
    .insert(ids.map(project_id => ({ article_id: articleId, project_id })))
  return e2 || null
}

export default async function handler(req, res) {
  const utilisateur = await requireUser(req, res)
  if (!utilisateur) return

  if (req.method === 'GET') {
    const [articles, categories, fournisseurs, unites, delais, emplacements, liens] = await Promise.all([
      supabase.from('economat_articles').select(CHAMPS).order('designation'),
      supabase.from('economat_categories').select('id, nom, parent_id, couleur, archived').order('nom'),
      supabase.from('economat_fournisseurs').select('id, nom, archived').order('nom'),
      supabase.from(LISTES.unites.table).select(LISTES.unites.champs).order(LISTES.unites.tri),
      supabase.from(LISTES.delais.table).select(LISTES.delais.champs).order(LISTES.delais.tri),
      supabase.from(LISTES.emplacements.table).select(LISTES.emplacements.champs).order(LISTES.emplacements.tri),
      supabase.from('economat_article_projets').select('article_id, project_id'),
    ])
    const souci = articles.error || categories.error || fournisseurs.error
      || unites.error || delais.error || emplacements.error || liens.error
    if (souci) return erreurApi(req, res, 'internal', souci, { route: 'economat' })

    const parArticle = {}
    for (const l of liens.data || []) (parArticle[l.article_id] ||= []).push(l.project_id)
    return res.status(200).json({
      articles: (articles.data || []).map(a => ({ ...a, projets: parArticle[a.id] || [] })),
      categories: categories.data,
      fournisseurs: fournisseurs.data,
      unites: unites.data,
      delais: delais.data,
      emplacements: emplacements.data,
    })
  }

  if (req.method === 'POST') {
    const { ok, erreur, valeur } = validerArticle(req.body, { creation: true })
    if (!ok) return res.status(400).json({ error: erreur })
    // §2.1 et §4.2 : un article STOCKÉ naît configuré — mode de suivi, unité,
    // cible et seuil rouge. Seuls les articles repris de V1 ont le droit
    // d'être incomplets (§26).
    const stock = validerStock({ ...valeur, ...pickStock(req.body) })
    if (!stock.ok) return res.status(400).json({ error: stock.erreur })
    if (valeur.type !== 'reference' && !stock.valeur.suivi) {
      return res.status(400).json({ error: 'Configure le stock : mode de suivi, unité, cible et seuil rouge' })
    }
    const projets = projetsValides(req.body?.projets)
    if (!projets.ok) return res.status(400).json({ error: projets.erreur })

    // `code` et `jeton` viennent de la base (séquence et défaut) : personne ne
    // les choisit, et ils ne sont jamais réattribués.
    // L'état d'un article configuré est CALCULÉ (§6) — la base le tient
    // ensuite à jour à chaque geste.
    const etat = etatCalcule({ ...valeur, ...stock.valeur })
    const { data, error } = await supabase.from('economat_articles')
      .insert({ ...valeur, ...stock.valeur, ...(etat ? { etat } : {}), created_by: utilisateur.name || utilisateur.email || null })
      .select(CHAMPS).single()
    if (error) return erreurApi(req, res, 'internal', error, { route: 'economat' })
    if (projets.valeur?.length) {
      const e = await poserProjets(data.id, projets.valeur)
      if (e) return erreurApi(req, res, 'internal', e, { route: 'economat' })
    }
    return res.status(201).json({ ...data, projets: projets.valeur || [] })
  }

  if (req.method === 'PUT') {
    const id = Number(req.body?.id)
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id requis' })
    const { ok, erreur, valeur } = validerArticle(req.body, { partiel: true })
    if (!ok) return res.status(400).json({ error: erreur })
    const projets = projetsValides(req.body?.projets)
    if (!projets.ok) return res.status(400).json({ error: projets.erreur })

    const { data: avant, error: lecture } = await supabase.from('economat_articles').select(CHAMPS).eq('id', id).maybeSingle()
    if (lecture) return erreurApi(req, res, 'internal', lecture, { route: 'economat' })
    if (!avant) return res.status(404).json({ error: 'Article introuvable' })

    const patch = { ...valeur }
    // Le bloc Stock se valide FUSIONNÉ : un seuil n'a de sens que rapporté à
    // la cible et au découpage. Passer en « Référence uniquement » l'efface.
    if (toucheStock(req.body) || valeur.type !== undefined) {
      const stock = validerStock({ ...avant, ...valeur, ...pickStock(req.body) }, avant)
      if (!stock.ok) return res.status(400).json({ error: stock.erreur })
      Object.assign(patch, stock.valeur)
      // Bloc effacé (suivi vidé, passage en référence) : plus de stock, donc
      // plus de réapprovisionnement en cours.
      if (!stock.valeur.suivi) Object.assign(patch, { reappro_par: null, reappro_le: null })
      const etat = etatCalcule({ ...avant, ...patch })
      if (etat && etat !== avant.etat) Object.assign(patch, { etat, etat_le: new Date().toISOString() })
    }
    // La correction manuelle du stock (§4.2 : erreur ou inventaire) passe par
    // la base, comme tout geste de stock : elle laisse sa trace dans
    // l'historique. Validée ici d'abord, sur la configuration à venir.
    let correction = null
    if (req.body?.stock !== undefined && req.body?.stock !== '') {
      const corr = validerCorrection(req.body.stock, { ...avant, ...patch })
      if (!corr.ok) return res.status(400).json({ error: corr.erreur })
      correction = corr.valeur
    }

    const { data, error } = await supabase.from('economat_articles')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id).select(CHAMPS).maybeSingle()
    if (error) return erreurApi(req, res, 'internal', error, { route: 'economat' })
    if (!data) return res.status(404).json({ error: 'Article introuvable' })
    if (correction !== null && correction !== data.stock) {
      const { data: r, error: e } = await supabase.rpc('economat_stock', {
        p_article: id, p_type: 'correction', p_delta: null, p_valeur: correction, p_par: utilisateur.name || utilisateur.email || null,
      })
      if (e) return erreurApi(req, res, 'internal', e, { route: 'economat' })
      if (r?.ok) data.stock = r.apres
    }
    if (projets.valeur) {
      const e = await poserProjets(id, projets.valeur)
      if (e) return erreurApi(req, res, 'internal', e, { route: 'economat' })
    }
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

/** Les seules clés du bloc Stock lues dans le corps — jamais le corps entier. */
function pickStock(b = {}) {
  const out = {}
  for (const k of ['suivi', 'unite_stock_id', 'decoupage', 'cible', 'seuil_orange', 'seuil_rouge']) {
    if (b[k] !== undefined) out[k] = b[k]
  }
  return out
}
