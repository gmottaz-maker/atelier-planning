import { useEffect, useState, useCallback } from 'react'

const DEFAULT_RESPONSIBLES = ['Arnaud', 'Guillaume', 'Gabin', 'non défini']

export function useResponsibles() {
  const [responsibles, setResponsibles] = useState(DEFAULT_RESPONSIBLES)
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(() => {
    fetch('/api/app-settings/responsibles')
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d?.value) && d.value.length > 0) {
          setResponsibles(d.value)
        }
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const save = useCallback(async (next) => {
    setResponsibles(next)
    const res = await fetch('/api/app-settings/responsibles', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: next }),
    })
    if (!res.ok) throw new Error('Save failed')
    return res.json()
  }, [])

  return { responsibles, loaded, refresh, save }
}

export { DEFAULT_RESPONSIBLES }
