// Économat — le catalogue des consommables, derrière le Kanban physique.
//
// Le calcul vit ici et pas dans l'écran : Vitest ne transforme pas le JSX, et
// c'est justement le filtrage, le lien fournisseur et la mise en planches qui
// doivent être vérifiables.
//
// Trois principes tenus par les fonctions ci-dessous :
//
//  1. MAZE NE DÉCIDE JAMAIS D'UN ÉTAT. Les seuils sont du texte humain, jamais
//     comparés à une quantité. Un humain devant une boîte bascule l'état ;
//     c'est tout le Kanban, et c'est ce qui rend l'outil honnête.
//  2. TOUTES LES TRANSITIONS SONT LIBRES. Le cycle habituel est
//     🟢 → 🟠 → 🔴 → 🔵 → 🟢, mais 🟠 → 🔵 (commande anticipée) doit passer.
//  3. UN ARTICLE PEUT N'ÊTRE QU'UNE DÉSIGNATION. Tout le reste est facultatif —
//     les 84 lignes reprises de Numbers n'ont ni emplacement, ni unité, ni
//     stock cible, et refuser de les saisir reviendrait à n'en saisir aucune.

// `descendantes` est un helper d'arbre pur, partagé avec l'annuaire : les deux
// outils rangent dans une table de catégories auto-référencée, et deux copies
// de la même traversée finiraient par diverger.
//
// Extension explicite : ce module est aussi chargé par `scripts/apercu-cartes.mjs`,
// hors de Next, et Node ne résout pas les imports sans extension.
import { descendantes } from './annuaire.js'

export { descendantes }

// ── États ──────────────────────────────────────────────────────────────────
// La clé est ce qui va en base ; l'emoji est de l'AFFICHAGE, jamais stocké.
export const ETATS = [
  { cle: 'ok',        emoji: '🟢', libelle: 'Stock OK',    court: 'OK' },
  { cle: 'bas',       emoji: '🟠', libelle: 'Stock bas',   court: 'Bas' },
  { cle: 'commander', emoji: '🔴', libelle: 'À commander', court: 'À commander' },
  { cle: 'commande',  emoji: '🔵', libelle: 'Commandé',    court: 'Commandé' },
]
export const ETAT_CLES = ETATS.map(e => e.cle)

/** Un état inconnu ne plante pas l'écran : il s'affiche en gris, sans emoji. */
export function etatInfo(cle) {
  return ETATS.find(e => e.cle === cle) || { cle: String(cle || ''), emoji: '', libelle: String(cle || '—'), court: '—' }
}

/** Ce qui doit sauter aux yeux dans le Suivi. Le vert reste accessible, en second. */
export const ETATS_CHAUDS = ['commander', 'bas', 'commande']

// ── Lien fournisseur ───────────────────────────────────────────────────────
//
// Vérifié en direct sur opo.ch : la recherche REDIRIGE sur la fiche produit
// quand la référence existe (85.175.4016 → .../p/bp90004336.html). Les 64
// articles OPO n'ont donc aucune URL à saisir — et une référence fausse tombe
// sur « 0 résultats », ce qui en fait aussi le vérificateur des références
// douteuses reprises de Numbers.
//
// Les autres fournisseurs (Galaxus, Conrad, qbendo.ch) gardent une URL saisie
// à la main : on ne devine pas une adresse, on laisse le bouton absent.
const OPO_RECHERCHE = 'https://www.opo.ch/fr/s?searchfield='

export const estOpo = f => /^\s*opo\b/i.test(String(f || ''))

/** « 85.175.4016 » → l'adresse de recherche OPO. Rien si la référence est vide. */
export function lienOpo(reference) {
  const ref = String(reference || '').trim()
  if (!ref) return ''
  return OPO_RECHERCHE + encodeURIComponent(ref)
}

