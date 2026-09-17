// Ce qu'une présentation client EST, avant toute question de mise en page.
//
// Le gabarit « offre client » suit un récit fixe : couverture, contexte, brief,
// pourquoi nous, aperçu des pièces, méthode des visuels, puis UNE PAIRE de
// pages par pièce fabriquée (visuels + détail), et enfin matériaux, planning,
// budget, conditions, clôture.
//
// L'ordre n'est pas négociable — c'est lui qui fait tenir l'argumentaire, et
// c'est la seule chose que le modèle de langue n'a pas le droit de décider.
// Ce qu'il écrit, ce sont les TEXTES ; ce qu'il choisit, ce sont les pièces à
// détailler. La structure, elle, vient d'ici.
//
// Une section vide ne s'imprime pas : une offre sans matériaux définis saute la
// page matériaux plutôt que d'afficher un titre au-dessus du vide. C'est la
// même règle que la synthèse de projet (lib/synthese.js) : ne pas remplir pour
// remplir.

// Le nombre de pièces vient du projet, pas du gabarit : une offre peut porter
// une vitrine unique montrée sous trois angles, ou douze éléments de stand. La
// borne n'est là que pour qu'un fichier aberrant ne fabrique pas cent pages.
export const PIECES_MAX = 24

/** Les pages du gabarit, dans l'ordre du récit. */
export const TYPES = [
  'couverture', 'contexte', 'brief', 'pourquoi', 'apercu', 'methode',
  'visuels', 'detail',
  'materiaux', 'planning', 'budget', 'conditions', 'cloture',
]

const vide = v => v === null || v === undefined || String(v).trim() === ''
const texte = v => (vide(v) ? '' : String(v).trim())
const liste = v => (Array.isArray(v) ? v : [])

/** Une section a-t-elle de quoi s'imprimer ? */
export function aDuContenu(type, d) {
  if (!d) return false
  switch (type) {
    case 'contexte':   return liste(d.paragraphes).some(p => !vide(p)) || liste(d.chiffres).length > 0
    case 'brief':      return liste(d.cartes).length > 0
    case 'pourquoi':   return liste(d.atouts).length > 0
    case 'apercu':     return liste(d.pieces).length > 0
    case 'methode':    return liste(d.colonnes).length === 2
    case 'materiaux':  return liste(d.items).length > 0
    case 'planning':   return liste(d.etapes).length > 0
    case 'budget':     return liste(d.lignes).length > 0
    case 'conditions': return liste(d.items).length > 0
    default:           return true
  }
}

/**
 * Déroule la présentation en pages prêtes à rendre.
 *
 * Les pièces sont numérotées ici, et pas au rendu : « élément 2 / 3 » doit
 * rester juste même si la pièce 1 n'a pas de visuel et que sa page saute.
 */
export function pagesDeck(deck = {}) {
  const pages = []
  const pousser = (type, donnees) => { if (aDuContenu(type, donnees)) pages.push({ type, ...donnees }) }

  pousser('couverture', deck.couverture)
  pousser('contexte', deck.contexte)
  pousser('brief', deck.brief)
  pousser('pourquoi', deck.pourquoi)
  pousser('apercu', deck.apercu)

  const pieces = liste(deck.pieces).slice(0, PIECES_MAX)
  // La page « comment lire les visuels » n'a de sens que s'il y a des visuels
  // à lire : elle défend la méthode 3D + IA, pas le gabarit.
  const avecVisuels = pieces.filter(p => liste(p.images).length > 0)
  if (avecVisuels.length > 0) pousser('methode', deck.methode)

  pieces.forEach((piece, i) => {
    const rang = { rang: i + 1, total: pieces.length, nom: texte(piece.nom) }
    if (liste(piece.images).length > 0) pages.push({ type: 'visuels', ...rang, images: liste(piece.images) })
    // La page de détail ne s'imprime que s'il y a quelque chose à détailler.
    // Douze pièces ne méritent pas douze pages de spécifications vides.
    const d = piece.detail
    if (d && (texte(d.texte) || liste(d.specs).length > 0 || texte(d.encadre?.texte))) {
      pages.push({ type: 'detail', ...rang, ...d })
    }
  })

  pousser('materiaux', deck.materiaux)
  pousser('planning', deck.planning)
  pousser('budget', deck.budget)
  pousser('conditions', deck.conditions)
  pousser('cloture', deck.cloture)

  return pages
}

/**
 * Ce qui manque encore, en clair, pour l'écran de relecture.
 *
 * Les champs non remplis sont écrits `[entre crochets]` par le gabarit : un
 * trou est visible à l'œil, mais l'utilisateur relit dix-sept pages et on ne
 * peut pas compter là-dessus. Cette liste est ce qui l'empêche d'envoyer une
 * offre avec « [marque] » sur la couverture.
 */
export function trous(deck = {}) {
  const manques = []
  const json = JSON.stringify(deck) || ''
  const crochets = json.match(/\[[^"\]]{2,60}\]/g) || []
  for (const c of new Set(crochets)) manques.push(`Champ non rempli : ${c}`)

  const pieces = liste(deck.pieces).slice(0, PIECES_MAX)
  if (pieces.length === 0) manques.push('Aucune pièce : la présentation n\'a rien à montrer.')
  pieces.forEach((p, i) => {
    if (liste(p.images).length === 0) manques.push(`Pièce ${i + 1} (${texte(p.nom) || 'sans nom'}) : aucun visuel.`)
  })
  if (!aDuContenu('budget', deck.budget)) manques.push('Budget absent : la page récapitulative ne sera pas imprimée.')
  return manques
}
