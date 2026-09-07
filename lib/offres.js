// Organisation de la liste des offres.
//
// Ici plutôt que dans la page, parce que c'est du calcul : la page est du JSX,
// que Vitest ne transforme pas, et une fonction qu'on ne peut pas tester finit
// par dériver.

export const SANS_CLIENT = 'Sans client'

// Une offre acceptée est de l'argent acquis ; une offre encore en circulation
// est de l'argent espéré. Les additionner donnait un chiffre qui ne répond à
// aucune question — ni « combien ai-je gagné », ni « combien est en jeu ».
//
// Une offre REFUSÉE ne compte dans aucun des deux : elle n'est ni acquise ni
// en jeu. Elle est comptée à part pour que l'arithmétique reste vérifiable —
// sans quoi la somme des lignes ne correspondrait à rien d'affiché.
const VALIDE = new Set(['accepte'])
const REFUSE = new Set(['refuse'])

/**
 * Regroupe les offres par client.
 *
 * La liste était plate et triée par échéance : les trois offres d'un même
 * client se retrouvaient éparpillées entre celles de six autres, alors que
 * c'est par client qu'on la consulte — « où en est-on avec Manor ? ».
 *
 * L'ordre à L'INTÉRIEUR d'un groupe est celui reçu, donc l'échéance croissante
 * que la page applique déjà : c'est le bon ordre de travail une fois qu'on sait
 * de qui on parle.
 *
 * Les groupes sont alphabétiques parce qu'on vient y chercher un nom précis.
 * « Sans client » ferme la marche : c'est une anomalie à corriger, pas une
 * catégorie qu'on consulte.
 */
export function grouperParClient(offres) {
  const groupes = new Map()
  for (const o of offres || []) {
    // Les espaces autour du nom sont ignorés : sans ça, « Manor SA » saisi une
    // fois avec une espace de trop créerait un second groupe fantôme.
    const nom = String(o?.p?.client || '').trim() || SANS_CLIENT
    if (!groupes.has(nom)) groupes.set(nom, [])
    groupes.get(nom).push(o)
  }
  return [...groupes.entries()]
    .map(([client, items]) => {
      const somme = (garde) => items.reduce((t, o) => garde(o) ? t + (o.total || 0) : t, 0)
      return {
        client,
        items,
        valide:    somme(o => VALIDE.has(o.status)),
        enAttente: somme(o => !VALIDE.has(o.status) && !REFUSE.has(o.status)),
        refuse:    somme(o => REFUSE.has(o.status)),
      }
    })
    .sort((a, b) => {
      if (a.client === SANS_CLIENT) return 1
      if (b.client === SANS_CLIENT) return -1
      return a.client.localeCompare(b.client, 'fr')
    })
}