/** Le nom d'un fournisseur, d'après la liste contrôlée. */
export function nomFournisseur(id, fournisseurs = []) {
  return fournisseurs.find(f => Number(f.id) === Number(id))?.nom || ''
}

/**
 * Où mène le bouton « Commander », ou '' s'il ne doit pas apparaître.
 *
 * L'URL SAISIE GAGNE TOUJOURS sur le lien déduit. La structure d'opo.ch est
 * stable aujourd'hui — vérifié sur les 64 références du fichier, toutes
 * redirigées sur leur fiche — mais c'est le site d'un tiers : le jour où une
 * référence ne sort plus de la recherche, on pose l'adresse à la main sur
 * cette fiche-là, sans rien attendre de personne.
 */
export function lienCommande(article, fournisseurs = []) {
  const url = String(article?.url_produit || '').trim()
  if (/^https?:\/\//i.test(url)) return url
  if (estOpo(nomFournisseur(article?.fournisseur_id, fournisseurs))) return lienOpo(article?.reference)
  return ''
}

// ── Validation ─────────────────────────────────────────────────────────────

/** Les champs qu'une requête a le droit d'écrire. Jamais `{ ...req.body }`. */
const CHAMPS = [
  'designation', 'photo_path', 'categorie_id', 'fournisseur_id', 'fournisseur_alt_id',
  'reference', 'url_produit', 'delai', 'delai_jours', 'unite', 'stock_cible', 'seuil_bas',
  'seuil_commander', 'quantite_commande', 'emplacement', 'notes',
]
// Les trois clés étrangères se valident pareil : vide → NULL, sinon un entier.
const CLES = ['categorie_id', 'fournisseur_id', 'fournisseur_alt_id']
// `code`, `jeton`, `etat` et `etat_le` n'y sont PAS : le code et le jeton sont
// posés par la base et définitifs, l'état passe par sa propre route parce
// qu'il écrit aussi le journal des commandes.

const txt = (v, max = 400) => (v === null || v === undefined ? '' : String(v).trim().slice(0, max))

const LONGUEURS = { notes: 4000, designation: 200, url_produit: 600, photo_path: 300 }

export function validerArticle(brut, { partiel = false } = {}) {
  const b = brut || {}
  const valeur = {}

  for (const champ of CHAMPS) {
    if (partiel && b[champ] === undefined) continue
    if (CLES.includes(champ)) {
      const brutCle = b[champ]
      const n = brutCle === '' || brutCle === null || brutCle === undefined ? null : Number(brutCle)
      if (n !== null && !Number.isInteger(n)) {
        return { ok: false, erreur: champ === 'categorie_id' ? 'Catégorie inconnue' : 'Fournisseur inconnu' }
      }
      valeur[champ] = n
      continue
    }
    if (champ === 'delai_jours') {
      const v = b.delai_jours
      if (v === '' || v === null || v === undefined) { valeur.delai_jours = null; continue }
      const n = Number(v)
      if (!Number.isInteger(n) || n < 0 || n > 365) return { ok: false, erreur: 'Le délai en jours doit être un nombre de 0 à 365' }
      valeur.delai_jours = n
      continue
    }
    valeur[champ] = txt(b[champ], LONGUEURS[champ] || 200)
  }

  if (!partiel || b.designation !== undefined) {
    if (!valeur.designation) return { ok: false, erreur: 'Une désignation est requise' }
  }
  // Une URL qui ne ressemble à rien est refusée plutôt que posée sur un bouton
  // qui n'irait nulle part.
  if (valeur.url_produit && !/^https?:\/\/\S+$/i.test(valeur.url_produit)) {
    return { ok: false, erreur: 'L\'URL produit doit commencer par http:// ou https://' }
  }
  if (b.archived !== undefined) valeur.archived = b.archived === true

  if (Object.keys(valeur).length === 0) return { ok: false, erreur: 'Rien à enregistrer' }
  return { ok: true, valeur }
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
    if (id !== null && descendantes(id, existantes).some(c => Number(c.id) === parent)) {
      return { ok: false, erreur: 'Une catégorie ne peut pas descendre d\'elle-même' }
    }
  }

  const valeur = { nom, parent_id: parent }
  if (brut?.couleur !== undefined) {
    const couleur = txt(brut.couleur, 7)
    if (couleur && !/^#[0-9A-Fa-f]{6}$/.test(couleur)) return { ok: false, erreur: 'Couleur attendue au format #RRGGBB' }
    // La couleur ne vit qu'au premier niveau ; une sous-catégorie hérite.
    valeur.couleur = parent === null ? (couleur || null) : null
  }
  if (brut?.archived !== undefined) valeur.archived = brut.archived === true
  return { ok: true, valeur }
}

// ── Rangement ──────────────────────────────────────────────────────────────

/** La catégorie d'un article, et sa racine — c'est la racine qui porte la couleur. */
export function categorieDe(article, categories = []) {
  const feuille = categories.find(c => Number(c.id) === Number(article?.categorie_id)) || null
  if (!feuille) return { feuille: null, racine: null }
  let racine = feuille
  const vus = new Set()
  while (racine?.parent_id && !vus.has(Number(racine.id))) {
    vus.add(Number(racine.id))
    const parent = categories.find(c => Number(c.id) === Number(racine.parent_id))
    if (!parent) break
    racine = parent
  }
  return { feuille, racine }
}

/** Gris neutre : un article sans catégorie s'imprime, il ne bloque pas. */
export const COULEUR_DEFAUT = '#D5D5D5'

export function couleurDe(article, categories = []) {
  return categorieDe(article, categories).racine?.couleur || COULEUR_DEFAUT
}

/**
 * L'arbre affichable : racines par ordre alphabétique, chacune avec ses
 * sous-catégories et le nombre d'articles — les siens ET ceux de ses
 * sous-catégories. Sans cette remontée, « Fixation » afficherait zéro alors
 * que les 46 vis sont rangées dans ses cinq filles.
 */
export function arbreEconomat(categories = [], articles = []) {
  const cats = Array.isArray(categories) ? categories : []
  const vivants = (articles || []).filter(a => !a.archived)
  const compte = id => {
    const voulues = new Set([Number(id), ...descendantes(id, cats).map(c => Number(c.id))])
    return vivants.filter(a => voulues.has(Number(a.categorie_id))).length
  }
  const parNom = (a, b) => String(a.nom).localeCompare(String(b.nom), 'fr')

  return cats
    .filter(c => !c.parent_id)
    .map(c => ({
      ...c,
      nb: compte(c.id),
      enfants: cats.filter(e => Number(e.parent_id) === Number(c.id))
        .map(e => ({ ...e, nb: compte(e.id), couleur: c.couleur }))
        .sort(parNom),
    }))
    .sort(parNom)
}

const sansAccent = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * Filtre et range les articles.
 *
 * La recherche porte aussi sur le nom des catégories et sur la RÉFÉRENCE —
 * c'est par elle qu'on identifie un produit (« la référence fournisseur fait
 * foi »), et c'est souvent tout ce qu'on a sous les yeux en tenant la boîte.
 * TOUS les mots sont exigés ; accents et casse ignorés.
 */
export function filtrerArticles(articles = [], {
  recherche = '', categorie = null, etat = null, fournisseur = null,
  emplacement = null, categories = [], fournisseurs = [], archives = false,
} = {}) {
  const mots = sansAccent(recherche).split(/\s+/).filter(Boolean)

  let voulues = null
  if (categorie) voulues = new Set([Number(categorie), ...descendantes(categorie, categories).map(c => Number(c.id))])

  return (articles || [])
    .filter(a => (archives ? true : !a.archived))
    .filter(a => (voulues ? voulues.has(Number(a.categorie_id)) : true))
    .filter(a => (etat ? a.etat === etat : true))
    .filter(a => (fournisseur ? Number(a.fournisseur_id) === Number(fournisseur) : true))
    .filter(a => (emplacement ? String(a.emplacement || '') === emplacement : true))
    .filter(a => {
      if (mots.length === 0) return true
      const { feuille, racine } = categorieDe(a, categories)
      const botte = sansAccent([
        a.code, a.designation, a.reference, a.emplacement, a.notes,
        nomFournisseur(a.fournisseur_id, fournisseurs),
        nomFournisseur(a.fournisseur_alt_id, fournisseurs),
        feuille?.nom, racine?.nom,
      ].filter(Boolean).join(' '))
      return mots.every(m => botte.includes(m))
    })
    .sort((a, b) => String(a.designation).localeCompare(String(b.designation), 'fr'))
}

/** Les compteurs des pastilles de filtre. Les archivés n'y entrent pas. */
export function compterEtats(articles = []) {
  const out = { tout: 0 }
  for (const e of ETAT_CLES) out[e] = 0
  for (const a of articles || []) {
    if (a.archived) continue
    out.tout += 1
    if (out[a.etat] !== undefined) out[a.etat] += 1
  }
  return out
}

/**
 * Les valeurs distinctes d'un champ TEXTE, pour les listes de filtre.
 *
 * Ne sert plus qu'à l'emplacement : le fournisseur vient de sa propre table,
 * justement pour ne plus dépendre de ce que quelqu'un a tapé. Le jour où
 * l'emplacement passe lui aussi en liste contrôlée, cette fonction disparaît.
 */
export function valeursDistinctes(articles = [], champ) {
  const vues = new Set()
  for (const a of articles || []) {
    if (a.archived) continue
    const v = String(a?.[champ] || '').trim()
    if (v) vues.add(v)
  }
  return [...vues].sort((a, b) => a.localeCompare(b, 'fr'))
}

/** Les fournisseurs à proposer en filtre : les actifs, plus ceux qu'un article
 *  utilise encore même archivés — sinon le filtre perdrait des articles. */
export function fournisseursUtiles(fournisseurs = [], articles = []) {
  const utilises = new Set((articles || []).filter(a => !a.archived).map(a => Number(a.fournisseur_id)))
  return (fournisseurs || [])
    .filter(f => !f.archived || utilises.has(Number(f.id)))
    .sort((a, b) => String(a.nom).localeCompare(String(b.nom), 'fr'))
}

/**
 * Un 🔵 qui traîne au-delà de son délai. Sans `delai_jours` renseigné, on ne
 * signale RIEN : « Le lendemain si avant: 17h » ne se compare pas à une date,
 * et inventer un délai par défaut ferait clignoter la moitié de l'écran.
 */
export function enRetard(article, maintenant = new Date()) {
  if (!article || article.etat !== 'commande') return false
  const jours = Number(article.delai_jours)
  if (!Number.isInteger(jours) || jours <= 0) return false
  const depuis = article.etat_le ? new Date(article.etat_le) : null
  if (!depuis || Number.isNaN(depuis.getTime())) return false
  return (maintenant - depuis) > jours * 86400000
}

// ── Cartes ─────────────────────────────────────────────────────────────────

/** Quatre cartes A6 par feuille A4 paysage. Une dernière feuille incomplète
 *  laisse des cases VIDES : on ne recompose pas une planche pour la remplir. */
export const CARTES_PAR_FEUILLE = 4

export function planches(articles = [], { depart = 0 } = {}) {
  const d = Math.max(0, Math.min(CARTES_PAR_FEUILLE - 1, Number(depart) || 0))
  const cases = [...Array(d).fill(null), ...articles]
  const out = []
  for (let i = 0; i < cases.length; i += CARTES_PAR_FEUILLE) {
    const feuille = cases.slice(i, i + CARTES_PAR_FEUILLE)
    while (feuille.length < CARTES_PAR_FEUILLE) feuille.push(null)
    out.push(feuille)
  }
  return out
}
