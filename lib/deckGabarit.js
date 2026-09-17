// Le gabarit vierge d'une présentation client : la structure, les textes fixes
// et, partout ailleurs, des trous `[entre crochets]`.
//
// Deux usages, et c'est pour cela qu'il vit ici plutôt que dans un écran :
//   — il est ce qu'on donne au modèle de langue à remplir (il voit ainsi la
//     longueur attendue de chaque champ, ce qu'aucune consigne ne transmet
//     aussi bien) ;
//   — il est ce qu'on rend en PDF pour vérifier la mise en page sans contenu.
//
// Les textes FIXES ne sont pas des exemples : ils sont la position de la maison
// et ne se réécrivent pas d'une offre à l'autre. La page « comment lire les
// visuels » en particulier existe pour désamorcer une objection précise — « ce
// n'est qu'un rendu IA » — et sa formulation a été pesée.

/** Les conditions qui ne changent jamais. Les autres sont propres à l'offre. */
export const CONDITIONS_FIXES = [
  { label: 'paiement', texte: '30 % d\'acompte à la commande, solde à la livraison.' },
  { label: 'validité', texte: 'offre valable 30 jours dès son émission.' },
]

/** La méthode des visuels, telle qu'elle est défendue au client. */
export const METHODE = {
  titre: 'deux images par pièce, et ce qu\'elles montrent',
  intro: 'chaque pièce est présentée deux fois : la construction 3d dessinée dans notre atelier, puis la même image enrichie. la méthode nous épargne des heures de rendu photoréaliste et donne une idée plus juste de l\'objet fini, qui ressemblera au rendu enrichi plutôt qu\'au volume brut.',
  colonnes: [
    {
      legende: 'construction 3d — atelier amazing lab',
      texte: 'le fichier de construction dessiné chez nous : volumes, dimensions, assemblages. c\'est ce qui partira en atelier.',
      image: { attente: 'export 3d' },
    },
    {
      legende: 'mise en situation — rendu enrichi par ia',
      texte: 'la même image, enrichie en matières, textures et lumière. l\'ia n\'a pas créé le visuel : elle habille notre construction.',
      image: { attente: 'rendu enrichi' },
    },
  ],
}

const piece = n => ({
  nom: `[nom de la pièce ${n}]`,
  images: [
    { attente: `pièce ${n} — construction 3d`, legende: 'construction 3d' },
    { attente: `pièce ${n} — mise en situation`, legende: 'mise en situation' },
  ],
  detail: {
    titre: `[nom de la pièce ${n}]`,
    texte: '[ce qu\'est la pièce, où elle se pose, l\'intention — deux phrases]',
    encadre: {
      titre: '[l\'écart assumé]',
      texte: '[ce que le brief demandait, ce que le lieu impose, ce qu\'on propose à la place]',
    },
    specs: [
      { label: 'emprise', valeur: '[l × p × h]' },
      { label: 'matériaux', valeur: '[supports et finitions]' },
      { label: 'construction', valeur: '[assemblage, démontabilité]' },
      { label: 'implantation', valeur: '[où, et ce que ça suppose]' },
    ],
    images: [{ attente: 'détail 1' }, { attente: 'détail 2' }],
  },
})

/**
 * Un gabarit prêt à remplir. `pieces` : combien d'articles seront détaillés
 * (trois au maximum — au-delà le récit se dilue).
 */
