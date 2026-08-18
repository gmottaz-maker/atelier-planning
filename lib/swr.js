// Configuration SWR partagée (cache de données côté client)
//
// Le cache reste EN MÉMOIRE. Il était auparavant persisté en entier dans le
// localStorage : la map complète, donc factures clients et fournisseurs,
// transactions bancaires, contacts, frais, tâches privées, offres avec prix
// d'achat et marges. Ces données survivaient à la déconnexion, sur des postes
// d'atelier partagés, lisibles par tout script de la page.
//
// Une éventuelle persistance future devra passer par une liste blanche de
// clés non sensibles, un espace par utilisateur, une durée de vie et une purge
// à la déconnexion — pas par la map entière.

const CACHE_KEY = 'maze-swr-cache'

/** Purge le cache hérité. Appelée au démarrage et à la déconnexion. */
export function purgeCachePersistant() {
  if (typeof window === 'undefined') return
  try { localStorage.removeItem(CACHE_KEY) } catch {}
}

export const fetcher = (url) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Requête échouée (${r.status})`)
    return r.json()
  })

// Cache en mémoire uniquement. Au passage, on efface le cache persistant des
// versions précédentes : il contient encore des données financières sur les
// postes déjà utilisés.
export function memoryProvider() {
  purgeCachePersistant()
  return new Map()
}

export const swrConfig = {
  fetcher,
  provider: memoryProvider,
  revalidateOnFocus: true,
  revalidateOnReconnect: true,
  keepPreviousData: true,
  dedupingInterval: 4000,
}
