// Économat — le catalogue des consommables, derrière le Kanban physique.
//
// Le calcul vit ici et pas dans l'écran : Vitest ne transforme pas le JSX, et
// c'est justement le filtrage, le lien fournisseur et la mise en planches qui
// doivent être vérifiables.
//
// V2 (brief « Mase_Project_Economat_Brief_V2 », kDrive 00. Admin / Maze
// Project / kanban cards) : l'économat devient un suivi de stock SIMPLE.
//
//  1. LA COULEUR EST CALCULÉE (§6). Stock, cible et seuils sont des nombres de
//     PARTS entières — l'unité divisée par `decoupage` : 1 en quantité
//     entière, 3 pour un suivi en tiers, 4 en quarts. Personne ne saisit
//     0,33, et aucune comparaison ne passe par un flottant.
//  2. UN ARTICLE NON CONFIGURÉ VIT COMME EN V1 (§26). Les 77 articles repris
//     n'ont ni unité, ni cible, ni seuil : tant que leur bloc Stock est vide,
//     leur état manuel V1 reste la seule information, et rien ne les bloque.
//  3. LE BLOC STOCK EST TOUT OU RIEN. Un article est configuré — de quoi
//     calculer une couleur — ou il ne l'est pas du tout. La base le contraint
//     aussi (`economat_stock_chk`).

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

// ── Modèle V2 : types, suivi, approvisionnement ────────────────────────────

/** §3 — un article stocké a stock, seuils et carte ; une référence non. */
export const TYPES = [
  { cle: 'stocke',    libelle: 'Article stocké' },
  { cle: 'reference', libelle: 'Référence uniquement' },
]

/** §4.1 — les deux modes de suivi. */
export const SUIVIS = [
  { cle: 'entier', libelle: 'Quantité entière' },
  { cle: 'approx', libelle: 'Quantité approximative' },
]

/** §4.1 — les découpages d'une quantité approximative. Tiers et quarts sont
 *  ceux du brief ; les moitiés sont le « découpage simple » le plus évident. */
export const DECOUPAGES = [
  { n: 2, libelle: 'Moitiés' },
  { n: 3, libelle: 'Tiers' },
  { n: 4, libelle: 'Quarts' },
]

/** §8.1 */
export const MODES_APPRO = [
  { cle: 'en_ligne', libelle: 'En ligne' },
  { cle: 'magasin',  libelle: 'En magasin' },
]

/** §6–7 — la couleur d'un niveau de stock. Clé en base ou en calcul, jamais
 *  d'emoji ailleurs qu'à l'affichage. */
export const NIVEAUX = {
  vert:   { cle: 'vert',   emoji: '🟢', libelle: 'Stock OK' },
  orange: { cle: 'orange', emoji: '🟠', libelle: 'Stock bas' },
  rouge:  { cle: 'rouge',  emoji: '🔴', libelle: 'À réapprovisionner' },
}

/** Le bloc Stock est-il rempli ? Une référence n'a jamais de stock. */
const renseigne = v => v !== null && v !== undefined && v !== ''

export function estConfigure(article) {
  return !!article && article.type !== 'reference' && !!article.suivi
    && Number.isInteger(Number(article.decoupage)) && Number(article.decoupage) > 0
    && renseigne(article.cible) && renseigne(article.seuil_rouge) && renseigne(article.stock)
}

/**
 * La couleur du stock (§6). Au seuil ou en dessous, la couleur s'allume :
 * PLA cible 3, orange 2, rouge 1 → 3 vert, 2 orange, 1 et 0 rouge.
 * `null` pour un article non configuré ou une référence : on ne devine rien.
 */
export function niveau(article) {
  if (!estConfigure(article)) return null
  const stock = Number(article.stock)
  if (stock <= Number(article.seuil_rouge)) return 'rouge'
  if (renseigne(article.seuil_orange) && stock <= Number(article.seuil_orange)) return 'orange'
  return 'vert'
}

// ── Affichage des quantités ────────────────────────────────────────────────

const FRACTIONS = { '1/2': '½', '1/3': '⅓', '2/3': '⅔', '1/4': '¼', '3/4': '¾' }
const pgcd = (a, b) => (b ? pgcd(b, a % b) : a)

