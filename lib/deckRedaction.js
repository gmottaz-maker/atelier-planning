// Génération d'une présentation client par Claude, à partir de ce qu'on lui
// raconte et des fichiers déposés.
//
// On ne remplit pas un formulaire : on décrit le projet comme on le dirait au
// téléphone — les pièces, le lieu, les dates, ce à quoi il faut faire attention
// — on dépose les visuels nommés (« vitrine_3d.png », « vitrine_ia.png »,
// « stand_3d.png »…) et le modèle en fait la présentation complète. Le nombre
// de pièces vient de CE QU'IL COMPREND, pas d'un réglage : une vitrine montrée
// sous trois angles ou douze éléments de stand donnent des présentations
// différentes, et c'est normal.
//
// Ce que le modèle compose : la structure et les textes. Ce qu'il ne décide
// PAS, et que `validerSortie` impose après coup :
//   — les montants, qui viennent de l'offre et ne sont jamais relus par lui ;
//   — les fichiers, qu'il désigne par leur NOM et que le serveur seul résout en
//     identifiants kDrive — un nom inconnu laisse le cadre vide, visiblement ;
//   — les deux conditions fixes de la maison ;
//   — les longueurs de liste, bornées par ce que chaque page sait afficher.
//
// C'est cette frontière qui remplace la relecture champ par champ : on lit le
// PDF, et on demande une correction en une phrase.
import { fetchTimeout, DELAI_IA } from './fetchTimeout.js'
import { ErreurClaude } from './scanErreur.js'
import { MODELE_PRECIS } from './modelesClaude.js'
import { CONDITIONS_FIXES, METHODE } from './deckGabarit.js'
import { PIECES_MAX } from './deck.js'

export const MODELE_REDACTION = MODELE_PRECIS

// Les emoji sont proscrits par la charte, et un modèle en glisse tôt ou tard.
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu

const txt = (v, max = 900) => (typeof v === 'string' ? v.replace(EMOJI, '').replace(/\s+/g, ' ').trim().slice(0, max) : '')
const liste = (v, max) => (Array.isArray(v) ? v.slice(0, max) : [])
const objet = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})

/** Rapproche un nom de fichier annoncé par le modèle des fichiers déposés. */
export function resoudreFichier(nom, fichiers = []) {
  const cible = txt(nom, 200).toLowerCase().trim()
  if (!cible) return null
  const clef = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
  return fichiers.find(f => String(f.nom).toLowerCase() === cible)
      || fichiers.find(f => clef(f.nom) === clef(cible))
      // Le modèle cite parfois le nom sans son extension.
      || fichiers.find(f => clef(f.nom).startsWith(clef(cible)) && clef(cible).length > 3)
      || null
}

/** Un emplacement de visuel : le fichier s'il est reconnu, le trou sinon. */
function emplacement(brut, fichiers) {
  const source = objet(brut)
  // `fichier` est ce que le modèle écrit. `attente` est le nom conservé d'un
  // tour précédent : sans ce repli, une CORRECTION viderait tous les cadres,
  // parce que le document qu'on lui remontre ne parle plus de noms de fichiers.
  const f = resoudreFichier(source.fichier || source.attente || source.kdrive_nom, fichiers)
  const legende = txt(source.legende, 120)
  if (!f) return { attente: txt(source.fichier, 60) || 'visuel', legende }
  return { kdrive_id: f.kdrive_id, kdrive_nom: f.nom, mime: f.mime, attente: f.nom, legende }
}

/**
 * Le deck que le modèle propose, ramené à ce que les pages savent afficher.
 *
 * Tout ce qui n'est pas prévu ici est jeté : une clé inventée, une liste de
 * quinze atouts, un montant réécrit. Le document rendu ne dépend donc jamais de
 * la bonne volonté du modèle.
 */
