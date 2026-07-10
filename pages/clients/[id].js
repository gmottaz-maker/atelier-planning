import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import useSWR from 'swr'
import Head from 'next/head'
import Link from 'next/link'
import { C, FONT, MONO, initials } from '../../lib/theme'

const inputStyle = {
  width: '100%', padding: '8px 10px', borderRadius: 6, border: `1px solid ${C.border}`,
  font: `13px ${FONT}`, background: C.surface, color: C.ink,
}
function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ font: `10px ${MONO}`, letterSpacing: '.1em', color: C.muted }}>{label}</span>
      {children}
    </label>
  )
}

export default function ContactDetail() {
  const router = useRouter()
  const { id } = router.query
  const { data: contacts = [], mutate } = useSWR('/api/contacts')
  const list = Array.isArray(contacts) ? contacts : []
  const contact = list.find(c => String(c.id) === String(id))

  const [form, setForm] = useState(null)
  const [tagInput, setTagInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const loadedId = useRef(null)

  useEffect(() => {
    if (contact && loadedId.current !== contact.id) {
      loadedId.current = contact.id
      setForm({
        name: contact.name || '', email: contact.email || '', phone: contact.phone || '',
        website: contact.website || '', street: contact.street || '', city: contact.city || '',
        state: contact.state || '', country: contact.country || '', vat_number: contact.vat_number || '',
        notes: contact.notes || '', tags: contact.tags || [], parent_id: contact.parent_id || null,
        is_customer: !!contact.is_customer, is_supplier: !!contact.is_supplier,
      })
    }
  }, [contact])

  const companies = list.filter(c => c.kind === 'company').sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  const people = contact?.kind === 'company' ? list.filter(c => String(c.parent_id) === String(id)).sort((a, b) => (a.name || '').localeCompare(b.name || '')) : []
  const allTags = [...new Set(list.flatMap(c => c.tags || []))].sort()

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); setSaved(false) }
  function addTag(t) {
    const tag = t.trim()
    if (!tag) return
    if (!form.tags.includes(tag)) set('tags', [...form.tags, tag])
    setTagInput('')
  }
  function removeTag(t) { set('tags', form.tags.filter(x => x !== t)) }

  async function save() {
    setSaving(true)
    try {
      await fetch(`/api/contacts?id=${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      await mutate()
      setSaved(true)
    } finally { setSaving(false) }
  }
  async function addPerson() {
    const res = await fetch('/api/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'person', name: 'Nouveau contact', parent_id: Number(id) }) })
    const created = await res.json()
    await mutate()
    if (created?.id) router.push(`/clients/${created.id}`)
  }
  async function remove() {
    if (!confirm(`Supprimer « ${contact.name} » ?`)) return
    await fetch(`/api/contacts?id=${id}`, { method: 'DELETE' })
    await mutate()
    router.push('/clients')
  }
  async function toggleArchive() {
    await fetch(`/api/contacts?id=${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived: !contact.archived }) })
    await mutate()
    router.push('/clients')
  }

  if (!contact || !form) {
    return (
      <div className="min-h-screen" style={{ background: C.pageBg, fontFamily: FONT }}>
        <main style={{ padding: '26px 32px' }}>
          <Link href="/clients" style={{ font: `10px ${MONO}`, letterSpacing: '.1em', color: C.muted, textDecoration: 'none' }}>← CLIENTS</Link>
          <p style={{ color: C.muted, fontSize: 13, marginTop: 20 }}>{contacts.length ? 'Contact introuvable.' : 'Chargement…'}</p>
        </main>
      </div>
    )
  }

  const isCompany = contact.kind === 'company'
  const parent = !isCompany && contact.parent_id ? list.find(c => String(c.id) === String(contact.parent_id)) : null

  return (
    <div className="min-h-screen" style={{ background: C.pageBg, fontFamily: FONT, color: C.ink }}>
      <Head><title>{contact.name} — Contacts</title></Head>
      <main style={{ padding: '22px 32px 40px', maxWidth: 900 }}>
        {/* Fil d'Ariane */}
        <Link href="/clients" style={{ font: `10px ${MONO}`, letterSpacing: '.1em', color: C.muted, textDecoration: 'none' }}>
          ← CLIENTS / {isCompany ? 'SOCIÉTÉ' : 'CONTACT'}
        </Link>

        {/* En-tête */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '14px 0 22px' }}>
          <div style={{ width: 44, height: 44, borderRadius: isCompany ? 10 : '50%', background: C.ink, color: C.accentOnDark, display: 'flex', alignItems: 'center', justifyContent: 'center', font: `13px ${MONO}`, fontWeight: 700, flex: 'none' }}>{initials(form.name)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <input value={form.name} onChange={e => set('name', e.target.value)}
              style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-.4px', border: 'none', background: 'transparent', color: C.ink, width: '100%', outline: 'none', fontFamily: FONT }} />
            {parent && <Link href={`/clients/${parent.id}`} style={{ font: `11px ${MONO}`, color: C.muted, textDecoration: 'none' }}>↳ {parent.name}</Link>}
          </div>
          <button onClick={save} disabled={saving}
            style={{ background: C.ink, color: C.accentOnDark, font: `600 12.5px ${FONT}`, padding: '9px 18px', borderRadius: 5, border: 'none', cursor: 'pointer', opacity: saving ? 0.5 : 1 }}>
            {saving ? 'Enregistrement…' : saved ? '✓ Enregistré' : 'Enregistrer'}
          </button>
        </div>

        {/* Rôles + tags */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['Client', 'Fournisseur'].map(rt => {
              const active = form.tags.includes(rt)
              const on = rt === 'Client' ? { fg: C.success, bg: C.successBg } : { fg: C.warning, bg: C.warningBg }
              return (
                <button key={rt} onClick={() => active ? removeTag(rt) : addTag(rt)}
                  style={{ font: `11px ${MONO}`, padding: '4px 12px', borderRadius: 99, cursor: 'pointer', textTransform: 'uppercase',
                    color: active ? on.fg : C.faint, background: active ? on.bg : 'transparent', border: `1px solid ${active ? 'transparent' : C.border}` }}>{rt}</button>
              )
            })}
          </div>
          {/* Tags */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ font: `10px ${MONO}`, letterSpacing: '.1em', color: C.muted }}>TAGS</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {form.tags.filter(t => t !== 'Client' && t !== 'Fournisseur').map(t => (
                <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: C.violet, background: C.violetBg, padding: '3px 6px 3px 10px', borderRadius: 99 }}>
                  {t}
                  <button onClick={() => removeTag(t)} style={{ border: 'none', background: 'none', color: C.violet, cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
                </span>
              ))}
              <input list="tag-suggestions" value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput) } }}
                onBlur={() => tagInput && addTag(tagInput)}
                placeholder="+ tag (Entrée)"
                style={{ ...inputStyle, width: 140, padding: '4px 8px' }} />
              <datalist id="tag-suggestions">{allTags.map(t => <option key={t} value={t} />)}</datalist>
            </div>
          </div>
        </div>

        {/* Coordonnées */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <Field label="E-MAIL"><input style={inputStyle} value={form.email} onChange={e => set('email', e.target.value)} /></Field>
            <Field label="TÉLÉPHONE"><input style={inputStyle} value={form.phone} onChange={e => set('phone', e.target.value)} /></Field>
            <Field label="SITE WEB"><input style={inputStyle} value={form.website} onChange={e => set('website', e.target.value)} /></Field>
            <Field label="N° TVA"><input style={inputStyle} value={form.vat_number} onChange={e => set('vat_number', e.target.value)} /></Field>
            <Field label="RUE"><input style={inputStyle} value={form.street} onChange={e => set('street', e.target.value)} /></Field>
            <Field label="VILLE"><input style={inputStyle} value={form.city} onChange={e => set('city', e.target.value)} /></Field>
            <Field label="RÉGION / CANTON"><input style={inputStyle} value={form.state} onChange={e => set('state', e.target.value)} /></Field>
            <Field label="PAYS"><input style={inputStyle} value={form.country} onChange={e => set('country', e.target.value)} /></Field>
            {!isCompany && (
              <Field label="SOCIÉTÉ">
                <select style={inputStyle} value={form.parent_id || ''} onChange={e => set('parent_id', e.target.value ? Number(e.target.value) : null)}>
                  <option value="">— aucune —</option>
                  {companies.map(co => <option key={co.id} value={co.id}>{co.name}</option>)}
                </select>
              </Field>
            )}
          </div>
        </div>

        {/* Notes */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <Field label="NOTES">
            <textarea style={{ ...inputStyle, minHeight: 90, resize: 'vertical', lineHeight: 1.5 }} value={form.notes} onChange={e => set('notes', e.target.value)}
              placeholder="Conditions, interlocuteur clé, historique…" />
          </Field>
        </div>

        {/* Personnes de la société */}
        {isCompany && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>Contacts</span>
              <span style={{ font: `11px ${MONO}`, color: C.muted }}>{people.length}</span>
              <div style={{ flex: 1 }} />
              <button onClick={addPerson} style={{ font: `600 11.5px ${FONT}`, color: C.inkSecondary, background: 'none', border: `1px solid ${C.border}`, borderRadius: 5, padding: '6px 12px', cursor: 'pointer' }}>+ Ajouter une personne</button>
            </div>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '4px 16px' }}>
              {people.length === 0 ? (
                <p style={{ fontSize: 13, color: C.muted, padding: '12px 0' }}>Aucune personne rattachée.</p>
              ) : people.map((p, i) => (
                <Link key={p.id} href={`/clients/${p.id}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: i === people.length - 1 ? 'none' : `1px solid ${C.divider}`, textDecoration: 'none', color: C.ink }}>
                  <div style={{ width: 26, height: 26, borderRadius: '50%', background: C.divider, color: C.inkSecondary, display: 'flex', alignItems: 'center', justifyContent: 'center', font: `9px ${MONO}`, fontWeight: 700, flex: 'none' }}>{initials(p.name)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                    <div style={{ font: `10.5px ${MONO}`, color: C.muted }}>{[p.email, p.phone].filter(Boolean).join(' · ') || '—'}</div>
                  </div>
                  <span style={{ color: C.faintChevron, fontSize: 12 }}>→</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <button onClick={toggleArchive} style={{ font: `12px ${FONT}`, color: C.inkSecondary, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>{contact.archived ? 'Désarchiver' : 'Archiver ce contact'}</button>
          <button onClick={remove} style={{ font: `12px ${FONT}`, color: C.danger, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Supprimer</button>
        </div>
      </main>
    </div>
  )
}
