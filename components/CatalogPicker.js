import { useState, useRef, useEffect } from 'react'
import useSWR from 'swr'
import { fmtCHF } from '../lib/money'
import { AL, C, R } from '../lib/theme'

const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n }

// Prix de vente effectif d'un article : sale_price si défini, sinon prix
// d'achat majoré de la marge.
export function saleOf(item) {
  if (item?.sale_price != null && item.sale_price !== '') return num(item.sale_price)
  return num(item.purchase_price) * (1 + num(item.margin) / 100)
}
const round2 = n => Math.round(n * 100) / 100

// Ligne d'achat (le devis applique la marge) : on garde prix d'achat + marge.
export function toPurchaseRow(item) {
  return {
    description: item.name || '', dimension: '',
    unit_price: item.purchase_price ?? '', quantity: '1',
    unit: item.unit || '', margin: item.margin ?? '',
  }
}
// Ligne « au tarif » (gestion, main d'œuvre, sous-traitance, logistique) :
// rate = prix de vente effectif pour que le client voie ce tarif.
export function toRateRow(item) {
  return {
    description: item.name || '',
    rate: String(round2(saleOf(item))), quantity: '1',
    unit: item.unit || '',
  }
}

// Bouton « + Catalogue » qui ouvre un popover de recherche.
// kind: 'article' | 'heure' | 'all'. onPick(item) reçoit l'article brut.
export default function CatalogPicker({ kind = 'all', onPick, label = '+ Catalogue' }) {
  const { data: items = [] } = useSWR('/api/catalog')
  const list = Array.isArray(items) ? items : []
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const boxRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    function onDoc(e) { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 0) }, [open])

  const needle = q.trim().toLowerCase()
  const matches = list
    .filter(it => !it.archived)
    .filter(it => kind === 'all' ? true : kind === 'heure' ? it.type === 'heure' : it.type !== 'heure')
    .filter(it => !needle || [it.name, it.vendor, it.notes, it.unit].filter(Boolean).join(' ').toLowerCase().includes(needle))
    .slice(0, 60)

  function choose(it) { onPick(it); setOpen(false); setQ('') }

  const dd = { position: 'absolute', top: '100%', right: 0, marginTop: 4, width: 320, background: AL.white, border: '1px solid rgba(12,12,12,.08)', borderRadius: R.panel, boxShadow: '0 8px 24px rgba(0,0,0,.12)', zIndex: 60 }

  return (
    <div ref={boxRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ font: '600 11px system-ui', padding: '3px 8px', borderRadius: R.pill, cursor: 'pointer', border: `1px solid ${C.muted}`, background: AL.white, color: AL.black }}>
        {label}
      </button>
      {open && (
        <div style={dd}>
          <div style={{ padding: 8, borderBottom: '1px solid rgba(12,12,12,.06)' }}>
            <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher dans le catalogue…"
              style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid rgba(12,12,12,.08)', fontSize: 13, outline: 'none' }} />
          </div>
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {matches.length === 0 ? (
              <div style={{ padding: '12px', fontSize: 13, color: C.muted }}>Aucun article.</div>
            ) : matches.map(it => (
              <button key={it.id} type="button" onClick={() => choose(it)}
                style={{ display: 'flex', width: '100%', textAlign: 'left', gap: 10, alignItems: 'center', padding: '8px 12px', border: 'none', background: 'transparent', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = C.hover}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: AL.black, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name || 'Sans nom'}</span>
                  <span style={{ display: 'block', fontSize: 11, color: C.muted }}>
                    {[it.type === 'heure' ? 'Heure' : 'Article', it.unit, it.vendor].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: AL.black, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  {fmtCHF(saleOf(it))}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
