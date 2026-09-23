// L'annuaire : qui fait quoi, et où l'on commande.
//
// Le calcul vit ici et pas dans l'écran — Vitest ne transforme pas le JSX, et
// c'est précisément la recherche et le rangement par technique qui doivent
// être testables.
//
// Deux principes tenus par les fonctions ci-dessous :
//
//  1. UNE ENTRÉE PEUT N'ÊTRE QU'UN NOM. Un site noté à la volée vaut mieux
//     qu'une fiche complète jamais saisie ; tout le reste est facultatif.
//  2. ON RANGE PAR TECHNIQUE, jamais par région. Une catégorie filtre donc
//     avec ses sous-catégories : demander « CNC » doit sortir aussi les
//     fournisseurs de fraises rangés dessous.

/** Les champs qu'une requête a le droit d'écrire. Jamais `{ ...req.body }`. */
const CHAMPS = ['nom', 'quoi', 'site', 'email', 'telephone', 'contact_nom', 'adresse', 'ville', 'notes']

const txt = (v, max = 400) => (v === null || v === undefined ? '' : String(v).trim().slice(0, max))

/**
 * Un site saisi « ruco.ch » est un site : on ne refuse pas une adresse pour
 * un préfixe manquant, on le pose. Ce qui ne ressemble à rien est gardé tel
 * quel — l'écran l'affichera en texte plutôt qu'en lien.
 */
export function normaliserSite(valeur) {
  const v = txt(valeur, 300)
  if (!v) return ''
  if (/^https?:\/\//i.test(v)) return v
  if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(v)) return `https://${v}`
  return v
}

export function estLienValide(site) {
  return /^https?:\/\/[^\s]+$/i.test(String(site || ''))
}

/** Valide une entrée. Renvoie { ok, valeur } ou { ok: false, erreur }. */
export function validerEntree(brut, { partiel = false } = {}) {
  const b = brut || {}
  const valeur = {}

  for (const champ of CHAMPS) {
    if (partiel && b[champ] === undefined) continue
    const max = champ === 'notes' ? 4000 : champ === 'adresse' ? 400 : 200
    valeur[champ] = champ === 'site' ? normaliserSite(b[champ]) : txt(b[champ], max)
  }

  if (!partiel || b.nom !== undefined) {
    if (!valeur.nom) return { ok: false, erreur: 'Un nom est requis' }
  }
  if (valeur.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(valeur.email)) {
    return { ok: false, erreur: 'Adresse e-mail invalide' }
  }
  if (b.archived !== undefined) valeur.archived = b.archived === true

  // Les catégories voyagent à part : ce sont des lignes de liaison, pas des
  // colonnes de l'entrée.
  const categories = Array.isArray(b.categories)
    ? [...new Set(b.categories.map(Number).filter(n => Number.isInteger(n) && n > 0))].slice(0, 12)
    : null

  if (Object.keys(valeur).length === 0 && categories === null) {
    return { ok: false, erreur: 'Rien à enregistrer' }
  }
  return { ok: true, valeur, categories }
}

/** Valide une catégorie. Le parent doit exister, et ne peut pas être soi-même. */
export function validerCategorie(brut, existantes = [], { id = null } = {}) {
  const nom = txt(brut?.nom, 80)
  if (!nom) return { ok: false, erreur: 'Un nom est requis' }

  const parent = brut?.parent_id === null || brut?.parent_id === undefined || brut?.parent_id === ''
    ? null : Number(brut.parent_id)
  if (parent !== null) {
    if (!Number.isInteger(parent)) return { ok: false, erreur: 'Catégorie parente inconnue' }
    if (id !== null && Number(id) === parent) return { ok: false, erreur: 'Une catégorie ne peut pas être sa propre parente' }
    if (!existantes.some(c => Number(c.id) === parent)) return { ok: false, erreur: 'Catégorie parente inconnue' }
    // Une descendante ne peut pas devenir la parente : la boucle rendrait
    // l'arbre infini, et la base ne l'interdit pas.
    if (id !== null && descendantes(id, existantes).some(c => Number(c.id) === parent)) {
      return { ok: false, erreur: 'Une catégorie ne peut pas descendre d\'elle-même' }
    }
  }
  return { ok: true, valeur: { nom, parent_id: parent } }
}

