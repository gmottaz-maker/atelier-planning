import { useEffect, useState } from 'react'

export function useSuggestions(field) {
  const [values, setValues] = useState([])

  useEffect(() => {
    if (!field) return
    let cancelled = false
    fetch(`/api/tasks/suggestions?field=${field}`)
      .then(r => r.json())
      .then(d => { if (!cancelled && Array.isArray(d.values)) setValues(d.values) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [field])

  return values
}