/** 4 parts en tiers → « 1 ⅓ » ; 2 parts en quarts → « ½ » ; 3 en entier → « 3 ». */
export function fraction(parts, decoupage = 1) {
  const p = Math.max(0, Math.round(Number(parts) || 0))
  const d = Math.max(1, Number(decoupage) || 1)
  const entier = Math.floor(p / d)
  const reste = p % d
  if (!reste) return String(entier)
  const g = pgcd(reste, d)
  const frac = FRACTIONS[`${reste / g}/${d / g}`] || `${reste / g}/${d / g}`
  return entier ? `${entier} ${frac}` : frac
}

/** L'unité accordée : singulier sous 2 (« 0 paquet », « 1 ⅔ boîte »), pluriel
 *  au-delà. En minuscules, comme dans une phrase. */
export function libelleUnite(unite, parts = 1, decoupage = 1) {
  if (!unite) return ''
  const quantite = Number(parts) / Math.max(1, Number(decoupage) || 1)
  return String(quantite >= 2 ? unite.pluriel || unite.nom : unite.nom).toLowerCase()
}

/** L'unité d'un identifiant, d'après la liste administrable. */
export const uniteDe = (id, unites = []) => (unites || []).find(u => Number(u.id) === Number(id)) || null

/**
 * Une quantité de stock, telle qu'elle s'imprime et s'affiche (§23.7) :
 * « 3 bobines », « 0 paquet », « 1 boîte », « ⅓ boîte » — et « Vide » pour
 * une quantité approximative à zéro.
 */
export function formatQuantite(parts, article, unites = []) {
  if (parts === null || parts === undefined || parts === '') return ''
  const d = Number(article?.decoupage) || 1
  const unite = uniteDe(article?.unite_stock_id, unites)
  if (article?.suivi === 'approx' && Number(parts) === 0) return 'Vide'
  return [fraction(parts, d), libelleUnite(unite, parts, d)].filter(Boolean).join(' ')
}

/** La quantité habituelle à commander, dans l'unité de COMMANDE (§23.8) :
 *  « 1000 pièces », jamais « 1 boîte (1000 pièces) ». */
export function formatCommande(article, unites = []) {
  const n = Number(article?.quantite_cmd)
  if (!Number.isInteger(n) || n <= 0) return ''
  const unite = uniteDe(article?.unite_cmd_id, unites)
  return [String(n), libelleUnite(unite, n)].filter(Boolean).join(' ')
}

/**
 * Les valeurs proposées pour un seuil, de 0 jusque sous la cible : la fiche
 * présente des CHOIX (« ⅓ boîte », « Vide »), jamais un nombre à saisir.
 */
export function choixQuantites(article, unites = [], { jusqua } = {}) {
  const d = Number(article?.decoupage) || 1
  const max = jusqua === undefined ? Number(article?.cible) || 0 : jusqua
  const out = []
  for (let p = 0; p <= max; p++) out.push({ parts: p, libelle: formatQuantite(p, article, unites) })
  return out
}

/**
 * Le stock après une modification de la configuration (§4.2). Une première
 * configuration le pose à la cible. Un changement de découpage le ré-échelonne
 * (⅔ en tiers devient ¾… arrondi à la part la plus proche) : c'est la même
 * boîte, pas une boîte remplie.
 */
export function stockApres(avant = {}, apres = {}) {
  if (!apres.suivi) return null
  const dAvant = Number(avant.decoupage) || null
  const dApres = Number(apres.decoupage) || 1
  const stockAvant = avant.stock === null || avant.stock === undefined ? null : Number(avant.stock)
  if (!avant.suivi || stockAvant === null || !dAvant) return Number(apres.cible)
  if (dAvant === dApres) return stockAvant
  return Math.round(stockAvant * dApres / dAvant)
}

/**
 * Ce qui manque à un article pour être complet (§2.1, §4.2). Une liste vide
 * veut dire complet. Pendant la migration (§26), un article incomplet existe
 * et fonctionne : cette liste sert à le repérer, pas à le bloquer.
 */
export function manquants(article) {
  if (!article) return []
  const out = []
  if (!String(article.designation || '').trim()) out.push('désignation')
  if (!article.categorie_id) out.push('catégorie')
  if (article.type !== 'reference') {
    if (!article.emplacement_id) out.push('emplacement')
    if (!estConfigure(article)) out.push('stock et seuils')
  }
  return out
}