/** Toutes les catégories sous celle-ci, à n'importe quelle profondeur. */
export function descendantes(id, categories = []) {
  const sortie = []
  const file = [Number(id)]
  while (file.length) {
    const courant = file.shift()
    for (const c of categories) {
      if (Number(c.parent_id) === courant && !sortie.some(x => Number(x.id) === Number(c.id))) {
        sortie.push(c)
        file.push(Number(c.id))
      }
    }
  }
  return sortie
}

/** Les catégories d'une entrée, d'après les liaisons. */
export function categoriesDe(entreeId, liens = [], categories = []) {
  const ids = liens.filter(l => Number(l.entree_id) === Number(entreeId)).map(l => Number(l.categorie_id))
  return categories.filter(c => ids.includes(Number(c.id)))
}

/**
 * L'arbre affichable : racines par ordre alphabétique, chacune avec ses
 * sous-catégories et le nombre d'entrées — les siennes ET celles de ses
 * sous-catégories. Sans cette remontée, « CNC » afficherait zéro alors que
 * tout est rangé dans « fraises ».
 */
export function arbreAnnuaire(categories = [], liens = []) {
  const cats = Array.isArray(categories) ? categories : []
  const parCategorie = new Map()
  for (const l of liens || []) {
    const cle = String(l.categorie_id)
    if (!parCategorie.has(cle)) parCategorie.set(cle, new Set())
    parCategorie.get(cle).add(String(l.entree_id))
  }
  const compte = id => {
    const vues = new Set(parCategorie.get(String(id)) || [])
    for (const d of descendantes(id, cats)) for (const e of parCategorie.get(String(d.id)) || []) vues.add(e)
    return vues.size
  }
  const parNom = (a, b) => String(a.nom).localeCompare(String(b.nom), 'fr')

  return cats
    .filter(c => !c.parent_id)
    .map(c => ({
      ...c,
      nb: compte(c.id),
      enfants: cats.filter(e => Number(e.parent_id) === Number(c.id))
        .map(e => ({ ...e, nb: compte(e.id) }))
        .sort(parNom),
    }))
    .sort(parNom)
}

const sansAccent = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * Filtre et range les entrées.
 *
 * La recherche porte sur TOUT ce qui identifie une entrée, noms de catégories
 * compris : taper « thermolaquage » doit sortir l'atelier rangé dessous même
 * si le mot n'est écrit nulle part dans sa fiche. Une catégorie choisie inclut
 * ses sous-catégories.
 */
export function filtrerEntrees(entrees = [], { recherche = '', categorie = null, liens = [], categories = [], archivees = false } = {}) {
  const mots = sansAccent(recherche).split(/\s+/).filter(Boolean)

  let ids = null
  if (categorie) {
    const voulues = new Set([Number(categorie), ...descendantes(categorie, categories).map(c => Number(c.id))])
    ids = new Set(liens.filter(l => voulues.has(Number(l.categorie_id))).map(l => Number(l.entree_id)))
  }

  return (entrees || [])
    .filter(e => (archivees ? true : !e.archived))
    .filter(e => (ids ? ids.has(Number(e.id)) : true))
    .filter(e => {
      if (mots.length === 0) return true
      const noms = categoriesDe(e.id, liens, categories).map(c => c.nom).join(' ')
      const botte = sansAccent([e.nom, e.quoi, e.ville, e.contact_nom, e.notes, e.site, noms].filter(Boolean).join(' '))
      // TOUS les mots doivent être là : « laser genève » cherche les deux.
      return mots.every(m => botte.includes(m))
    })
    .sort((a, b) => String(a.nom).localeCompare(String(b.nom), 'fr'))
}
