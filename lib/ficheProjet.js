// Les deux décisions de chargement de la fiche projet.
//
// La fiche lisait le projet, ses tâches, ses fichiers et son fil par quatre
// `fetch` dans un `useEffect` : aucun cache, donc une page blanche à chaque
// arrivée le temps de quatre allers-retours. Ces lectures passent maintenant
// par SWR, qui rend d'abord la version en cache.
//
// Mais SWR rappelle : la même donnée arrive deux fois, d'abord périmée puis
// fraîche. Ce qui ne posait aucune question dans un effet qui ne tournait
// qu'une fois en pose deux, et toutes deux coûtent une offre si on se trompe —
// c'est exactement par un rechargement mal gardé que deux offres ont été
// perdues (voir `doitSemerOffreVierge`). D'où ces fonctions, ici, testées.

import { genItemUid } from './quoteLines'

/**
 * Faut-il remplacer le projet affiché par celui qui vient d'arriver ?
 *
 * `updated_at` tranche, et c'est le seul juge possible. Un enregistrement
 * écrit l'état renvoyé par la route dans l'écran ; si la revalidation SWR
 * lancée au montage se pose APRÈS, elle rapporte la version d'AVANT la
 * sauvegarde — et l'écrirait par-dessus. Comparer les dates fait retomber ce
 * cas tout seul : une réponse plus ancienne que ce qu'on affiche est ignorée.
 */
export function doitAppliquerProjet({ arrivant, courant }) {
  if (!arrivant || arrivant.error) return false
  if (!courant) return true                       // premier rendu
  if (arrivant.id !== courant.id) return true     // on a changé de projet
  if (!arrivant.updated_at) return false          // sans date, on ne sait pas : on garde
  if (!courant.updated_at) return true
  return arrivant.updated_at > courant.updated_at
}

/**
 * L'offre enregistrée d'un projet, ou `null` s'il n'en a aucune.
 *
 * Deux formats cohabitent en base. Le second est antérieur aux items
 * (`purchases` / `labor` à plat) et se migre en un item « Général » ;
 * `migree` le signale pour que l'écran réécrive au format courant.
 *
 * Renvoyer `null` plutôt qu'une offre vide est ce qui distingue « ce projet
 * n'a pas d'offre » de « ce projet a une offre, vide » : le premier cas
 * autorise à semer le modèle par défaut, le second jamais.
 */
export function offreDuProjet(project, uid = genItemUid) {
  const q = project?.quote_data
  if (!q) return null

  if (Array.isArray(q.items) || Array.isArray(q.management)) {
    const lignes = (q.management?.length || 0) + (q.items?.length || 0)
      + (q.subcontracting?.length || 0) + (q.logistics?.length || 0)
    if (lignes === 0) return null
    return {
      migree: false,
      offre: {
        management:     q.management || [],
        items:          q.items || [],
        subcontracting: q.subcontracting || [],
        logistics:      q.logistics || [],
        general_margin: q.general_margin ?? '',
        status:         q.status || 'brouillon',
        number:         q.number || '',
      },
    }
  }

  if (q.purchases?.length || q.labor?.length || q.logistics?.length) {
    return {
      migree: true,
      offre: {
        management: [],
        items: (q.purchases?.length || q.labor?.length)
          ? [{ _uid: uid(), name: 'Général', purchases: q.purchases || [], labor: q.labor || [] }]
          : [],
        subcontracting: [],
        logistics: q.logistics || [],
        general_margin: '',
        status: q.status || 'brouillon',
        number: q.number || '',
      },
    }
  }

  return null
}