export function gabaritDeck({ pieces = 2 } = {}) {
  return {
    langue: 'fr',
    couverture: {
      surtitre: 'offre de production — [saison ou projet]',
      titre: '[marque] × [lieu]',
      sousTitre: '[le concept en une ligne, puis les pièces]',
      lieu: '[lieu, dates]',
      numero: '[n° d\'offre]',
      date: '[date]',
    },
    contexte: {
      surtitre: 'le contexte',
      titre: '[qui commande, et pour quoi faire]',
      paragraphes: [
        '[qui est le client, ce qu\'il organise, où et quand]',
        '[notre histoire avec lui, ou comment le projet nous arrive]',
      ],
      chiffres: [
        { valeur: '[n]', legende: '[ce que ce nombre compte]' },
        { valeur: '[n]', legende: '[ce que ce nombre compte]' },
      ],
      panneau: {
        titre: 'direction créative',
        points: ['[mot-clé]', '[mot-clé]', '[mot-clé]', '[mot-clé]', '[mot-clé]'],
      },
    },
    brief: {
      surtitre: 'le brief',
      titre: '[ce qui est demandé, en une phrase]',
      cartes: [
        { label: '[pièce 1 — dates]', texte: '[ce qui est attendu, et dans quelles contraintes]' },
        { label: '[pièce 2 — dates]', texte: '[ce qui est attendu, et dans quelles contraintes]' },
      ],
      portee: '[ce que nous livrons, et ce qu\'un tiers fournit et qui n\'est donc pas dans cette offre]',
    },
    pourquoi: {
      surtitre: 'pourquoi nous',
      titre: '[ce que l\'atelier apporte à ce projet précis]',
      atouts: [
        { titre: '[un fait]', texte: '[ce que le client y gagne]' },
        { titre: '[un fait]', texte: '[ce que le client y gagne]' },
        { titre: '[un fait]', texte: '[ce que le client y gagne]' },
        { titre: '[un fait]', texte: '[ce que le client y gagne]' },
      ],
    },
    apercu: {
      surtitre: 'les pièces',
      titre: '[l\'ensemble en un coup d\'œil]',
      pieces: Array.from({ length: pieces }, (_, i) => ({
        nom: `[nom de la pièce ${i + 1}]`,
        description: '[une ligne]',
        image: { attente: `pièce ${i + 1}` },
      })),
    },
    methode: METHODE,
    pieces: Array.from({ length: pieces }, (_, i) => piece(i + 1)),
    materiaux: {
      surtitre: 'matériaux',
      titre: '[la palette, en trois valeurs]',
      items: [
        { couleur: '#8C3A3A', nom: '[matière]', description: '[support, finition, où elle est employée]' },
        { couleur: '#DED3BE', nom: '[matière]', description: '[support, finition, où elle est employée]' },
        { couleur: '#1B1B1B', nom: '[matière]', description: '[support, finition, où elle est employée]' },
      ],
      note: 'échantillons physiques présentés à la validation du design.',
    },
    planning: {
      surtitre: 'planning',
      titre: '[de la validation à la livraison]',
      etapes: [
        { date: '[date]', texte: '[validation de l\'offre — ce qui se débloque]' },
        { date: '[date]', texte: '[design détaillé]' },
        { date: '[date]', texte: '[fabrication en atelier]' },
        { date: '[date]', texte: '[livraison et montage]' },
        { date: '[date]', texte: '[démontage]' },
      ],
    },
    budget: {
      surtitre: 'budget',
      titre: '[récapitulatif de l\'offre]',
      numero: '[n° d\'offre]',
      livraison: '[livraison prévue]',
      lignes: [{ libelle: '[poste]', montant: 0 }],
      sousTotal: 0, tva: 0, total: 0,
      note: '[le sous-total tient-il dans l\'enveloppe annoncée ?] détail poste par poste disponible sur demande.',
    },
    conditions: {
      surtitre: 'conditions',
      titre: '[les conditions de cette offre]',
      items: [
        ...CONDITIONS_FIXES,
        { label: 'accès et montage', texte: '[créneaux, accès au lieu, ce qu\'on suppose disponible]' },
        { label: 'validation', texte: '[qui valide quoi, et dans quel délai]' },
        { label: 'hypothèses', texte: '[ce sur quoi le prix est calculé, et ce qui le ferait bouger]' },
        { label: 'propriété', texte: 'les concepts et dessins restent notre propriété jusqu\'à la commande.' },
      ],
    },
    cloture: {
      ligne: 'parlons de votre projet !',
      contact: '[prénom nom] — [téléphone] — hello@amazinglab.ch',
    },
  }
}
