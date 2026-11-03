import { useCallback } from 'react'
import useSWR from 'swr'

const CLE = '/api/app-settings/responsibles'
const DEFAULT_RESPONSIBLES = ['Arnaud', 'Guillaume', 'non défini']

// La liste des responsables, par SWR — comme `useTransport`. Elle passait par
// un `fetch` dans un `useEffect` : hors du cache de l'onglet, et refait par
// CHAQUE écran qui monte ce hook, onze au total. Une clé SWR est partagée :
// la réponse est relue du cache et les montages simultanés se dédoublonnent.
export function useResponsibles() {
  const { data, error, mutate } = useSWR(CLE)
  const responsibles = Array.isArray(data?.value) && data.value.length > 0
    ? data.value
    : DEFAULT_RESPONSIBLES

  const save = useCallback(async (next) => {
    await mutate({ value: next }, false)   // à l'écran tout de suite
    const res = await fetch(CLE, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: next }),
    })
    if (!res.ok) { mutate(); throw new Error('Save failed') }
    const json = await res.json()
    mutate()
    return json
  }, [mutate])

  return { responsibles, loaded: data !== undefined || !!error, refresh: mutate, save }
}

export { DEFAULT_RESPONSIBLES }