export function validerSortie(brut, { fichiers = [], budget = null, contact = '' } = {}) {
  const s = objet(brut)
  const deck = { langue: 'fr' }

  const c = objet(s.couverture)
  deck.couverture = {
    surtitre: txt(c.surtitre, 90), titre: txt(c.titre, 80), sousTitre: txt(c.sousTitre, 160),
    lieu: txt(c.lieu, 90), numero: txt(c.numero, 60), date: txt(c.date, 40),
  }

  const ctx = objet(s.contexte)
  const pan = objet(ctx.panneau)
  deck.contexte = {
    surtitre: txt(ctx.surtitre, 60) || 'le contexte',
    titre: txt(ctx.titre, 90),
    paragraphes: liste(ctx.paragraphes, 3).map(p => txt(p, 400)).filter(Boolean),
    chiffres: liste(ctx.chiffres, 2).map(x => ({ valeur: txt(objet(x).valeur, 8), legende: txt(objet(x).legende, 60) })),
    panneau: { titre: txt(pan.titre, 60) || 'direction créative', points: liste(pan.points, 6).map(p => txt(p, 60)).filter(Boolean) },
  }

  const b = objet(s.brief)
  deck.brief = {
    surtitre: txt(b.surtitre, 60) || 'le brief',
    titre: txt(b.titre, 90),
    cartes: liste(b.cartes, 2).map(x => ({ label: txt(objet(x).label, 90), texte: txt(objet(x).texte, 420) })),
    portee: txt(b.portee, 400),
  }

  const p = objet(s.pourquoi)
  deck.pourquoi = {
    surtitre: txt(p.surtitre, 60) || 'pourquoi nous',
    titre: txt(p.titre, 90),
    atouts: liste(p.atouts, 4).map(x => ({ titre: txt(objet(x).titre, 60), texte: txt(objet(x).texte, 300) })),
  }

  // Les pièces, en nombre libre : c'est le projet qui décide, pas le gabarit.
  deck.pieces = liste(s.pieces, PIECES_MAX).map(brutPiece => {
    const pi = objet(brutPiece)
    const det = objet(pi.detail)
    const enc = objet(det.encadre)
    const detail = {
      titre: txt(det.titre, 80) || txt(pi.nom, 80),
      texte: txt(det.texte, 500),
      encadre: (txt(enc.titre) || txt(enc.texte))
        ? { titre: txt(enc.titre, 80), texte: txt(enc.texte, 420) } : null,
      specs: liste(det.specs, 6).map(x => ({ label: txt(objet(x).label, 40), valeur: txt(objet(x).valeur, 120) })),
      images: liste(det.images, 2).map(i => emplacement(i, fichiers)),
    }
    return { nom: txt(pi.nom, 80), images: liste(pi.images, 2).map(i => emplacement(i, fichiers)), detail }
  })

  // L'aperçu ne tient pas douze colonnes : au-delà de six pièces, la page saute
  // et les pièces se découvrent une par une, ce qui est de toute façon le cas.
  const ap = objet(s.apercu)
  const apercuPieces = liste(ap.pieces, 6)
  deck.apercu = deck.pieces.length > 6 ? null : {
    surtitre: txt(ap.surtitre, 60) || 'les pièces',
    titre: txt(ap.titre, 90),
    pieces: apercuPieces.map(x => ({
      nom: txt(objet(x).nom, 60), description: txt(objet(x).description, 120),
      image: emplacement(objet(x).image, fichiers),
    })),
  }

  // La méthode des visuels est un texte de la maison : il ne se réécrit pas.
  // Ses deux illustrations sont la paire de la première pièce, si elle existe.
  const paire = deck.pieces[0]?.images || []
  deck.methode = {
    ...METHODE,
    colonnes: METHODE.colonnes.map((col, i) => ({ ...col, image: paire[i] || col.image })),
  }

  const m = objet(s.materiaux)
  const items = liste(m.items, 3).map(x => ({
    nom: txt(objet(x).nom, 40),
    couleur: /^#[0-9a-fA-F]{6}$/.test(objet(x).couleur) ? objet(x).couleur : null,
    description: txt(objet(x).description, 160),
  })).filter(x => x.nom && x.couleur)
  deck.materiaux = items.length ? {
    surtitre: txt(m.surtitre, 60) || 'matériaux', titre: txt(m.titre, 90), items,
    note: txt(m.note, 160) || 'échantillons physiques présentés à la validation du design.',
  } : null

  const pl = objet(s.planning)
  deck.planning = {
    surtitre: txt(pl.surtitre, 60) || 'planning',
    titre: txt(pl.titre, 90),
    etapes: liste(pl.etapes, 5).map(x => ({ date: txt(objet(x).date, 40), texte: txt(objet(x).texte, 120) })),
  }

  // Le budget vient de l'offre, toujours. Le modèle ne le voit qu'en lecture.
  deck.budget = budget

  const co = objet(s.conditions)
  const libres = liste(co.items, 6)
    .map(x => ({ label: txt(objet(x).label, 40), texte: txt(objet(x).texte, 300) }))
    .filter(x => x.label && x.texte && !CONDITIONS_FIXES.some(f => f.label === x.label))
  deck.conditions = {
    surtitre: txt(co.surtitre, 60) || 'conditions',
    titre: txt(co.titre, 90) || 'les conditions de cette offre',
    items: [...CONDITIONS_FIXES, ...libres.slice(0, 4)],
  }

  const cl = objet(s.cloture)
  deck.cloture = {
    ligne: 'parlons de votre projet !',
    contact: txt(cl.contact, 160) || contact,
  }

  return deck
}

