// L'index des outils d'atelier (/outils/essai) : la liste, et ce que chaque
// outil a à dire en ce moment — l'économat, surtout, qui sait ce qu'il faut
// commander. Les outils restent autonomes : rien ici ne les relie aux projets.

export const OUTILS = [
  { href: '/outils/economat', nom: 'Économat', groupe: 'atelier',
    resume: 'Les consommables de l’atelier : ce qu’il y a à commander, chez qui, avec quelle référence. Le Kanban physique reste l’outil ; Maze garde le catalogue, l’historique et imprime les cartes.' },
  { href: '/outils/annuaire', nom: 'Annuaire', groupe: 'atelier',
    resume: 'Qui fait quoi, et où l’on commande : tôlerie, thermolaquage, fraises de CNC. Rangé par technique, jamais par région ; une entrée peut n’être qu’un nom et un site.' },
  { href: '/outils/peintures', nom: 'Peintures RUCO', groupe: 'atelier',
    resume: 'Choisir un produit selon le support, la brillance et l’application, puis chiffrer le travail : quantités, durcisseur, diluant, coût matière et temps.' },
  { href: '/outils/charges-sociales', nom: 'Charges sociales', groupe: 'gestion', admin: true,
    resume: 'Ce qu’un employé coûte vraiment : AVS, chômage, allocations familiales, LAA et LPP, par personne et par organisme.' },
  { href: '/outils/assurances', nom: 'Assurances', groupe: 'gestion', admin: true,
    resume: 'Ce qu’on a choisi d’assurer et ce qui est couvert. Une question en une phrase renvoie la garantie, sa limite et qui appeler.' },
  { href: '/outils/marge-km', nom: 'Marge au kilomètre', groupe: 'gestion', admin: true,
    resume: 'Un trajet gagne-t-il de l’argent ? Essaie un tarif, un salaire ou des km par an sans toucher aux réglages.' },
]

export const GROUPES = [
  { cle: 'atelier', nom: 'À l’atelier' },
  { cle: 'gestion', nom: 'Gestion', admin: true },
]

const pl = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`

/**
 * Ce que chaque outil affiche à côté de son nom : `{ [href]: { texte, alerte } }`.
 * `alerte` quand quelqu'un doit agir (un article à commander). Une donnée pas
 * encore chargée (`null`) ne dit rien, plutôt qu'un zéro qui mentirait.
 */
export function etatsOutils({ economat = null, annuaire = null } = {}) {
  const out = {}
  if (economat?.articles) {
    const actifs = economat.articles.filter(a => !a.archived)
    const n = cle => actifs.filter(a => a.etat === cle).length
    const commander = n('commander'), bas = n('bas'), commande = n('commande')
    const parts = [
      commander && pl(commander, 'à commander', 'à commander'),
      bas && pl(bas, 'stock bas', 'stocks bas'),
      commande && pl(commande, 'commandé', 'commandés'),
    ].filter(Boolean)
    out['/outils/economat'] = parts.length
      ? { texte: parts.join(' · '), alerte: commander > 0 }
      : { texte: `${pl(actifs.length, 'article', 'articles')}, tout est en stock`, alerte: false }
  }
  if (annuaire?.entrees) {
    out['/outils/annuaire'] = { texte: pl(annuaire.entrees.length, 'adresse', 'adresses'), alerte: false }
  }
  out['/outils/peintures'] = { texte: '271 produits, 20 tarifés', alerte: false }
  return out
}