// ── Étape 2 : gestes, prise en charge, historique ──────────────────────────

/**
 * L'état V1 que la base RECALCULE pour un article configuré
 * (`economat_etat_calcule` dans schema-economat-v2.sql). Même règle que
 * `niveau()`, plus la prise en charge qui passe devant : un article 🔴 pris en
 * charge est 🔵 (§21).
 */
export function etatCalcule(article) {
  if (!estConfigure(article)) return null
  if (article.reappro_le) return 'commande'
  return { vert: 'ok', orange: 'bas', rouge: 'commander' }[niveau(article)]
}

/**
 * Les niveaux proposés au QR pour une quantité approximative (§13), du plein
 * au vide : « Pleine | ⅔ | ⅓ | Vide » pour une boîte en tiers, « Plein » pour
 * un paquet — le genre vient de l'unité.
 */
export function niveauxApprox(article, unites = []) {
  if (article?.suivi !== 'approx') return []
  const d = Number(article.decoupage) || 1
  const cible = Number(article.cible) || d
  const unite = uniteDe(article.unite_stock_id, unites)
  const plein = unite?.feminin ? 'Pleine' : 'Plein'
  const out = []
  for (let p = cible; p >= 0; p--) {
    out.push({ parts: p, libelle: p === cible ? plein : p === 0 ? 'Vide' : fraction(p, d) })
  }
  return out
}

/** Un niveau tel que le QR le nomme : « Pleine », « ⅔ », « Vide » ; et pour une
 *  quantité entière, le nombre seul (« 3 »). */
export function libelleNiveau(parts, article, unites = []) {
  if (article?.suivi === 'approx') {
    const n = niveauxApprox(article, unites).find(x => x.parts === Number(parts))
    if (n) return n.libelle
  }
  return fraction(parts, article?.decoupage)
}

/** « ✓ Stock passé de 3 à 2 » (§12). */
export function messageGeste(avant, apres, article, unites = []) {
  return `Stock passé de ${libelleNiveau(avant, article, unites)} à ${libelleNiveau(apres, article, unites)}`
}

