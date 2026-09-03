import { useEffect, useState, useCallback } from 'react'
import { DEFAUTS_OFFRE, normaliserReglagesOffre } from './quoteDefaults'

// Lit les tarifs par défaut d'une offre. Part des valeurs d'origine et les
// remplace quand la réponse arrive : une offre ouverte avant la fin du fetch se
// remplit avec les tarifs historiques plutôt qu'avec des champs vides.
export function useQuoteDefaults() {
  const [reglages, setReglages] = useState(DEFAUTS_OFFRE)
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(() => {
    fetch('/api/app-settings/quote_defaults')
      .then(r => r.json())
      .then(d => {
        if (d?.value) setReglages(normaliserReglagesOffre(d.value))
        setLoaded(true)
      })
      .catch(() => setLoaded(true))   // hors ligne : on garde les valeurs d'origine
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const save = useCallback(async (next) => {
    const propre = normaliserReglagesOffre(next)
    setReglages(propre)
    const res = await fetch('/api/app-settings/quote_defaults', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: propre }),
    })
    if (!res.ok) throw new Error('Save failed')
    return res.json()
  }, [])

  return { reglages, loaded, refresh, save }
}
