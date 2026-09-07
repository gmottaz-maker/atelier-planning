// Arborescence des catégories du catalogue.
//
// Le calcul vit ici et non dans la page : Vitest ne transforme pas le JSX, et
// l'ordre des catégories est précisément ce qui doit être testable — il dépend
// de l'usage, donc il change tout seul.

export const SANS_CATEGORIE = '__sans__'

/**
 * Usage cumulé d'une catégorie : ses articles PLUS ceux de ses sous-catégories.
 *
 * Sans la remontée, une catégorie dont tout le contenu est rangé en
 * sous-catégories afficherait un usage nul et tomberait en bas de la liste,
 * alors qu'elle est la plus sollicitée.
 */
function usageDe(categorie, articles, enfantsDe) {
  const compte = (id) => articles
    .filter(a => String(a.category_id) === String(id))
    .reduce((n, a) => n + (a.usage_count || 0), 0)
  return compte(categorie.id)
    + (enfantsDe.get(String(categorie.id)) || []).reduce((n, e) => n + compte(e.id), 0)
}

function nbArticles(id, articles, enfantsDe) {
  const compte = (cid) => articles.filter(a => String(a.category_id) === String(cid)).length
  return compte(id) + (enfantsDe.get(String(id)) || []).reduce((n, e) => n + compte(e.id), 0)
}

/**
 * Construit l'arbre affichable : racines ordonnées par USAGE décroissant, puis
 * par nom ; sous-catégories de même.
 *
 * L'ordre suit l'usage plutôt que l'alphabet parce que « Quincaillerie », qui
 * sert tous les jours, n'a aucune raison d'attendre en bas de liste. Tant que
 * rien n'a servi, tous les compteurs valent 0 et l'ordre retombe sur l'alphabet
 * — le classement se construit à l'usage au lieu d'exiger un réglage initial.
 *
 * `articles` sert à la fois aux compteurs et au masquage : une catégorie vide
 * pour le filtre courant disparaît, ce qui évite d'avoir à typer les catégories.
 */
export function construireArbre(categories, articles, { masquerVides = true } = {}) {
  const cats = Array.isArray(categories) ? categories : []
  const arts = Array.isArray(articles) ? articles : []

  const enfantsDe = new Map()
  for (const c of cats) {
    if (!c.parent_id) continue
    const cle = String(c.parent_id)
    if (!enfantsDe.has(cle)) enfantsDe.set(cle, [])
    enfantsDe.get(cle).push(c)
  }

  const parUsage = (a, b) => (b.usage - a.usage) || a.name.localeCompare(b.name, 'fr')

  const racines = cats
    .filter(c => !c.parent_id)
    .map(c => ({
      ...c,
      usage: usageDe(c, arts, enfantsDe),
      nb: nbArticles(c.id, arts, enfantsDe),
      enfants: (enfantsDe.get(String(c.id)) || [])
        .map(e => ({
          ...e,
          usage: usageDe(e, arts, new Map()),
          nb: arts.filter(a => String(a.category_id) === String(e.id)).length,
          enfants: [],
        }))
        .filter(e => !masquerVides || e.nb > 0)
        .sort(parUsage),
    }))
    .filter(c => !masquerVides || c.nb > 0)
    .sort(parUsage)

  return racines
}

/** Les articles sans catégorie, comptés à part pour rester visibles. */
export function nbSansCategorie(articles) {
  return (articles || []).filter(a => !a.category_id).length
}

/**
 * Les articles à montrer pour une sélection.
 *
 * Sélectionner une catégorie PARENTE montre aussi le contenu de ses
 * sous-catégories : on clique sur « Bois » pour voir tout le bois, pas pour
 * voir les seuls articles qu'on aurait oublié de ranger plus finement.
 */
export function articlesDe(selection, articles, categories) {
  const arts = Array.isArray(articles) ? articles : []
  if (!selection) return arts
  if (selection === SANS_CATEGORIE) return arts.filter(a => !a.category_id)

  const cats = Array.isArray(categories) ? categories : []
  const ids = new Set([String(selection)])
  for (const c of cats) if (String(c.parent_id) === String(selection)) ids.add(String(c.id))
  return arts.filter(a => a.category_id && ids.has(String(a.category_id)))
}

/** « Bois › Panneaux » — le chemin lisible d'une catégorie. */
export function cheminDe(categoryId, categories) {
  const cats = Array.isArray(categories) ? categories : []
  const c = cats.find(x => String(x.id) === String(categoryId))
  if (!c) return null
  const parent = c.parent_id ? cats.find(x => String(x.id) === String(c.parent_id)) : null
  return parent ? `${parent.name} · ${c.name}` : c.name
}

/**
 * Ce qu'une suppression va emporter.
 *
 * La suppression est en cascade jusqu'aux ARTICLES — c'est le comportement
 * demandé, et le plus destructeur des trois possibles. Cette fonction existe
 * pour que la confirmation puisse nommer les nombres exacts au lieu de dire
 * « êtes-vous sûr ? », qui ne renseigne personne.
 */
export function impactSuppression(categoryId, categories, articles) {
  const cats = Array.isArray(categories) ? categories : []
  const arts = Array.isArray(articles) ? articles : []
  const enfants = cats.filter(c => String(c.parent_id) === String(categoryId))
  const ids = new Set([String(categoryId), ...enfants.map(e => String(e.id))])
  return {
    sousCategories: enfants.length,
    articles: arts.filter(a => a.category_id && ids.has(String(a.category_id))).length,
  }
}