/**
 * Le document tel qu'on le REMONTRE au modèle : les visuels redeviennent des
 * noms de fichiers.
 *
 * Un identifiant kDrive ne lui apprend rien et l'invite à en inventer ; le nom,
 * lui, est ce qu'il a lui-même choisi au tour précédent. C'est aussi ce qui
 * rend une correction reproductible : il relit exactement ce qu'il a écrit.
 */
export function pourLeModele(deck) {
  const visiter = noeud => {
    if (Array.isArray(noeud)) return noeud.map(visiter)
    if (!noeud || typeof noeud !== 'object') return noeud
    if (noeud.kdrive_id || noeud.attente) {
      const fichier = noeud.attente || noeud.kdrive_nom || ''
      return noeud.legende ? { fichier, legende: noeud.legende } : { fichier }
    }
    return Object.fromEntries(Object.entries(noeud).map(([k, v]) => [k, visiter(v)]))
  }
  return visiter(deck)
}

/** Extrait l'objet JSON d'une réponse, clôture Markdown comprise. */
export function extraireJson(texte) {
  const brut = String(texte || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim()
  const debut = brut.indexOf('{')
  const fin = brut.lastIndexOf('}')
  if (debut < 0 || fin <= debut) return null
  try { return JSON.parse(brut.slice(debut, fin + 1)) } catch { return null }
}

const listeFichiers = fichiers => (fichiers.length
  ? fichiers.map(f => `- ${f.nom}`).join('\n')
  : '(aucun visuel déposé)')

const listeBudget = budget => (budget?.lignes?.length
  ? `${budget.lignes.map(l => `- ${l.libelle} : ${l.montant}`).join('\n')}\nsous-total ${budget.sousTotal} · total ttc ${budget.total}`
  : '(pas d\'offre chiffrée)')

export function promptGeneration({ consignes, fichiers = [], budget = null, projet = {}, synthese = '', deckActuel = null, correction = '' }) {
  const entete = `Tu construis la présentation client d'amazing lab, atelier suisse de fabrication (expositions, stands, vitrines, mobilier, structures d'événement), en Suisse romande. Elle part au client avec l'offre chiffrée.

Tu renvoies UN OBJET JSON, et rien d'autre : pas de préambule, pas de commentaire, pas de clôture Markdown.`

  const forme = `Forme attendue :

{
  "couverture": { "surtitre": "offre de production — …", "titre": "<client> × <lieu>", "sousTitre": "…", "lieu": "<lieu, dates>", "numero": "<n° d'offre>", "date": "<jj.mm.aaaa>" },
  "contexte": { "titre": "…", "paragraphes": ["…", "…"], "chiffres": [{ "valeur": "3", "legende": "…" }], "panneau": { "titre": "direction créative", "points": ["…"] } },
  "brief": { "titre": "…", "cartes": [{ "label": "<pièce — dates>", "texte": "…" }], "portee": "<ce qu'on livre, et ce qu'un tiers fournit>" },
  "pourquoi": { "titre": "…", "atouts": [{ "titre": "<un fait>", "texte": "<ce que le client y gagne>" }] },
  "apercu": { "titre": "…", "pieces": [{ "nom": "…", "description": "<une ligne>", "image": { "fichier": "<nom de fichier>" } }] },
  "pieces": [
    { "nom": "…",
      "images": [{ "fichier": "<nom>", "legende": "construction 3d" }, { "fichier": "<nom>", "legende": "mise en situation" }],
      "detail": { "titre": "…", "texte": "…",
        "encadre": { "titre": "l'écart assumé", "texte": "<ce que le brief demandait, ce que le lieu impose, ce qu'on propose>" },
        "specs": [{ "label": "emprise", "valeur": "…" }],
        "images": [{ "fichier": "<nom>" }] } }
  ],
  "materiaux": { "titre": "…", "items": [{ "nom": "…", "couleur": "#8C3A3A", "description": "…" }] },
  "planning": { "titre": "…", "etapes": [{ "date": "…", "texte": "…" }] },
  "conditions": { "titre": "…", "items": [{ "label": "…", "texte": "…" }] },
  "cloture": { "contact": "<prénom nom — téléphone — hello@amazinglab.ch>" }
}

Ce que tu ne fournis pas : le budget (il vient de l'offre), le texte de la page « comment lire les visuels » (il est fixe), les conditions de paiement et de validité (elles sont fixes).

Nombres imposés : au plus 3 paragraphes de contexte, 2 chiffres, 6 mots-clés de direction, 2 cartes de brief, 4 atouts, 6 spécifications par pièce, 3 matériaux, 5 jalons de planning, 4 conditions libres, 2 images par emplacement. Les pièces, elles, sont AUTANT QUE LE PROJET EN COMPTE.`

  const regles = `Règles d'écriture, sans exception :
- TOUT en minuscules, y compris les noms propres ("moët & chandon", "manor genève"). Les accents restent.
- Français. Phrases déclaratives, courtes. Pas de question rhétorique, pas d'adjectif publicitaire, pas de méta-discours.
- "nous" pour l'atelier, "vous" pour le client. Aucun emoji, aucun point d'exclamation.
- Un paragraphe de corps fait une ou deux phrases calmes, qui nomment des matières, des dimensions, des contraintes réelles.
- N'INVENTE AUCUN FAIT : ni dimension, ni date, ni matériau, ni chiffre qui ne soit dans ce qui suit. Si une information manque, écris-la [entre crochets] — un trou se corrige, une invention se signe.
- L'encadré « l'écart assumé » est le cœur de l'argumentaire : ce que le brief demandait, ce que le lieu ou l'usage impose, ce que nous proposons à la place. Sans matière, laisse-le vide.

Les visuels : chaque emplacement cite le NOM EXACT d'un fichier de la liste. La convention de nommage dit la pièce et la nature : une construction 3d de l'atelier d'un côté, sa mise en situation enrichie par ia de l'autre. Groupe-les par pièce, dans cet ordre. Un fichier qui n'entre dans aucune pièce ne se force pas ; un emplacement sans fichier reste vide.`

  const matiere = `CE QU'ON TE RACONTE DU PROJET
${consignes || '(rien)'}

PROJET DANS MAZE : ${[projet.numero, projet.client, projet.name].filter(Boolean).join(' · ') || '(inconnu)'}${projet.deadline ? `\nDATE DE LIVRAISON : ${projet.deadline}` : ''}

FICHIERS DÉPOSÉS (cite ces noms tels quels)
${listeFichiers(fichiers)}

L'OFFRE CHIFFRÉE, pour ton information — tu ne la recopies pas, elle s'imprime seule
${listeBudget(budget)}
${synthese ? `\nCE QUE LE FIL DU PROJET DIT DÉJÀ\n${synthese}` : ''}`

  if (deckActuel) {
    return `${entete}

Voici la présentation telle qu'elle est aujourd'hui :

${JSON.stringify(pourLeModele(deckActuel), null, 1)}

CORRECTION DEMANDÉE
${correction}

Renvoie la présentation ENTIÈRE, corrigée. Ne change que ce qui est demandé : tout le reste doit rester mot pour mot. ${forme}

${regles}

${matiere}`
  }

  return `${entete}

${forme}

${regles}

${matiere}`
}

/** Appelle Claude et renvoie un deck déjà borné. Lève ErreurClaude si refus. */
export async function genererDeck({
  consignes, fichiers = [], budget = null, projet = {}, synthese = '',
  deckActuel = null, correction = '', contact = '', apiKey, fetcher = fetchTimeout,
}) {
  const r = await fetcher('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODELE_REDACTION,
      max_tokens: 16000,
      messages: [{ role: 'user', content: promptGeneration({ consignes, fichiers, budget, projet, synthese, deckActuel, correction }) }],
    }),
  }, DELAI_IA)

  if (!r.ok) throw new ErreurClaude(r.status, await r.text().catch(() => ''))
  const data = await r.json()
  const texte = (data?.content || []).filter(b => b.type === 'text').map(b => b.text).join('')
  const sortie = extraireJson(texte)
  if (!sortie) throw new ErreurClaude(502, 'Réponse illisible')
  return validerSortie(sortie, { fichiers, budget, contact })
}
