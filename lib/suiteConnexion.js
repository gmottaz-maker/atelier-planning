// Où renvoyer quelqu'un après qu'il se soit connecté.
//
// Un module entier pour quatre lignes, comme `aujourdhui.js` : ce n'est pas la
// taille qui le justifie, c'est qu'une REDIRECTION OUVERTE se glisse
// exactement ici. `/login?suite=https://faux-maze.ch/` renverrait l'utilisateur
// sur un site tiers, après une vraie connexion, depuis un vrai lien Maze —
// c'est la forme classique du hameçonnage, et elle se teste.
//
// Le besoin vient de l'économat : un QR scanné à l'atelier mène à
// `/e/<jeton>`, et sans mémoire de la destination la connexion atterrissait
// sur l'accueil — il fallait rescanner la carte, le téléphone déjà à la main.

/** Le chemin à mémoriser dans `?suite=`, ou null s'il n'y a rien à garder. */
export function suiteAMemoriser(chemin) {
  const c = String(chemin || '')
  // Se souvenir de « /login » ferait boucler la connexion sur elle-même.
  if (!c || c === '/' || c.startsWith('/login')) return null
  return cheminInterne(c) ? c : null
}

/**
 * Le chemin lu dans `?suite=`, ou '/' si ce n'est pas un chemin interne.
 *
 * `//evil.ch` est une URL ABSOLUE pour le navigateur (protocole hérité), pas
 * un chemin : c'est le piège qu'un simple `startsWith('/')` laisse passer.
 * Un `\` est replié en `/` par certains navigateurs, donc `/\evil.ch` aussi.
 */
export function cheminApresConnexion(brut) {
  const c = typeof brut === 'string' ? brut : ''
  return cheminInterne(c) ? c : '/'
}

const cheminInterne = c => /^\/(?![/\\])/.test(c) && !c.includes('://')
