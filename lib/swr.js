// Configuration SWR partagée (cache de données côté client)
//
// ── Pourquoi un cache persistant, et pourquoi sessionStorage ────────────────
//
// Sans persistance, chaque rechargement de page attend le réseau avant
// d'afficher quoi que ce soit : trois appels API en parallèle, chacun avec sa
// vérification de jeton et sa requête Supabase. L'application donne alors une
// impression de lenteur constante.
//
// Ce cache a d'abord été persisté dans le `localStorage`, ce qui posait un vrai
// problème : factures, transactions bancaires, contacts et marges y survivaient
// à la déconnexion, sur des postes d'atelier partagés, lisibles par la personne
// suivante.
//
// `sessionStorage` garde la vitesse et retire ce risque : il est propre à
// l'onglet et disparaît à sa fermeture. On le purge en plus à la déconnexion,
// pour le cas où l'onglet resterait ouvert.

import { useCallback } from 'react'
import { useSWRConfig } from 'swr'

const CACHE_KEY = 'maze-swr-cache'
// Une réponse volumineuse (un import bancaire, un gros catalogue) ne doit pas
// remplir le quota à elle seule et faire échouer l'écriture de tout le reste.
const MAX_ENTREE = 512 * 1024

/** Efface le cache, y compris la clé localStorage héritée. */
export function purgeCachePersistant() {
  if (typeof window === 'undefined') return
  try { sessionStorage.removeItem(CACHE_KEY) } catch {}
  // Version antérieure : présente sur les postes déjà utilisés, à effacer.
  try { localStorage.removeItem(CACHE_KEY) } catch {}
}

export const fetcher = (url) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Requête échouée (${r.status})`)
    return r.json()
  })

/**
 * Cache adossé au sessionStorage : relu au démarrage de l'onglet, réécrit
 * quand la page passe en arrière-plan ou se ferme.
 */
export function sessionProvider() {
  if (typeof window === 'undefined') return new Map()

  // La clé localStorage d'avant reste effacée, quoi qu'il arrive.
  try { localStorage.removeItem(CACHE_KEY) } catch {}

  let map
  try {
    map = new Map(JSON.parse(sessionStorage.getItem(CACHE_KEY) || '[]'))
  } catch {
    map = new Map()
  }

  const persister = () => {
    try {
      const gardees = []
      for (const [cle, valeur] of map.entries()) {
        const brut = JSON.stringify([cle, valeur])
        if (brut.length <= MAX_ENTREE) gardees.push([cle, valeur])
      }
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(gardees))
    } catch {
      // Quota dépassé ou navigation privée : on repart d'un cache propre
      // plutôt que de laisser une écriture partielle et illisible.
      try { sessionStorage.removeItem(CACHE_KEY) } catch {}
    }
  }

  window.addEventListener('beforeunload', persister)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persister()
  })

  return map
}

// ── Pourquoi on ne recharge PLUS au retour d'onglet ────────────────────────
//
// `revalidateOnFocus` relançait TOUTES les requêtes de la page à chaque fois
// que l'onglet reprenait le focus. Sur la fiche projet, qui en compte dix, un
// simple aller-retour vers la messagerie déclenchait dix appels — chacun au
// minimum 200 ms, le coût nu d'une fonction serverless. L'application donnait
// l'impression de recharger sans arrêt.
//
// On est deux à l'utiliser : les données ne changent pas dans notre dos. Ce
// qu'on modifie soi-même reste à jour, les écritures appelant `mutate()`. Le
// retour de connexion, lui, continue de revalider : là, le cache PEUT avoir
// manqué quelque chose.
export const swrConfig = {
  fetcher,
  provider: sessionProvider,
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  keepPreviousData: true,
  dedupingInterval: 4000,
}

/**
 * Rafraîchit les compteurs de la barre latérale.
 *
 * Ils ne se déduisent plus des listes complètes mais d'un décompte dédié
 * (`/api/compteurs`) : une écriture qui change le nombre de projets ou de
 * tâches actives doit donc le dire elle-même. `useSWRConfig` et non le
 * `mutate` global de `swr` : seul le premier vise le cache de CETTE
 * configuration, celui que `sessionProvider` fournit.
 */
export function useRafraichirCompteurs() {
  const { mutate } = useSWRConfig()
  return useCallback(() => mutate('/api/compteurs'), [mutate])
}
