import { useState, useEffect, useRef } from 'react'
import useSWR from 'swr'

// Compose l'adresse postale à partir d'une société et/ou d'une personne.
function composeAddress(company, person) {
  const lines = []
  if (person && company) lines.push(`À l'att. de ${person.name}`)
  const src = company || person
  if (!src) return ''
  if (src.street) lines.push(src.street)
  const cityLine = [src.zip, src.city].filter(Boolean).join(' ')
  if (cityLine) lines.push(cityLine)
  if (src.country && !/^(ch|suisse|switzerland)$/i.test(String(src.country).trim())) lines.push(src.country)
  return lines.join('\n')
}

// Sélecteur à deux niveaux : Entreprise puis Personne responsable.
// value : { client, client_contact_id }. onChange({ client, client_contact_id, client_address }).
export default function BillingContactSelect({ initialContactId, onChange }) {
  const { data: contacts = [] } = useSWR('/api/contacts')
  const list = Array.isArray(contacts) ? contacts : []
  const byId = Object.fromEntries(list.map(c => [String(c.id), c]))

  const companies = list.filter(c => c.kind === 'company' && !c.archived).sort((a, b) => (a.name || '').localeCompare(b.name || ''))

  const [companyId, setCompanyId] = useState('')
  const [personId, setPersonId] = useState('')
  const seeded = useRef(false)

  // Amorçage depuis un projet existant (une fois les contacts chargés).
  useEffect(() => {
    if (seeded.current || !list.length || initialContactId == null) return
    const c = byId[String(initialContactId)]
    if (c) {
      if (c.kind === 'company') setCompanyId(String(c.id))
      else { setPersonId(String(c.id)); if (c.parent_id) setCompanyId(String(c.parent_id)) }
      seeded.current = true
    }
  }, [list.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const persons = list
    .filter(c => c.kind !== 'company' && !c.archived && String(c.parent_id || '') === String(companyId))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))

  function emit(coId, peId) {
    const company = coId ? byId[coId] : null
    const person = peId ? byId[peId] : null
    const client = company?.name || person?.name || ''
    onChange({
      client,
      client_contact_id: person?.id || company?.id || null,
      client_address: composeAddress(company, person),
    })
  }
  function onCompany(v) { setCompanyId(v); setPersonId(''); emit(v, '') }
  function onPerson(v) { setPersonId(v); emit(companyId, v) }

  const sel = { width: '100%', padding: '9px 10px', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 14, background: '#fff', color: '#111827' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <select value={companyId} onChange={e => onCompany(e.target.value)} style={sel}>
        <option value="">Entreprise…</option>
        {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <select value={personId} onChange={e => onPerson(e.target.value)} style={{ ...sel, opacity: companyId ? 1 : 0.5 }} disabled={!companyId}>
        <option value="">{companyId ? 'Personne responsable…' : '— choisir l\'entreprise d\'abord'}</option>
        {persons.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </div>
  )
}
