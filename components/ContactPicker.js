import { useState, useRef, useEffect } from 'react'
import useSWR from 'swr'

// Compose { name, address } prêts à remplir un formulaire de facture,
// à partir d'un contact (société ou personne) et de la liste complète.
export function contactToBilling(c, list) {
  const co = c.kind === 'person' && c.parent_id ? list.find(x => String(x.id) === String(c.parent_id)) : null
  const name = co?.name || c.name
  const src = (c.street || c.city || c.zip) ? c : (co || c)
  const lines = []
  if (co) lines.push(`À l'att. de ${c.name}`)
  if (src.street) lines.push(src.street)
  const cityLine = [src.zip, src.city].filter(Boolean).join(' ')
  if (cityLine) lines.push(cityLine)
  if (src.country && src.country !== 'Suisse') lines.push(src.country)
  return { name, address: lines.join('\n'), contact: c }
}

export default function ContactPicker({ onSelect, placeholder = 'Rechercher un contact…' }) {
  const { data: contacts = [] } = useSWR('/api/contacts')
  const list = Array.isArray(contacts) ? contacts : []
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)

  useEffect(() => {
    function onDoc(e) { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const byId = Object.fromEntries(list.map(c => [String(c.id), c]))
  const needle = q.trim().toLowerCase()
  const matches = !needle ? [] : list
    .filter(c => !c.archived)
    .filter(c => {
      const co = c.kind === 'person' && c.parent_id ? byId[String(c.parent_id)] : null
      return [c.name, c.email, c.city, co?.name].filter(Boolean).join(' ').toLowerCase().includes(needle)
    })
    .slice(0, 40)

  function choose(c) {
    onSelect(contactToBilling(c, list))
    setQ(''); setOpen(false)
  }

  const dd = { position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.10)', maxHeight: 280, overflowY: 'auto', zIndex: 50 }

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <input value={q}
        onChange={e => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:border-gray-400 bg-white" />
      {open && needle && (
        <div style={dd}>
          {matches.length === 0 ? (
            <div style={{ padding: '10px 12px', fontSize: 13, color: '#9ca3af' }}>Aucun contact.</div>
          ) : matches.map(c => {
            const co = c.kind === 'person' && c.parent_id ? byId[String(c.parent_id)] : null
            const sub = co ? co.name : (c.city || (c.kind === 'company' ? 'Société' : ''))
            return (
              <button key={c.id} type="button" onClick={() => choose(c)}
                style={{ display: 'flex', width: '100%', textAlign: 'left', gap: 10, alignItems: 'center', padding: '8px 12px', border: 'none', background: 'transparent', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <span style={{ width: 26, height: 26, borderRadius: c.kind === 'company' ? 6 : '50%', background: '#241a20', color: '#ffb7c5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, flex: 'none' }}>
                  {(c.name || '?').slice(0, 2).toUpperCase()}
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                  <span style={{ display: 'block', fontSize: 11, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[sub, c.email].filter(Boolean).join(' · ')}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