const FMT_JOUR = new Intl.DateTimeFormat('fr-CH', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Zurich' })
const FMT_HEURE = new Intl.DateTimeFormat('fr-CH', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Zurich' })

/** « 28.09 à 08:12 », à l'heure de l'atelier quel que soit le serveur. */
export function quand(iso) {
  const d = iso ? new Date(iso) : null
  if (!d || Number.isNaN(d.getTime())) return ''
  return `${FMT_JOUR.format(d)} à ${FMT_HEURE.format(d)}`
}

/** « Pris en charge par Arnaud · 28.09 à 08:12 » (§17), ou '' s'il n'y en a pas. */
export function libellePriseEnCharge(article) {
  if (!article?.reappro_le) return ''
  return `Pris en charge par ${article.reappro_par || 'quelqu’un'} · ${quand(article.reappro_le)}`
}

/**
 * Ce qu'il faut faire pour réapprovisionner (§18) : en ligne, un lien
 * « Commander chez OPO » — qui ne vaut JAMAIS prise en charge ; en magasin,
 * « À acheter chez Ruco », avec la note d'approvisionnement.
 */
export function actionAppro(article, fournisseurs = []) {
  const chezQui = nomFournisseur(article?.fournisseur_id, fournisseurs)
  const note = String(article?.note_appro || '').trim()
  if (article?.mode_appro === 'magasin') {
    return { magasin: true, libelle: chezQui ? `À acheter chez ${chezQui}` : 'À acheter en magasin', lien: '', note }
  }
  const lien = lienCommande(article, fournisseurs)
  return { magasin: false, libelle: `Commander chez ${chezQui || 'le fournisseur'}`, lien, note }
}

/** Les gestes d'historique, tels qu'on les lit (§20). */
const LIBELLES_MOUVEMENT = {
  mouvement: 'Stock', niveau: 'Niveau constaté', ajustement: 'Ajustement', correction: 'Correction',
  reappro: 'Réapprovisionné au stock cible', prise_en_charge: 'Pris en charge',
  fin_prise_en_charge: 'Prise en charge annulée', annulation: 'Geste annulé',
}

export function libelleMouvement(m, article, unites = []) {
  const titre = LIBELLES_MOUVEMENT[m?.type] || String(m?.type || '')
  if (['prise_en_charge', 'fin_prise_en_charge'].includes(m?.type)) return titre
  // Le découpage du MOMENT, recopié dans la ligne : une boîte suivie en tiers
  // l'an dernier ne doit pas se relire en quarts.
  const a = { ...article, decoupage: m?.decoupage ?? article?.decoupage }
  const de = libelleNiveau(m?.avant, a, unites)
  const vers = libelleNiveau(m?.apres, a, unites)
  return `${titre} · ${de} → ${vers}`
}

/** Les gestes qu'une requête peut demander, et ce que chacun attend. */
export const GESTES_STOCK = ['mouvement', 'niveau', 'ajustement', 'correction', 'reappro']

/** Valide un geste de stock avant de l'envoyer à la base. */
export function validerGeste(brut) {
  const type = String(brut?.type || '')
  if (!GESTES_STOCK.includes(type)) return { ok: false, erreur: 'Geste inconnu' }
  const entier = v => (v === '' || v === null || v === undefined ? null : Number(v))
  const delta = entier(brut?.delta)
  const valeur = entier(brut?.valeur)
  if (['mouvement', 'ajustement'].includes(type)) {
    if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 100000) return { ok: false, erreur: 'Quantité invalide' }
    return { ok: true, valeur: { type, delta, valeur: null } }
  }
  if (['niveau', 'correction'].includes(type)) {
    if (!Number.isInteger(valeur) || valeur < 0 || valeur > 100000) return { ok: false, erreur: 'Niveau invalide' }
    return { ok: true, valeur: { type, delta: null, valeur } }
  }
  return { ok: true, valeur: { type, delta: null, valeur: null } }
}

/** Ce que la base répond quand elle refuse un geste, dit à l'utilisateur. */
export function messageRefus(r) {
  switch (r?.raison) {
    case 'non_configure': return 'Le stock de cet article n’est pas encore configuré.'
    case 'inchange': return 'Le stock est déjà à ce niveau.'
    case 'deja_pris': return `Déjà pris en charge par ${r.par || 'quelqu’un'}${r.le ? ` · ${quand(r.le)}` : ''}.`
    case 'pas_de_prise': return 'Aucune prise en charge en cours.'
    case 'deja_annule': return 'Ce geste a déjà été annulé.'
    case 'trop_tard': return 'Trop tard pour annuler : corrige le stock depuis la fiche.'
    case 'stock_change': return 'Le stock a bougé depuis : corrige-le depuis la fiche.'
    case 'non_annulable': return 'Ce geste ne s’annule pas ainsi.'
    case 'valeur_invalide': return 'Quantité invalide.'
    default: return 'Geste refusé.'
  }
}

// ── Validation ─────────────────────────────────────────────────────────────

/** Les champs qu'une requête a le droit d'écrire. Jamais `{ ...req.body }`. */
const CHAMPS = [
  'type', 'designation', 'sous_titre', 'photo_path', 'categorie_id', 'emplacement_id',
  'fournisseur_id', 'fournisseur_alt_id', 'reference', 'url_produit',
  'mode_appro', 'quantite_cmd', 'unite_cmd_id', 'delai_id', 'note_appro', 'notes',
]
// Les clés étrangères se valident pareil : vide → NULL, sinon un entier.
const CLES = {
  categorie_id: 'Catégorie inconnue',
  emplacement_id: 'Emplacement inconnu',
  fournisseur_id: 'Fournisseur inconnu',
  fournisseur_alt_id: 'Fournisseur inconnu',
  unite_cmd_id: 'Unité de commande inconnue',
  delai_id: 'Délai inconnu',
}
// Le bloc Stock se valide à part, en entier (`validerStock`). `code`, `jeton`,
// `etat` et `etat_le` n'y sont PAS : le code et le jeton sont posés par la
// base et définitifs, l'état V1 passe par sa propre route parce qu'il écrit
// aussi le journal des commandes. Les anciennes colonnes texte (`unite`,
// `seuil_bas`, `delai`…) ne sont plus écrites : elles restent en base comme
// aide à la reprise (§26).
const CHAMPS_STOCK = ['suivi', 'unite_stock_id', 'decoupage', 'cible', 'seuil_orange', 'seuil_rouge']

const txt = (v, max = 400) => (v === null || v === undefined ? '' : String(v).trim().slice(0, max))
const vide = v => v === '' || v === null || v === undefined

const LONGUEURS = { notes: 4000, note_appro: 1000, designation: 200, sous_titre: 200, url_produit: 600, photo_path: 300 }

/**
 * Valide les champs d'identification et d'approvisionnement. Le bloc Stock
 * est validé par `validerStock`, sur l'article FUSIONNÉ — un seuil n'a de sens
 * que rapporté à la cible et au découpage, qui peuvent ne pas être envoyés.
 *
 * `creation` applique les obligations du brief (§2.1) : catégorie, et pour un
 * article stocké, emplacement. En modification on les tolère absentes — les
 * articles repris de V1 doivent pouvoir être corrigés un champ à la fois.
 */
export function validerArticle(brut, { partiel = false, creation = false } = {}) {
  const b = brut || {}
  const valeur = {}

  for (const champ of CHAMPS) {
    if (partiel && b[champ] === undefined) continue
    if (CLES[champ]) {
      const n = vide(b[champ]) ? null : Number(b[champ])
      if (n !== null && !Number.isInteger(n)) return { ok: false, erreur: CLES[champ] }
      valeur[champ] = n
      continue
    }
    if (champ === 'type') {
      const t = vide(b.type) ? 'stocke' : String(b.type)
      if (!TYPES.some(x => x.cle === t)) return { ok: false, erreur: 'Type d\'article inconnu' }
      valeur.type = t
      continue
    }
    if (champ === 'mode_appro') {
      if (vide(b.mode_appro)) { valeur.mode_appro = null; continue }
      if (!MODES_APPRO.some(m => m.cle === b.mode_appro)) return { ok: false, erreur: 'Mode d\'approvisionnement inconnu' }
      valeur.mode_appro = b.mode_appro
      continue
    }
    if (champ === 'quantite_cmd') {
      if (vide(b.quantite_cmd)) { valeur.quantite_cmd = null; continue }
      const n = Number(b.quantite_cmd)
      if (!Number.isInteger(n) || n < 1 || n > 1000000) return { ok: false, erreur: 'La quantité habituelle doit être un nombre entier positif' }
      valeur.quantite_cmd = n
      continue
    }
    valeur[champ] = txt(b[champ], LONGUEURS[champ] || 200)
  }

  if (!partiel || b.designation !== undefined) {
    if (!valeur.designation) return { ok: false, erreur: 'Une désignation est requise' }
  }
  if (creation) {
    if (!valeur.categorie_id) return { ok: false, erreur: 'Une catégorie est requise' }
    if (valeur.type !== 'reference' && !valeur.emplacement_id) {
      return { ok: false, erreur: 'Un emplacement est requis pour un article stocké' }
    }
  }
  // Une URL qui ne ressemble à rien est refusée plutôt que posée sur un bouton
  // qui n'irait nulle part.
  if (valeur.url_produit && !/^https?:\/\/\S+$/i.test(valeur.url_produit)) {
    return { ok: false, erreur: 'L\'URL produit doit commencer par http:// ou https://' }
  }
  // Une quantité sans unité ne s'imprime pas (« 1000 » quoi ?) : les deux vont
  // ensemble, ou aucun.
  // En modification partielle, on ne juge que si les deux sont envoyés.
  const juger = !partiel || (b.quantite_cmd !== undefined && b.unite_cmd_id !== undefined)
  if (juger && vide(valeur.quantite_cmd) !== vide(valeur.unite_cmd_id)) {
    return { ok: false, erreur: 'La quantité habituelle et son unité vont ensemble' }
  }
  if (b.archived !== undefined) valeur.archived = b.archived === true

  if (Object.keys(valeur).length === 0) return { ok: false, erreur: 'Rien à enregistrer' }
  return { ok: true, valeur }
}

/** Le bloc Stock a-t-il été envoyé, même en partie ? */
export const toucheStock = brut => CHAMPS_STOCK.some(k => brut?.[k] !== undefined)

/**
 * Valide le bloc Stock de l'article FUSIONNÉ (existant + envoi) et renvoie
 * les colonnes à écrire, stock compris (§4.2).
 *
 * Tout ou rien : un suivi vide efface le bloc ; un suivi posé exige unité,
 * cible et seuil rouge. Les quantités arrivent en PARTS, comme la fiche les
 * propose. Une référence n'a pas de stock (§3.2) : son bloc est effacé.
 *
 * `avant` est l'article tel qu'il est en base (vide à la création) : il sert
 * à poser le stock à la cible la première fois, et à le ré-échelonner si le
 * découpage change.
 */
export function validerStock(fusion, avant = {}) {
  const f = fusion || {}
  const efface = { suivi: null, unite_stock_id: null, decoupage: null, cible: null, seuil_orange: null, seuil_rouge: null, stock: null }
  if (f.type === 'reference' || vide(f.suivi)) return { ok: true, valeur: efface }

  if (!SUIVIS.some(s => s.cle === f.suivi)) return { ok: false, erreur: 'Mode de suivi inconnu' }
  const decoupage = f.suivi === 'entier' ? 1 : Number(f.decoupage)
  if (f.suivi === 'approx' && !DECOUPAGES.some(d => d.n === decoupage)) {
    return { ok: false, erreur: 'Choisis un découpage : moitiés, tiers ou quarts' }
  }
  const unite = vide(f.unite_stock_id) ? null : Number(f.unite_stock_id)
  if (!Number.isInteger(unite)) return { ok: false, erreur: 'Choisis l\'unité de stock' }

  const entier = (v, nom) => {
    if (vide(v)) return { absent: true }
    const n = Number(v)
    if (!Number.isInteger(n) || n < 0 || n > 100000) return { erreur: `${nom} invalide` }
    return { n }
  }
  // Une quantité approximative suit UN SEUL contenant (décision du 5 octobre
  // 2026) : la vue rapide propose alors simplement Pleine | ⅔ | ⅓ | Vide.
  // Deux boîtes se suivent en quantité entière. La cible vaut donc une boîte
  // pleine, posée ici plutôt que demandée.
  const cible = f.suivi === 'approx' ? { n: decoupage } : entier(f.cible, 'Stock cible')
  const rouge = entier(f.seuil_rouge, 'Seuil rouge')
  const orange = entier(f.seuil_orange, 'Seuil orange')
  for (const x of [cible, rouge, orange]) if (x.erreur) return { ok: false, erreur: x.erreur }
  if (cible.absent || cible.n === 0) return { ok: false, erreur: 'Le stock cible est requis' }
  if (rouge.absent) return { ok: false, erreur: 'Le seuil « À réapprovisionner » est requis' }
  // §6 : « Mase doit empêcher une configuration incohérente où le seuil orange
  // serait inférieur au seuil rouge ». Égal non plus : il ne s'allumerait jamais.
  if (!orange.absent && orange.n <= rouge.n) {
    return { ok: false, erreur: 'Le seuil orange doit être au-dessus du seuil rouge' }
  }
  const plusHaut = orange.absent ? rouge.n : orange.n
  if (cible.n <= plusHaut) return { ok: false, erreur: 'Le stock cible doit être au-dessus des seuils' }

  const valeur = {
    suivi: f.suivi, unite_stock_id: unite, decoupage,
    cible: cible.n, seuil_rouge: rouge.n, seuil_orange: orange.absent ? null : orange.n,
  }
  valeur.stock = stockApres(avant, valeur)
  return { ok: true, valeur }
}

/**
 * La correction manuelle du stock (§4.2 : erreur ou inventaire). En parts,
 * entier, positif ; il peut dépasser la cible — un achat exceptionnel (§14).
 */
export function validerCorrection(v, article) {
  if (!estConfigure(article)) return { ok: false, erreur: 'Configure d\'abord le stock de l\'article' }
  const n = Number(v)
  if (vide(v) || !Number.isInteger(n) || n < 0 || n > 100000) return { ok: false, erreur: 'Stock invalide' }
  return { ok: true, valeur: n }
}

/** Valide une entrée d'une liste administrable (§5, §9, §10, §2.1). */
export function validerEntreeListe(liste, brut, { partiel = false } = {}) {
  const b = brut || {}
  const valeur = {}
  const champNom = liste === 'delais' ? 'libelle' : 'nom'
  if (!partiel || b[champNom] !== undefined) {
    const nom = txt(b[champNom], 120)
    if (!nom) return { ok: false, erreur: 'Un nom est requis' }
    valeur[champNom] = nom
  }
  if (liste === 'unites') {
    if (!partiel || b.pluriel !== undefined) {
      valeur.pluriel = txt(b.pluriel, 120) || valeur.nom || ''
      if (!valeur.pluriel) return { ok: false, erreur: 'Un pluriel est requis' }
    }
    if (b.feminin !== undefined) valeur.feminin = b.feminin === true
  }
  if (liste === 'delais' && b.jours_ouvrables !== undefined) {
    if (vide(b.jours_ouvrables)) valeur.jours_ouvrables = null
    else {
      const n = Number(b.jours_ouvrables)
      if (!Number.isInteger(n) || n < 0 || n > 365) return { ok: false, erreur: 'Jours ouvrables : un nombre de 0 à 365' }
      valeur.jours_ouvrables = n
    }
  }
  if (liste === 'delais' && b.ordre !== undefined) {
    const n = Number(b.ordre)
    valeur.ordre = Number.isInteger(n) ? n : 0
  }
  if (b.archived !== undefined) valeur.archived = b.archived === true
  if (Object.keys(valeur).length === 0) return { ok: false, erreur: 'Rien à enregistrer' }
  return { ok: true, valeur }
}

/** Les listes administrables, et la table de chacune. Une liste blanche :
 *  le nom de table ne vient jamais du navigateur tel quel. */
export const LISTES = {
  unites:       { table: 'economat_unites',       champs: 'id, nom, pluriel, feminin, archived', tri: 'nom' },
  delais:       { table: 'economat_delais',       champs: 'id, libelle, jours_ouvrables, ordre, archived', tri: 'ordre' },
  emplacements: { table: 'economat_emplacements', champs: 'id, nom, archived', tri: 'nom' },
}

/** Les entrées à proposer dans une liste déroulante : les actives, plus
 *  l'éventuelle archivée que l'article porte encore — sinon elle disparaîtrait
 *  de sa propre fiche. */
export function entreesUtiles(entrees = [], garder = null) {
  return (entrees || []).filter(e => !e.archived || Number(e.id) === Number(garder))
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
  emplacement = null, categories = [], fournisseurs = [], emplacements = [],
  archives = false, aCompleter = false, type = null,
} = {}) {
  const mots = sansAccent(recherche).split(/\s+/).filter(Boolean)

  let voulues = null
  if (categorie) voulues = new Set([Number(categorie), ...descendantes(categorie, categories).map(c => Number(c.id))])

  return (articles || [])
    .filter(a => (archives ? true : !a.archived))
    .filter(a => (voulues ? voulues.has(Number(a.categorie_id)) : true))
    .filter(a => (etat ? a.etat === etat : true))
    .filter(a => (fournisseur ? Number(a.fournisseur_id) === Number(fournisseur) : true))
    .filter(a => (emplacement ? Number(a.emplacement_id) === Number(emplacement) : true))
    .filter(a => (type ? (a.type || 'stocke') === type : true))
    .filter(a => (aCompleter ? manquants(a).length > 0 : true))
    .filter(a => {
      if (mots.length === 0) return true
      const { feuille, racine } = categorieDe(a, categories)
      const botte = sansAccent([
        a.code, a.designation, a.sous_titre, a.reference, a.notes,
        nomEntree(a.emplacement_id, emplacements),
        nomFournisseur(a.fournisseur_id, fournisseurs),
        nomFournisseur(a.fournisseur_alt_id, fournisseurs),
        feuille?.nom, racine?.nom,
      ].filter(Boolean).join(' '))
      return mots.every(m => botte.includes(m))
    })
    .sort((a, b) => String(a.designation).localeCompare(String(b.designation), 'fr'))
}

/** Le nom d'une entrée de liste (emplacement, délai) d'après son id. */
export function nomEntree(id, entrees = []) {
  const e = (entrees || []).find(x => Number(x.id) === Number(id))
  return e ? (e.nom ?? e.libelle ?? '') : ''
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
