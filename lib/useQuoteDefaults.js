import { useCallback } from 'react'
import useSWR from 'swr'
import { DEFAUTS_OFFRE, normaliserReglagesOffre } from './quoteDefaults'

const CLE = '/api/app-settings/quote_defaults'

// Les tarifs par défaut d'une offre, par SWR — même raison que
// `useResponsibles`. On part des valeurs d'origine et on les remplace quand la
// réponse arrive : une offre ouverte avant la fin de la lecture se remplit avec
// les tarifs historiques plutôt qu'avec des champs vides.
export function useQuoteDefaults() {
  const { data, error, mutate } = useSWR(CLE)
  const reglages = data?.value ? normaliserReglagesOffre(data.value) : DEFAUTS_OFFRE

  const save = useCallback(async (next) => {
    const propre = normaliserReglagesOffre(next)
    await mutate({ value: propre }, false)
    const res = await fetch(CLE, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: propre }),
    })
    if (!res.ok) { mutate(); throw new Error('Save failed') }
    const json = await res.json()
    mutate()
    return json
  }, [mutate])

  // `loaded` commande le semis de l'offre vierge (`doitSemerOffreVierge`) : il
  // ne doit passer à vrai qu'une fois la réponse connue, succès ou échec.
  return { reglages, loaded: data !== undefined || !!error, refresh: mutate, save }
}
