// Version de l'application, telle qu'affichée en bas de la barre latérale.
//
// Elle répond à une question précise : « mon push est-il en ligne ? ». Le SHA
// se compare à celui du dernier commit sur GitHub, et l'heure de build tranche
// quand deux déploiements portent le même commit (un redéploiement manuel).
//
// Les deux valeurs sont figées au build par next.config.js — jamais lues à
// l'exécution, donc identiques au rendu serveur et au rendu client.

export const COMMIT = process.env.NEXT_PUBLIC_COMMIT || 'local'
export const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME || ''

/** « a1b2c3d · 04.09 14:32 », ou le seul commit si l'heure manque. */
export const VERSION = [COMMIT, BUILD_TIME].filter(Boolean).join(' · ')
