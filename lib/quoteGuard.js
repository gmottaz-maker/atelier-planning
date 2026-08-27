// Un devis ne s'écrase jamais par une version allégée.
//
// `GET /api/projects?light=1` réduit `quote_data` à `{ status }` pour ne pas
// transporter les prix d'achat et les marges dans les listes — la barre
// latérale charge cette route sur chaque page. Plusieurs écrans renvoyaient
// ensuite le projet ENTIER en PUT, ce moignon compris, et le serveur
// remplaçait l'offre complète par lui.
//
// Trois offres ont été détruites ainsi entre le 21 et le 27 août 2026, par un
// simple changement de phase depuis la liste des projets. Les appelants ont été
// corrigés, mais le garde-fou vit ici : le serveur possède la donnée, et il n'a
// aucune raison d'accepter un remplacement qui ne peut être qu'une perte.

const SECTIONS = ['management', 'items', 'subcontracting', 'logistics']

/** Nombre de lignes que porte un devis, toutes sections confondues. */
export function lignesDevis(quote) {
  return SECTIONS.reduce((n, k) => n + (Array.isArray(quote?.[k]) ? quote[k].length : 0), 0)
}

/**
 * Que faut-il écrire dans `quote_data` ?
 *
 * @param {object|null} avant   le devis actuellement en base
 * @param {object|null} propose celui que la requête voudrait écrire
 * @returns {{ ecrire: boolean, valeur?: object|null, raison?: string }}
 *   `ecrire: false` → ne pas toucher à la colonne.
 */
export function devisAEcrire(avant, propose) {
  // Le discriminant n'est PAS le nombre de lignes, c'est la présence des clés
  // de section. `?light=1` renvoie `{ status }` — aucune section. L'éditeur,
  // lui, envoie toujours les quatre tableaux, fussent-ils vides : un devis
  // qu'on vide volontairement se reconnaît à ça, et doit rester possible.
  const estUnMoignon = !propose || typeof propose !== 'object'
    || !SECTIONS.some(k => Array.isArray(propose[k]))

  // Cas normal : on écrit. Création, modification, ou suppression assumée de
  // toutes les lignes.
  if (!estUnMoignon || lignesDevis(avant) === 0) return { ecrire: true, valeur: propose }

  // Ici, le devis stocké a des lignes et la requête n'en apporte aucune parce
  // qu'elle n'a même pas les sections : c'est une perte sèche, jamais une
  // intention. On refuse.
  //
  // Le STATUT, lui, reste recevable — c'est la seule information que la version
  // allégée porte réellement, et la liste des offres s'en sert pour faire
  // passer un devis de « envoyé » à « accepté ».
  if (propose?.status && propose.status !== avant.status) {
    return { ecrire: true, valeur: { ...avant, status: propose.status }, raison: 'statut seul' }
  }
  return { ecrire: false, raison: `devis allégé refusé (${lignesDevis(avant)} ligne(s) préservée(s))` }
}
