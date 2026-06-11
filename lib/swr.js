// Configuration SWR partagée (cache de données côté client)
//
// Pourquoi : affichage instantané au chargement (les dernières données connues
// sont persistées en localStorage et ré-affichées tout de suite), puis
// rafraîchissement en arrière-plan. Revalidation auto quand on revient sur
// l'onglet → fini le "recharger en Cmd+Shift+R" le matin.

const CACHE_KEY = 'maze-swr-cache'

export const fetcher = (url) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Requête échouée (${r.status})`)
    return r.json()
  })

// Fournisseur de cache adossé au localStorage : hydraté au démarrage,
// ré-écrit quand l'onglet passe en arrière-plan ou se ferme.
export function localStorageProvider() {
  if (typeof window === 'undefined') return new Map()

  let map
  try {
    map = new Map(JSON.parse(localStorage.getItem(CACHE_KEY) || '[]'))
  } catch {
    map = new Map()
  }

  const persist = () => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(Array.from(map.entries())))
    } catch {
      // quota dépassé ou mode privé : on ignore, le cache reste en mémoire
    }
  }

  window.addEventListener('beforeunload', persist)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persist()
  })

  return map
}

export const swrConfig = {
  fetcher,
  provider: localStorageProvider,
  revalidateOnFocus: true,
  revalidateOnReconnect: true,
  keepPreviousData: true,
  dedupingInterval: 4000,
}
