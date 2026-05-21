import { useState, useRef, useEffect } from 'react'

/**
 * Champ texte avec dropdown d'autocomplete visible (au focus ou en tapant).
 * Tu peux toujours taper une nouvelle valeur libre.
 */
export default function AutocompleteInput({
  value,
  onChange,
  suggestions = [],
  placeholder,
  className,
  style,
  autoFocus,
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const wrapRef = useRef(null)

  const filtered = (() => {
    const v = (value || '').trim().toLowerCase()
    if (!v) return suggestions
    return suggestions.filter(s => s.toLowerCase().includes(v))
  })()

  useEffect(() => {
    function onClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    window.addEventListener('mousedown', onClickOutside)
    return () => window.removeEventListener('mousedown', onClickOutside)
  }, [])

  function pick(s) {
    onChange(s)
    setOpen(false)
    setActive(-1)
  }

  function onKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(a => Math.min(a + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter' && open && active >= 0) { e.preventDefault(); pick(filtered[active]) }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  return (
    <div ref={wrapRef} className="relative" style={{ width: '100%' }}>
      <input
        type="text"
        value={value || ''}
        onChange={e => { onChange(e.target.value); setOpen(true); setActive(-1) }}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onKeyDown={onKey}
        placeholder={placeholder}
        className={className}
        style={{ ...style, paddingRight: 28 }}
        autoFocus={autoFocus}
        autoComplete="off"
      />
      {suggestions.length > 0 && (
        <button type="button"
          onClick={() => setOpen(o => !o)}
          aria-label="Voir les suggestions"
          style={{
            position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
            border: 'none', background: 'transparent', cursor: 'pointer',
            color: '#9ca3af', fontSize: 11, padding: 4,
          }}>
          ▾
        </button>
      )}
      {open && filtered.length > 0 && (
        <ul style={{
          position: 'absolute', zIndex: 50, top: '100%', left: 0, right: 0, marginTop: 4,
          background: 'white', border: '1px solid #e5e7eb', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.08)', maxHeight: 220, overflowY: 'auto',
          padding: 4, listStyle: 'none',
        }}>
          {filtered.map((s, i) => (
            <li key={s}
              onMouseDown={() => pick(s)}
              onMouseEnter={() => setActive(i)}
              style={{
                padding: '7px 10px', fontSize: 13, cursor: 'pointer',
                borderRadius: 4,
                background: i === active ? '#f3f4f6' : 'transparent',
                color: '#374151',
              }}>
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
