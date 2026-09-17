// Amorçage d'une présentation client à partir de ce que Maze sait déjà.
//
// Le but est qu'on ne resaisisse RIEN de ce qui existe : le client, le numéro
// d'offre, la date de livraison et le budget sont dans la base. Ce qui reste à
// écrire, c'est ce que la base ignore — le brief, l'intention, les partis pris.
//
// Le budget de la présentation n'est pas l'offre : c'est son RÉSUMÉ. Le client
// a le détail poste par poste dans le PDF de l'offre ; ici il lit quatre ou
// cinq lignes. Les montants, eux, viennent des mêmes fonctions que l'offre
// (lib/quoteLines.js) — un récapitulatif qui ne retombe pas sur l'offre
// jointe est pire que pas de récapitulatif du tout.
import { gabaritDeck } from './deckGabarit.js'
import { normaliserDevis, totauxDevis, totalItem, estMasquee } from './quoteLines.js'

export const TVA_DEFAUT = 8.1

const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n }
const bas = s => String(s ?? '').trim().toLowerCase()

/** « 2026-12-17 » → « 17.12.2026 ». Vide si la date manque. */
export function jourCourt(d) {
  const s = String(d || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return ''
  const [a, m, j] = s.split('-')
  return `${j}.${m}.${a}`
}

/**
 * Le budget de l'offre, résumé en postes.
 *
 * Une ligne par pièce fabriquée — ce sont les noms que le client reconnaît —
 * puis gestion, sous-traitance et logistique regroupées. Un poste à zéro ne
 * s'imprime pas : une ligne « sous-traitance 0.00 » invite à demander pourquoi
 * elle est là.
 */
export function budgetDepuisDevis(project = {}) {
  const brut = project.quote_data || {}
  const q = normaliserDevis(brut)
  const gm = q.general_margin ?? ''
  const t = totauxDevis(brut)

  const lignes = []
  for (const item of q.items) {
    if (estMasquee(item)) continue
    const montant = totalItem(item, gm)
    if (!montant) continue
    lignes.push({ libelle: bas(item.name) || 'fabrication', montant })
  }
  if (t.gestion) lignes.push({ libelle: 'gestion de projet', montant: t.gestion })
  if (t.soustraitance) lignes.push({ libelle: 'sous-traitance', montant: t.soustraitance })
  if (t.logistique) lignes.push({ libelle: 'livraison, montage et transport', montant: t.logistique })

  const taux = brut.vat_rate != null && brut.vat_rate !== '' ? num(brut.vat_rate) : TVA_DEFAUT
  return {
    surtitre: 'budget',
    titre: 'récapitulatif de l\'offre',
    numero: brut.number ? `offre ${brut.number}` : '',
    livraison: project.deadline ? `livraison ${jourCourt(project.deadline)}` : '',
    lignes,
    sousTotal: t.total,
    // Le point, comme les montants du même tableau : « tva 8,1 % » au-dessus de
    // « 378.35 » fait deux conventions décimales sur la même page.
    libelleTva: `tva ${taux} %`,
    tva: Math.round(t.total * taux) / 100,
    total: Math.round(t.total * (100 + taux)) / 100,
    note: 'détail poste par poste dans l\'offre jointe.',
  }
}

/**
 * Une présentation neuve : le gabarit, avec ce que le projet sait déjà rempli.
 *
 * Les champs que la base ne connaît pas restent `[entre crochets]` — c'est ce
 * qui permet à l'écran de relecture, et au modèle de langue, de voir d'un coup
 * d'œil ce qui manque encore.
 */
export function amorcerPresentation(project = {}, { pieces = 2, aujourdhui = '' } = {}) {
  const deck = gabaritDeck({ pieces })
  const client = bas(project.client)
  const budget = budgetDepuisDevis(project)

  deck.couverture = {
    ...deck.couverture,
    titre: client ? `${client} × [lieu]` : deck.couverture.titre,
    sousTitre: bas(project.name) || deck.couverture.sousTitre,
    numero: budget.numero || deck.couverture.numero,
    date: jourCourt(aujourdhui) || deck.couverture.date,
  }
  // Un budget sans ligne laisse le gabarit en place : mieux vaut un trou
  // visible qu'un récapitulatif vide qui a l'air fini.
  if (budget.lignes.length > 0) deck.budget = budget
  if (project.deadline) {
    deck.planning.etapes[3] = { date: jourCourt(project.deadline), texte: 'livraison et montage' }
  }
  return deck
}

/** Titre par défaut d'une présentation, pour la liste et le nom du PDF. */
export function titrePresentation(project = {}) {
  return [project.numero, project.client, project.name].filter(Boolean).join(' · ')
}

/**
 * Ce qu'une requête a le droit de modifier.
 *
 * Jamais `{ ...req.body }` : `project_id`, `kdrive_id` et `envoyee_le` sont
 * posés par les routes qui en répondent, pas par l'écran.
 */
export function validerMajPresentation(body = {}) {
  const maj = {}
  if (body.titre !== undefined) {
    const t = String(body.titre || '').trim()
    if (!t) return { error: 'Titre vide' }
    maj.titre = t.slice(0, 200)
  }
  if (body.contenu !== undefined) {
    if (!body.contenu || typeof body.contenu !== 'object' || Array.isArray(body.contenu)) {
      return { error: 'Contenu invalide' }
    }
    maj.contenu = body.contenu
  }
  if (Object.keys(maj).length === 0) return { error: 'Rien à modifier' }
  maj.updated_at = new Date().toISOString()
  return { maj }
}

// ── Emplacements d'image ─────────────────────────────────────────────────────
//
// Un visuel n'est pas stocké dans la présentation : il part sur kDrive, dans le
// dossier du projet, et le deck n'en garde que l'identifiant. Le chemin
// (« pieces.0.images.1 ») désigne l'emplacement dans le JSON. Il vient du
// navigateur : il est donc traité comme une donnée hostile jusqu'à preuve du
// contraire — chaque segment est vérifié, et `__proto__` n'est pas un segment.

const SEGMENT = /^(?:[a-zA-Z]+|\d{1,2})$/
const INTERDITS = new Set(['__proto__', 'constructor', 'prototype'])

/** L'objet désigné par `chemin`, s'il existe et s'il est bien un emplacement. */
export function emplacementImage(deck, chemin) {
  const segments = String(chemin || '').split('.')
  if (segments.length === 0 || segments.length > 6) return null
  let courant = deck
  for (const s of segments) {
    if (!SEGMENT.test(s) || INTERDITS.has(s)) return null
    if (courant === null || typeof courant !== 'object') return null
    if (!Object.prototype.hasOwnProperty.call(courant, s)) return null
    courant = courant[s]
  }
  // Un emplacement est un objet — jamais un texte, jamais un montant.
  if (!courant || typeof courant !== 'object' || Array.isArray(courant)) return null
  return courant
}

/** Pose un fichier kDrive dans un emplacement. Renvoie false si le chemin ment. */
export function poserImage(deck, chemin, fichier) {
  const cible = emplacementImage(deck, chemin)
  if (!cible) return false
  cible.kdrive_id = fichier.kdrive_id
  cible.kdrive_nom = fichier.kdrive_nom
  cible.mime = fichier.mime
  return true
}

/** Tous les emplacements portant un fichier, avec leur chemin. */
export function imagesDuDeck(deck, prefixe = '') {
  const out = []
  const visiter = (noeud, chemin) => {
    if (!noeud || typeof noeud !== 'object') return
    if (Array.isArray(noeud)) return noeud.forEach((el, i) => visiter(el, `${chemin}${chemin ? '.' : ''}${i}`))
    if (noeud.kdrive_id) out.push({ chemin, ...noeud })
    for (const [k, v] of Object.entries(noeud)) visiter(v, `${chemin}${chemin ? '.' : ''}${k}`)
  }
  visiter(deck, prefixe)
  return out
}

/**
 * Remplace chaque identifiant kDrive par l'image elle-même, en data-URI.
 *
 * Chromium n'a ni jeton kDrive ni accès réseau au dossier : une image qu'il ne
 * peut pas charger ne produit aucune erreur, juste un cadre vide dans le PDF.
 * Elles voyagent donc DANS le document. `telecharger` est injecté pour que la
 * fonction se teste sans réseau.
 */
export async function hydraterImages(deck, telecharger) {
  const copie = JSON.parse(JSON.stringify(deck))
  for (const { chemin } of imagesDuDeck(copie)) {
    const cible = emplacementImage(copie, chemin)
    try {
      const { base64, mime } = await telecharger(cible.kdrive_id)
      if (base64) cible.src = `data:${mime || cible.mime || 'image/jpeg'};base64,${base64}`
    } catch {
      // Image illisible : le cadre reste marqué « en attente » plutôt que de
      // faire échouer tout le document pour un visuel.
    }
  }
  return copie
}
