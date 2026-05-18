import { useState, useRef, useEffect } from 'react'

/**
 * Champ d'adresse avec autocomplete Google Maps Places (fallback Nominatim).
 * Charge le script Google Maps en async via NEXT_PUBLIC_GOOGLE_MAPS_KEY.
 */
export default function AddressInput({ value, onChange, placeholder, className, style }) {
  const debounceRef = useRef(null)
  const sessionRef  = useRef(null)
  const mapsKey     = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY

  const [suggestions, setSuggestions] = useState([])
  const [open, setOpen]               = useState(false)
  const [active, setActive]           = useState(-1)

  useEffect(() => {
    if (!mapsKey || (typeof document !== 'undefined' && document.getElementById('gmaps-script'))) return
    const s = document.createElement('script')
    s.id    = 'gmaps-script'
    s.src   = `https://maps.googleapis.com/maps/api/js?key=${mapsKey}&loading=async`
    s.async = true
    document.head.appendChild(s)
  }, [mapsKey])

  async function fetchGoogleSuggestions(q) {
    try {
      if (!window.google?.maps?.importLibrary) return null
      const { AutocompleteSuggestion, AutocompleteSessionToken } =
        await window.google.maps.importLibrary('places')
      if (!sessionRef.current) sessionRef.current = new AutocompleteSessionToken()
      const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: q,
        sessionToken: sessionRef.current,
      })
      return suggestions.map(s => s.placePrediction.text.toString())
    } catch { return null }
  }

  async function fetchNominatimSuggestions(q) {
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=6&addressdetails=0`,
        { headers: { 'Accept-Language': 'fr,en' } }
      )
      const d = await r.json()
      return d.map(x => x.display_name)
    } catch { return [] }
  }

  function handleChange(e) {
    const q = e.target.value
    onChange(q)
    clearTimeout(debounceRef.current)
    setActive(-1)
    if (q.length < 3) { setSuggestions([]); setOpen(false); return }
    debounceRef.current = setTimeout(async () => {
      let results = null
      if (mapsKey) results = await fetchGoogleSuggestions(q)
      if (!results || results.length === 0) results = await fetchNominatimSuggestions(q)
      setSuggestions(results || [])
      setOpen((results?.length || 0) > 0)
    }, 350)
  }

  function pick(addr) {
    onChange(addr)
    setSuggestions([])
    setOpen(false)
    setActive(-1)
    sessionRef.current = null
  }

  function handleKeyDown(e) {
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, suggestions.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(suggestions[active]) }
    if (e.key === 'Escape') { setOpen(false) }
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        className={className}
        style={style}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <ul style={{
          position: 'absolute', zIndex: 9999, top: '100%', left: 0, right: 0, marginTop: 4,
          background: 'white', border: '1px solid #e5e7eb', borderRadius: 12,
          boxShadow: '0 8px 24px rgba(0,0,0,0.1)', overflow: 'hidden', padding: 0, listStyle: 'none',
        }}>
          {suggestions.map((s, i) => (
            <li key={i} onMouseDown={() => pick(s)}
              style={{
                padding: '9px 14px', fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis', color: '#374151',
                background: i === active ? '#f3f4f6' : 'white',
              }}>
              📍 {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Helpers Google Maps URLs
export function mapsViewUrl(address) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}
export function mapsDirectionsUrl(address) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`
}
