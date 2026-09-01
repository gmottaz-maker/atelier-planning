// Éditeur d'offre/devis — structure groupée { management, items[], subcontracting,
// logistics, general_margin }.
//
// Extrait tel quel de la page projet pour être partagé avec la page de facture :
// l'offre et la facture ont ainsi rigoureusement le même système et le même
// rendu, sans dérive possible entre les deux.
//
// Contrat : `value` est le devis, `onChange(next)` reçoit le devis modifié.
import { useState } from 'react'
import CatalogPicker, { toPurchaseRow, toRateRow } from './CatalogPicker'
import QtyInput from './QtyInput'
import { fmtCHF } from '../lib/money'
import { AL, C, FONT, R } from '../lib/theme'

// Styles partagés — le système n'a qu'une bordure (le filet outline 1.5px) et
// deux radius.
//
// ── Une teinte par section ───────────────────────────────────────────────────
// Une version précédente avait retiré les pastels au profit du seul titre. À
// l'usage ça ne suffit pas : dans Fabrication, un item niché était un rectangle
// blanc cerclé de noir EXACTEMENT comme la section qui le contient, et on ne
// savait plus à quel niveau on se trouvait. La couleur revient, mais prise dans
// les jetons et portée par trois choses seulement : le bandeau d'en-tête, le
// titre, et les actions de la section.
//
// Ce sont des tons de REPÉRAGE, pas de statut : aucun ne veut dire « erreur »
// ou « validé » ici, une offre n'a pas d'état ligne à ligne. Le corail est
// volontairement absent — le système en fait un accent typographique, jamais un
// aplat, et il ne passe pas le contraste sous 24px sur blanc.
const TEINTES = {
  management:     { fort: C.info,    doux: C.infoBg },
  fabrication:    { fort: C.violet,  doux: C.violetBg },
  subcontracting: { fort: C.warning, doux: C.warningBg },
  logistics:      { fort: C.success, doux: C.successBg },
}

const sectionBox    = { background: C.surface, border: `1.5px solid ${C.outline}`, borderRadius: R.panel, overflow: 'hidden' }
const sectionHeader = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 18px' }
const sectionTitle  = { fontSize: 16, fontWeight: 500, color: AL.black }
const sectionTotal  = { fontSize: 15, fontWeight: 500, color: AL.black, fontVariantNumeric: 'tabular-nums' }
const chevron       = (ouvert) => ({ fontSize: 12, color: C.muted, display: 'inline-block', transform: ouvert ? 'none' : 'rotate(-90deg)', transition: 'transform .15s ease' })

// L'item niché dans Fabrication est SUBORDONNÉ : filet fin et gris là où la
// section porte le filet noir de 1.5px. C'est cette différence d'épaisseur,
// plus que la couleur, qui dit lequel contient l'autre.
const itemBox       = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.panel, overflow: 'hidden' }
const itemHeader    = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', background: C.neutralBg }

// Achats / Main d'œuvre / Éléments : c'étaient dix caractères gris de 10.5px
// perdus au-dessus d'un tableau. Libellé noir et filet de séparation franc.
// Pas d'aplat ici : le seul aplat gris d'un item doit rester SON en-tête,
// sinon les deux niveaux se confondent — deux gris à 5 et 6 % ne se
// distinguent pas, c'était le défaut du premier essai.
const subHeader     = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '11px 16px', borderTop: `1.5px solid ${C.outline}` }
const subTitle      = { fontSize: 10.5, fontWeight: 500, letterSpacing: '.1em', textTransform: 'uppercase', color: AL.black }

const QUOTE_UNITS = ['heure(s)', 'jour(s)', 'ml', 'm²', 'km', 'PAN', 'pce']

function genRowUid()  { return `r_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` }
function genItemUid() { return `i_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` }
function emptyPurchaseRow()      { return { _uid: genRowUid(), description: '', dimension: '', unit_price: '', quantity: '', unit: '', margin: '', discount: '', discount_amount: '' } }
function emptyLaborRow()         { return { _uid: genRowUid(), item: '', description: '', rate: '100', quantity: '', unit: '', discount: '', discount_amount: '' } }
function emptyLogisticsRow()     { return { _uid: genRowUid(), trajet: '', description: '', rate: '', quantity: '', unit: '', margin: '', discount: '', discount_amount: '' } }
function emptySubcontractingRow(){ return { _uid: genRowUid(), item: '', description: '', rate: '', quantity: '', unit: '', margin: '', discount: '', discount_amount: '' } }

// Devis vierge : gestion de projet et logistique pré-remplies (mêmes valeurs
// que la création d'une offre depuis un projet).
export function defaultQuote() {
  return {
    management: [
      { _uid: genRowUid(), item: 'Projet',                  description: 'Gestion de projet générale, correspondances, commandes', rate: '120', quantity: '', unit: 'heure(s)' },
      { _uid: genRowUid(), item: 'Visuels & développement', description: 'Création de visuels, plans et développement tests',       rate: '140', quantity: '', unit: 'heure(s)' },
      { _uid: genRowUid(), item: 'Visite sur place',        description: 'Visite sur place',                                        rate: '100', quantity: '', unit: 'heure(s)' },
    ],
    items: [],
    subcontracting: [],
    logistics: [
      { _uid: genRowUid(), trajet: 'Trajet',    description: '', rate: '3',   quantity: '', unit: 'km',       margin: '' },
      { _uid: genRowUid(), trajet: 'Montage',   description: '', rate: '100', quantity: '', unit: 'heure(s)', margin: '' },
      { _uid: genRowUid(), trajet: 'Démontage', description: '', rate: '100', quantity: '', unit: 'heure(s)', margin: '' },
    ],
    general_margin: '20',
    status: 'brouillon',
    number: '',
  }
}

// Bascule de visibilité d'une ligne dans le document envoyé au client.
// La ligne reste dans le devis et dans TOUS les totaux : c'est un filtre
// d'affichage, pas une suppression. C'est ce qui permet de chiffrer au détail
// sans imposer au client une offre longue comme le bras.
function OeilVisibilite({ masquee, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={!masquee}
      title={masquee ? 'Masquée sur le document — cliquer pour afficher' : 'Visible sur le document — cliquer pour masquer'}
      className="quote-action" style={{ fontSize: 13, lineHeight: 1, opacity: masquee ? .45 : 1 }}
    >
      {masquee ? '☐' : '☑'}
    </button>
  )
}


// Composition d'un ÉLÉMENT : matériaux et heures qui le constituent.
// Table volontairement plus compacte que celle d'un item — à ce niveau on
// chiffre, on ne rédige pas l'offre. Les colonnes de calcul (marge, escompte)
// restent présentes : c'est là que se fait le prix.
function CompositionElement({
  element, generalMargin, fmtCHF, purchaseNet, laborNet, th, td, tdRO, txtCell, numCell, QUOTE_UNITS,
  onAdd, onUpdate, onRemove, onToggleHidden,
}) {
  const lignes = [
    ...(element.purchases || []).map((r, i) => ({ r, i, kind: 'purchases' })),
    ...(element.labor || []).map((r, i) => ({ r, i, kind: 'labor' })),
  ]
  return (
    <div className="overflow-x-auto">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, padding: '8px 14px', borderTop: `1px solid ${C.border}` }}>
        <button onClick={() => onAdd('purchases')} className="quote-action" style={{ '--qa': TEINTES.fabrication.fort }}>+ Matériau</button>
        <button onClick={() => onAdd('labor')} className="quote-action" style={{ '--qa': TEINTES.fabrication.fort }}>+ Main d'œuvre</button>
      </div>
      <table className="w-full" style={{ minWidth: 760, tableLayout: 'fixed' }}>
        <thead>
          <tr>
            <th className={th} style={{ width: '30%' }}>Description</th>
            <th className={th + ' text-right'} style={{ width: '12%' }}>Prix</th>
            <th className={th + ' text-right'} style={{ width: '9%' }}>Qté</th>
            <th className={th} style={{ width: '10%' }}>Unité</th>
            <th className={th + ' text-right'} style={{ width: '9%' }}>Marge %</th>
            <th className={th + ' text-right'} style={{ width: '9%' }}>Esc.&nbsp;%</th>
            <th className={th + ' text-right'} style={{ width: '14%' }}>Total</th>
            <th className={th} style={{ width: '7%' }}></th>
          </tr>
        </thead>
        <tbody>
          {lignes.length === 0 ? (
            <tr><td colSpan={8} className="text-center text-sm u-muted py-3">Aucune composition.</td></tr>
          ) : lignes.map(({ r, i, kind }) => {
            const achat = kind === 'purchases'
            return (
              <tr key={`${kind}-${r._uid || i}`} className={'group quote-row' + (r.hidden ? ' opacity-60' : '')}>
                <td className={td}>
                  <input className={txtCell} placeholder={achat ? 'Matériau' : 'Main d\'œuvre'}
                    value={r.description || ''} onChange={e => onUpdate(kind, i, 'description', e.target.value)} />
                </td>
                <td className={td}>
                  <input type="number" step="0.01" className={numCell}
                    value={(achat ? r.unit_price : r.rate) || ''}
                    onChange={e => onUpdate(kind, i, achat ? 'unit_price' : 'rate', e.target.value)} />
                </td>
                <td className={td}><QtyInput className={numCell} value={r.quantity} onChange={v => onUpdate(kind, i, 'quantity', v)} /></td>
                <td className={td}>
                  <select className={txtCell} value={r.unit || ''} onChange={e => onUpdate(kind, i, 'unit', e.target.value)}>
                    <option value="">—</option>{QUOTE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </td>
                <td className={td}>
                  {achat
                    ? <input type="number" step="0.1" className={numCell} placeholder={generalMargin || ''} value={r.margin || ''} onChange={e => onUpdate(kind, i, 'margin', e.target.value)} />
                    : <span className="block text-center u-muted">—</span>}
                </td>
                <td className={td}><input type="number" step="0.1" className={numCell} placeholder="0" value={r.discount || ''} onChange={e => onUpdate(kind, i, 'discount', e.target.value)} /></td>
                <td className={tdRO + ' ' + td + ' font-semibold u-ink'}>{fmtCHF(achat ? purchaseNet(r) : laborNet(r))}</td>
                <td className={td + ' text-center'}>
                  <span className="inline-flex items-center gap-2">
                    <OeilVisibilite masquee={!!r.hidden} onToggle={() => onToggleHidden(kind, i)} />
                    <button onClick={() => onRemove(kind, i)} className="u-muted hover:u-ko opacity-0 group-hover:opacity-100 text-sm">×</button>
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function QuoteEditor({ value, onChange }) {
  // Le bloc JSX ci-dessous provient de la page projet : on lui redonne
  // exactement les noms qu'il utilisait (quote / setQuote / setQuoteDirty)
  // pour qu'il fonctionne sans la moindre retouche.
  // Tolère un devis absent (facture sans positions) plutôt que de planter.
  const quote = value || { management: [], items: [], subcontracting: [], logistics: [], general_margin: '' }
  const setQuote = updater => onChange(typeof updater === 'function' ? updater(quote) : updater)
  const setQuoteDirty = () => {}   // le parent gère l'état « non enregistré » via onChange

  const [collapsedSections, setCollapsedSections] = useState({})
  const [collapsedItems, setCollapsedItems]       = useState({})
  const toggleCollapsedSection = k => setCollapsedSections(s => ({ ...s, [k]: !s[k] }))
  const toggleCollapsedItem    = k => setCollapsedItems(s => ({ ...s, [k]: !s[k] }))

  // ── Math (identique à la page projet et à lib/devisHtml) ──
  function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n }
  function effectiveMargin(r) {
    if (r?.margin !== '' && r?.margin != null) return num(r.margin)
    return num(quote.general_margin)
  }
  function purchaseTotal(r)  { return num(r.unit_price) * num(r.quantity) }
  function purchaseBilled(r) { return purchaseTotal(r) * (1 + effectiveMargin(r) / 100) }
  function serviceTotal(r)   { return num(r.rate) * num(r.quantity) }
  function serviceBilled(r)  { return serviceTotal(r) * (1 + effectiveMargin(r) / 100) }
  // La logistique n'hérite PAS de la marge générale : 0 % sauf marge sur la ligne
  function effectiveMarginLogistics(r) { return (r?.margin !== '' && r?.margin != null) ? num(r.margin) : 0 }
  function serviceBilledLogistics(r)   { return serviceTotal(r) * (1 + effectiveMarginLogistics(r) / 100) }
  function applyDiscount(amt, r) { return Math.max(0, amt * (1 - num(r.discount) / 100) - num(r.discount_amount)) }
  function purchaseNet(r)   { return applyDiscount(purchaseBilled(r), r) }
  function laborNet(r)      { return applyDiscount(serviceTotal(r), r) }
  function serviceNet(r)    { return applyDiscount(serviceBilled(r), r) }
  function logisticsNet(r)  { return applyDiscount(serviceBilledLogistics(r), r) }
  function itemTotal(it) {
    const compo = p => (p.purchases || []).reduce((s, r) => s + purchaseNet(r), 0)
                     + (p.labor     || []).reduce((s, r) => s + laborNet(r), 0)
    return compo(it) + (it.elements || []).reduce((s, el) => s + compo(el), 0)
  }

  // ── Gestion ──
  function addManagementRow()   { setQuote(q => ({ ...q, management: [...q.management, emptyLaborRow()] })); setQuoteDirty(true) }
  function updateManagementRow(idx, field, v) { setQuote(q => ({ ...q, management: q.management.map((r, i) => i === idx ? { ...r, [field]: v } : r) })); setQuoteDirty(true) }
  const toggleRowHidden = (liste, idx) => {
    setQuote(q => ({ ...q, [liste]: (q[liste] || []).map((r, i) => i === idx ? { ...r, hidden: !r.hidden } : r) }))
    setQuoteDirty(true)
  }
  function removeManagementRow(idx) { setQuote(q => ({ ...q, management: q.management.filter((_, i) => i !== idx) })); setQuoteDirty(true) }

  // ── Logistique ──
  function addLogisticsRow()    { setQuote(q => ({ ...q, logistics: [...q.logistics, emptyLogisticsRow()] })); setQuoteDirty(true) }
  function updateLogisticsRow(idx, field, v) { setQuote(q => ({ ...q, logistics: q.logistics.map((r, i) => i === idx ? { ...r, [field]: v } : r) })); setQuoteDirty(true) }
  function removeLogisticsRow(idx) { setQuote(q => ({ ...q, logistics: q.logistics.filter((_, i) => i !== idx) })); setQuoteDirty(true) }

  // ── Sous-traitance ──
  function addSubcontractingRow() { setQuote(q => ({ ...q, subcontracting: [...(q.subcontracting || []), emptySubcontractingRow()] })); setQuoteDirty(true) }
  function updateSubcontractingRow(idx, field, v) { setQuote(q => ({ ...q, subcontracting: (q.subcontracting || []).map((r, i) => i === idx ? { ...r, [field]: v } : r) })); setQuoteDirty(true) }
  function removeSubcontractingRow(idx) { setQuote(q => ({ ...q, subcontracting: (q.subcontracting || []).filter((_, i) => i !== idx) })); setQuoteDirty(true) }

  // ── Items (Bar, Pergola…) ──
  function addItem() { setQuote(q => ({ ...q, items: [...q.items, { _uid: genItemUid(), name: '', purchases: [], labor: [] }] })); setQuoteDirty(true) }
  function updateItemName(idx, name) { setQuote(q => ({ ...q, items: q.items.map((it, i) => i === idx ? { ...it, name } : it) })); setQuoteDirty(true) }
  function removeItem(idx) { setQuote(q => ({ ...q, items: q.items.filter((_, i) => i !== idx) })); setQuoteDirty(true) }
  function addItemRow(itemIdx, kind) {
    // La composition sert au chiffrage : elle part masquée, on l'affiche au cas
    // par cas. Les lignes déjà en base n'ont pas ce marqueur et restent
    // visibles — les offres existantes ne changent pas d'apparence.
    const empty = { ...(kind === 'purchases' ? emptyPurchaseRow() : emptyLaborRow()), hidden: true }
    setQuote(q => ({ ...q, items: q.items.map((it, i) => i === itemIdx ? { ...it, [kind]: [...(it[kind] || []), empty] } : it) }))
    setQuoteDirty(true)
  }
  function updateItemRow(itemIdx, kind, rowIdx, field, v) {
    setQuote(q => ({ ...q, items: q.items.map((it, i) => i === itemIdx
      ? { ...it, [kind]: it[kind].map((r, j) => j === rowIdx ? { ...r, [field]: v } : r) } : it) }))
    setQuoteDirty(true)
  }
  // ── Éléments (niveau intermédiaire entre l'item et sa composition) ────────
  const majItem = (itemIdx, fn) => {
    setQuote(q => ({ ...q, items: q.items.map((it, i) => i === itemIdx ? fn(it) : it) }))
    setQuoteDirty(true)
  }
  const majElement = (itemIdx, elIdx, fn) =>
    majItem(itemIdx, it => ({ ...it, elements: (it.elements || []).map((el, j) => j === elIdx ? fn(el) : el) }))

  function addElement(itemIdx) {
    majItem(itemIdx, it => ({ ...it, elements: [...(it.elements || []), { _uid: genItemUid(), name: '', purchases: [], labor: [] }] }))
  }
  function removeElement(itemIdx, elIdx) {
    majItem(itemIdx, it => ({ ...it, elements: (it.elements || []).filter((_, j) => j !== elIdx) }))
  }
  function addElementRow(itemIdx, elIdx, kind) {
    const empty = { ...(kind === 'purchases' ? emptyPurchaseRow() : emptyLaborRow()), hidden: true }
    majElement(itemIdx, elIdx, el => ({ ...el, [kind]: [...(el[kind] || []), empty] }))
  }
  function updateElementRow(itemIdx, elIdx, kind, rowIdx, field, v) {
    majElement(itemIdx, elIdx, el => ({ ...el, [kind]: el[kind].map((r, k) => k === rowIdx ? { ...r, [field]: v } : r) }))
  }
  function removeElementRow(itemIdx, elIdx, kind, rowIdx) {
    majElement(itemIdx, elIdx, el => ({ ...el, [kind]: el[kind].filter((_, k) => k !== rowIdx) }))
  }
  function toggleElementRowHidden(itemIdx, elIdx, kind, rowIdx) {
    majElement(itemIdx, elIdx, el => ({ ...el, [kind]: el[kind].map((r, k) => k === rowIdx ? { ...r, hidden: !r.hidden } : r) }))
  }

  function toggleItemRowHidden(itemIdx, kind, rowIdx) {
    setQuote(q => ({ ...q, items: q.items.map((it, i) => i === itemIdx
      ? { ...it, [kind]: it[kind].map((r, j) => j === rowIdx ? { ...r, hidden: !r.hidden } : r) }
      : it) }))
    setQuoteDirty(true)
  }
  /** Masque ou affiche toute la composition d'un item d'un seul geste. */
  function toggleItemComposition(itemIdx, masquer) {
    setQuote(q => ({ ...q, items: q.items.map((it, i) => i === itemIdx ? {
      ...it,
      purchases: (it.purchases || []).map(r => ({ ...r, hidden: masquer })),
      labor: (it.labor || []).map(r => ({ ...r, hidden: masquer })),
    } : it) }))
    setQuoteDirty(true)
  }
  function removeItemRow(itemIdx, kind, rowIdx) {
    setQuote(q => ({ ...q, items: q.items.map((it, i) => i === itemIdx
      ? { ...it, [kind]: it[kind].filter((_, j) => j !== rowIdx) } : it) }))
    setQuoteDirty(true)
  }

  // ── Lignes pré-remplies depuis le catalogue ──
  function appendManagementRow(pre)     { setQuote(q => ({ ...q, management: [...q.management, { ...emptyLaborRow(), ...pre }] })); setQuoteDirty(true) }
  function appendLogisticsRow(pre)      { setQuote(q => ({ ...q, logistics: [...q.logistics, { ...emptyLogisticsRow(), ...pre }] })); setQuoteDirty(true) }
  function appendSubcontractingRow(pre) { setQuote(q => ({ ...q, subcontracting: [...(q.subcontracting || []), { ...emptySubcontractingRow(), ...pre }] })); setQuoteDirty(true) }
  function appendItemRow(itemIdx, kind, pre) {
    const base = { ...(kind === 'purchases' ? emptyPurchaseRow() : emptyLaborRow()), hidden: true }
    setQuote(q => ({ ...q, items: q.items.map((it, i) => i === itemIdx ? { ...it, [kind]: [...(it[kind] || []), { ...base, ...pre }] } : it) }))
    setQuoteDirty(true)
  }

  const managementTotal     = (quote.management || []).reduce((s, r) => s + laborNet(r), 0)
  const itemsTotal          = (quote.items || []).reduce((s, it) => s + itemTotal(it), 0)
  const subcontractingTotal = (quote.subcontracting || []).reduce((s, r) => s + serviceNet(r), 0)
  const logisticsTotal      = (quote.logistics || []).reduce((s, r) => s + logisticsNet(r), 0)
  const grandTotal          = managementTotal + itemsTotal + subcontractingTotal + logisticsTotal

  const numCell = "px-2 py-1.5 text-sm bg-transparent text-right tabular-nums w-full quote-cell focus:outline-none"
  const txtCell = "px-2 py-1.5 text-sm bg-transparent w-full quote-cell focus:outline-none"
  const th = "quote-th px-3 py-2 text-left align-middle"
  const td = "quote-td align-middle"
  // Une seule feuille locale : les états de survol et de focus des cellules ne
  // sont pas exprimables en style inline.
  const styleLocal = `
    .quote-action { font-size: 12px; font-weight: 500; color: var(--qa, ${C.muted}); background: none; border: none; padding: 0; cursor: pointer; transition: color .15s ease; }
    .quote-action:hover { color: ${AL.black}; }
    .quote-td { border-top: 1px solid ${C.border}; }
    .quote-row:hover { background: ${C.hover}; }
    .quote-th { font-size: 10.5px; font-weight: 500; letter-spacing: .1em; text-transform: uppercase; color: ${C.muted}; border-bottom: 1.5px solid ${C.outline}; }
    .quote-cell:focus { background: ${C.surface}; outline: 1.5px solid ${C.outline}; border-radius: 6px; }
  `
  const tdRO = "px-3 py-1.5 text-sm text-right u-ink tabular-nums"

  return (
    <>
      <style>{styleLocal}</style>
                    {/* ── Marge générale ── */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', border: `1.5px solid ${C.outline}`, borderRadius: R.panel, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 500, color: AL.black }}>Marge générale</span>
                      <input
                        type="number"
                        step="0.1"
                        style={{ width: 88, padding: '6px 12px', textAlign: 'right', borderRadius: R.pill, border: `1.5px solid ${C.border}`, fontFamily: FONT, fontSize: 14, color: C.accent, fontVariantNumeric: 'tabular-nums', outline: 'none' }}
                        placeholder="0"
                        value={quote.general_margin ?? ''}
                        onChange={e => { setQuote(q => ({ ...q, general_margin: e.target.value })); setQuoteDirty(true) }}
                      />
                      <span style={{ fontSize: 14, color: C.accent }}>%</span>
                      <span style={{ fontSize: 12.5, color: C.muted, marginLeft: 8 }}>S'applique aux achats et à la sous-traitance. Une marge spécifique sur une ligne prend le dessus.</span>
                    </div>

                    {/* ── Gestion projet ── */}
                    <div style={sectionBox}>
                      <div style={{ ...sectionHeader, background: TEINTES.management.doux,
                        borderBottom: collapsedSections.management ? 'none' : `1px solid ${C.border}` }}>
                        <button type="button" onClick={() => toggleCollapsedSection('management')}
                          className="flex items-center gap-2 flex-1 text-left hover:opacity-80">
                          <span style={chevron(!collapsedSections.management)}>▾</span>
                          <span style={{ ...sectionTitle, color: TEINTES.management.fort }}>Gestion projet</span>
                        </button>
                        <div className="flex items-center gap-4">
                          <span style={sectionTotal}>{fmtCHF(managementTotal)} CHF</span>
                          {!collapsedSections.management && (
                            <>
                              <CatalogPicker kind="heure" onPick={it => appendManagementRow(toRateRow(it))} />
                              <button onClick={addManagementRow}
                                className="quote-action" style={{ '--qa': TEINTES.management.fort }}>+ Ligne</button>
                            </>
                          )}
                        </div>
                      </div>
                      {!collapsedSections.management && (
                      <div className="overflow-x-auto">
                        <table className="w-full" style={{ minWidth: 800, tableLayout: 'fixed' }}>
                          <thead>
                            <tr>
                              <th className={th} style={{ width: '15%' }}>Item</th>
                              <th className={th} style={{ width: '22%' }}>Description</th>
                              <th className={th + ' text-right'} style={{ width: '11%' }}>Prix</th>
                              <th className={th + ' text-right'} style={{ width: '7%' }}>Qté</th>
                              <th className={th} style={{ width: '9%' }}>Unité</th>
                              <th className={th + ' text-right'} style={{ width: '9%' }}>Esc.&nbsp;%</th>
                              <th className={th + ' text-right'} style={{ width: '10%' }}>Esc.&nbsp;CHF</th>
                              <th className={th + ' text-right'} style={{ width: '13%' }}>Total</th>
                              <th className={th} style={{ width: '4%' }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {quote.management.length === 0 ? (
                              <tr><td colSpan={9} className="text-center text-sm u-muted py-6">Aucune ligne. Clique "+ Ligne" pour ajouter.</td></tr>
                            ) : quote.management.map((r, i) => (
                              <tr key={r._uid || i} className="group quote-row">
                                <td className={td}><input className={txtCell} style={{ background: C.neutralBg, fontWeight: 500 }} value={r.item || ''} onChange={e => updateManagementRow(i, 'item', e.target.value)} /></td>
                                <td className={td}><input className={txtCell} value={r.description || ''} onChange={e => updateManagementRow(i, 'description', e.target.value)} /></td>
                                <td className={td}><input type="number" step="0.01" className={numCell} value={r.rate || ''} onChange={e => updateManagementRow(i, 'rate', e.target.value)} /></td>
                                <td className={td}><QtyInput className={numCell} value={r.quantity} onChange={v => updateManagementRow(i, 'quantity', v)} /></td>
                                <td className={td}><select className={txtCell} value={r.unit || ''} onChange={e => updateManagementRow(i, 'unit', e.target.value)}><option value="">—</option>{QUOTE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select></td>
                                <td className={td}><input type="number" step="0.1" className={numCell} placeholder="0" value={r.discount || ''} onChange={e => updateManagementRow(i, 'discount', e.target.value)} /></td>
                                <td className={td}><input type="number" step="0.01" className={numCell} placeholder="0" value={r.discount_amount || ''} onChange={e => updateManagementRow(i, 'discount_amount', e.target.value)} /></td>
                                <td className={tdRO + ' ' + td + ' font-semibold u-ink'}>{fmtCHF(laborNet(r))}</td>
                                <td className={td + ' text-center'}>
                                  <span className="inline-flex items-center gap-2">
                                    <OeilVisibilite masquee={!!r.hidden} onToggle={() => toggleRowHidden('management', i)} />
                                    <button onClick={() => removeManagementRow(i)} className="u-muted hover:u-ko opacity-0 group-hover:opacity-100 text-sm">×</button>
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          {quote.management.length > 0 && (
                            <tfoot>
                              <tr>
                                <td colSpan={7} style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, color: C.muted, borderTop: `1px solid ${C.border}` }}>Sous-total gestion</td>
                                <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 14, fontWeight: 500, color: AL.black, fontVariantNumeric: 'tabular-nums', borderTop: `1px solid ${C.border}` }}>{fmtCHF(managementTotal)}</td>
                                <td style={{ borderTop: `1px solid ${C.border}` }}></td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                      )}
                    </div>

                    {/* ── Fabrication (groupe d'items: Bar, Pergola, etc.) ── */}
                    <div style={sectionBox}>
                      <div style={{ ...sectionHeader, background: TEINTES.fabrication.doux,
                        borderBottom: collapsedSections.fabrication ? 'none' : `1px solid ${C.border}` }}>
                        <button type="button" onClick={() => toggleCollapsedSection('fabrication')}
                          className="flex items-center gap-2 flex-1 text-left hover:opacity-80">
                          <span style={chevron(!collapsedSections.fabrication)}>▾</span>
                          <span style={{ ...sectionTitle, color: TEINTES.fabrication.fort }}>Fabrication</span>
                        </button>
                        <span style={sectionTotal}>{fmtCHF(itemsTotal)} CHF</span>
                      </div>

                      {!collapsedSections.fabrication && (
                      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {quote.items.length === 0 && (
                          <div style={{ textAlign: 'center', padding: '24px 0', fontSize: 13, color: C.muted }}>Aucun item pour l'instant. Ajoute Bar, Pergola, etc.</div>
                        )}
                        {quote.items.map((it, itemIdx) => {
                          const purchSub = (it.purchases || []).reduce((s, r) => s + purchaseNet(r), 0)
                          const laborSub = (it.labor || []).reduce((s, r) => s + laborNet(r), 0)
                          const subTotal = purchSub + laborSub
                          return (
                            <div key={it._uid || itemIdx} style={itemBox}>
                              <div style={{ ...itemHeader, borderBottom: collapsedItems[it._uid] ? 'none' : `1px solid ${C.border}` }}>
                                <button type="button" onClick={() => toggleCollapsedItem(it._uid)}
                                  className="hover:opacity-70" title={collapsedItems[it._uid] ? 'Déplier' : 'Replier'}>
                                  <span style={chevron(!collapsedItems[it._uid])}>▾</span>
                                </button>
                                
                                <input
                                  style={{ flex: 1, minWidth: 0, padding: '4px 8px', border: 'none', background: 'transparent', outline: 'none', fontFamily: FONT, fontSize: 15, fontWeight: 500, color: AL.black }}
                                  placeholder="Nom de l'item (ex: Bar, Backbar…)"
                                  value={it.name || ''}
                                  onChange={e => updateItemName(itemIdx, e.target.value)}
                                />
                                <span style={{ ...sectionTotal, whiteSpace: 'nowrap' }}>{fmtCHF(subTotal)} CHF</span>
                                <button onClick={() => { if (confirm(`Supprimer l'item "${it.name || 'sans nom'}" ?`)) removeItem(itemIdx) }}
                                  className="quote-action" style={{ fontSize: 13 }} title="Supprimer cet item">✕</button>
                              </div>

                              {!collapsedItems[it._uid] && (
                              <>
                              {/* Achats de l'item */}
                              <div className="border-b u-line">
                                <div style={subHeader}>
                                  <h4 style={subTitle}>Achats (matériaux)</h4>
                                  <span className="flex items-center gap-2">
                                    <CatalogPicker kind="article" onPick={it => appendItemRow(itemIdx, 'purchases', toPurchaseRow(it))} />
                                    <button onClick={() => addItemRow(itemIdx, 'purchases')}
                                      className="quote-action" style={{ '--qa': TEINTES.fabrication.fort }}>+ Ligne</button>
                                  </span>
                                </div>
                            <div className="overflow-x-auto">
                              <table className="w-full" style={{ minWidth: 900, tableLayout: 'fixed' }}>
                                <thead>
                                  <tr>
                                    <th className={th} style={{ width: '24%' }}>Description</th>
                                    <th className={th} style={{ width: '12%' }}>Dimension</th>
                                    <th className={th + ' text-right'} style={{ width: '11%' }}>Prix d'achat</th>
                                    <th className={th + ' text-right'} style={{ width: '7%' }}>Qté</th>
                                    <th className={th} style={{ width: '9%' }}>Unité</th>
                                    <th className={th + ' text-right'} style={{ width: '6%' }}>Total</th>
                                    <th className={th + ' text-right'} style={{ width: '6%' }}>Marge %</th>
                                    <th className={th + ' text-right'} style={{ width: '7%' }}>Esc.&nbsp;%</th>
                                    <th className={th + ' text-right'} style={{ width: '8%' }}>Esc.&nbsp;CHF</th>
                                    <th className={th + ' text-right'} style={{ width: '6%' }}>Total facturé</th>
                                    <th className={th} style={{ width: '4%' }}></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(it.purchases || []).length === 0 ? (
                                    <tr><td colSpan={11} className="text-center text-sm u-muted py-4">Aucun achat.</td></tr>
                                  ) : it.purchases.map((r, i) => (
                                    <tr key={r._uid || i} className="group quote-row">
                                      <td className={td}><input className={txtCell} value={r.description || ''} onChange={e => updateItemRow(itemIdx, 'purchases', i, 'description', e.target.value)} /></td>
                                      <td className={td}><input className={txtCell} placeholder="ex: 200×120×40" value={r.dimension || ''} onChange={e => updateItemRow(itemIdx, 'purchases', i, 'dimension', e.target.value)} /></td>
                                      <td className={td}><input type="number" step="0.01" className={numCell} value={r.unit_price || ''} onChange={e => updateItemRow(itemIdx, 'purchases', i, 'unit_price', e.target.value)} /></td>
                                      <td className={td}><QtyInput className={numCell} value={r.quantity} onChange={v => updateItemRow(itemIdx, 'purchases', i, 'quantity', v)} /></td>
                                      <td className={td}><select className={txtCell} value={r.unit || ''} onChange={e => updateItemRow(itemIdx, 'purchases', i, 'unit', e.target.value)}><option value="">—</option>{QUOTE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select></td>
                                      <td className={tdRO + ' ' + td}>{fmtCHF(purchaseTotal(r))}</td>
                                      <td className={td}><input type="number" step="0.1" className={numCell} value={r.margin || ''} placeholder={quote.general_margin || ''} onChange={e => updateItemRow(itemIdx, 'purchases', i, 'margin', e.target.value)} /></td>
                                      <td className={td}><input type="number" step="0.1" className={numCell} placeholder="0" value={r.discount || ''} onChange={e => updateItemRow(itemIdx, 'purchases', i, 'discount', e.target.value)} /></td>
                                      <td className={td}><input type="number" step="0.01" className={numCell} placeholder="0" value={r.discount_amount || ''} onChange={e => updateItemRow(itemIdx, 'purchases', i, 'discount_amount', e.target.value)} /></td>
                                      <td className={tdRO + ' ' + td + ' font-semibold u-ink'}>{fmtCHF(purchaseNet(r))}</td>
                                      <td className={td + ' text-center'}>
                                        <span className="inline-flex items-center gap-2">
                                          <OeilVisibilite masquee={!!r.hidden} onToggle={() => toggleItemRowHidden(itemIdx, 'purchases', i)} />
                                          <button onClick={() => removeItemRow(itemIdx, 'purchases', i)} className="u-muted hover:u-ko opacity-0 group-hover:opacity-100 text-sm">×</button>
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                                {(it.purchases || []).length > 0 && (
                                  <tfoot>
                                    <tr>
                                      <td colSpan={9} style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, color: C.muted, borderTop: `1px solid ${C.border}` }}>Sous-total achats</td>
                                      <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 14, fontWeight: 500, color: AL.black, fontVariantNumeric: 'tabular-nums', borderTop: `1px solid ${C.border}` }}>{fmtCHF(purchSub)}</td>
                                      <td style={{ borderTop: `1px solid ${C.border}` }}></td>
                                    </tr>
                                  </tfoot>
                                )}
                              </table>
                            </div>
                          </div>

                          {/* Main d'œuvre de l'item */}
                          <div>
                            <div style={subHeader}>
                              <h4 style={subTitle}>Main d'œuvre (découpe, peinture…)</h4>
                              <span className="flex items-center gap-2">
                                <CatalogPicker kind="heure" onPick={it => appendItemRow(itemIdx, 'labor', toRateRow(it))} />
                                <button onClick={() => addItemRow(itemIdx, 'labor')}
                                  className="quote-action" style={{ '--qa': TEINTES.fabrication.fort }}>+ Ligne</button>
                              </span>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full" style={{ minWidth: 800, tableLayout: 'fixed' }}>
                                <thead>
                                  <tr>
                                    <th className={th} style={{ width: '33%' }}>Description</th>
                                    <th className={th + ' text-right'} style={{ width: '12%' }}>Prix</th>
                                    <th className={th + ' text-right'} style={{ width: '7%' }}>Qté</th>
                                    <th className={th} style={{ width: '9%' }}>Unité</th>
                                    <th className={th + ' text-right'} style={{ width: '9%' }}>Esc.&nbsp;%</th>
                                    <th className={th + ' text-right'} style={{ width: '10%' }}>Esc.&nbsp;CHF</th>
                                    <th className={th + ' text-right'} style={{ width: '16%' }}>Total</th>
                                    <th className={th} style={{ width: '4%' }}></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(it.labor || []).length === 0 ? (
                                    <tr><td colSpan={8} className="text-center text-sm u-muted py-4">Aucune main d'œuvre.</td></tr>
                                  ) : it.labor.map((r, i) => (
                                    <tr key={r._uid || i} className="group quote-row">
                                      <td className={td}><input className={txtCell} value={r.description || ''} onChange={e => updateItemRow(itemIdx, 'labor', i, 'description', e.target.value)} /></td>
                                      <td className={td}><input type="number" step="0.01" className={numCell} value={r.rate || ''} onChange={e => updateItemRow(itemIdx, 'labor', i, 'rate', e.target.value)} /></td>
                                      <td className={td}><QtyInput className={numCell} value={r.quantity} onChange={v => updateItemRow(itemIdx, 'labor', i, 'quantity', v)} /></td>
                                      <td className={td}><select className={txtCell} value={r.unit || ''} onChange={e => updateItemRow(itemIdx, 'labor', i, 'unit', e.target.value)}><option value="">—</option>{QUOTE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select></td>
                                      <td className={td}><input type="number" step="0.1" className={numCell} placeholder="0" value={r.discount || ''} onChange={e => updateItemRow(itemIdx, 'labor', i, 'discount', e.target.value)} /></td>
                                      <td className={td}><input type="number" step="0.01" className={numCell} placeholder="0" value={r.discount_amount || ''} onChange={e => updateItemRow(itemIdx, 'labor', i, 'discount_amount', e.target.value)} /></td>
                                      <td className={tdRO + ' ' + td + ' font-semibold u-ink'}>{fmtCHF(laborNet(r))}</td>
                                      <td className={td + ' text-center'}>
                                        <span className="inline-flex items-center gap-2">
                                          <OeilVisibilite masquee={!!r.hidden} onToggle={() => toggleItemRowHidden(itemIdx, 'labor', i)} />
                                          <button onClick={() => removeItemRow(itemIdx, 'labor', i)} className="u-muted hover:u-ko opacity-0 group-hover:opacity-100 text-sm">×</button>
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                                {(it.labor || []).length > 0 && (
                                  <tfoot>
                                    <tr>
                                      <td colSpan={6} style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, color: C.muted, borderTop: `1px solid ${C.border}` }}>Sous-total main d'œuvre</td>
                                      <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 14, fontWeight: 500, color: AL.black, fontVariantNumeric: 'tabular-nums', borderTop: `1px solid ${C.border}` }}>{fmtCHF(laborSub)}</td>
                                      <td style={{ borderTop: `1px solid ${C.border}` }}></td>
                                    </tr>
                                  </tfoot>
                                )}
                              </table>
                            </div>
                          </div>

                          {/* Éléments : niveau intermédiaire, avec leur propre composition */}
                          <div className="border-t u-line">
                            <div style={subHeader}>
                              <h4 style={subTitle}>Éléments</h4>
                              <button onClick={() => addElement(itemIdx)}
                                className="quote-action" style={{ '--qa': TEINTES.fabrication.fort }}>+ Élément</button>
                            </div>
                            {(it.elements || []).length === 0 ? (
                              <p className="px-4 py-2 text-xs u-muted">
                                Un élément regroupe une partie de l’item (Toiture, Structure…) et affiche son
                                prix au client ; sa composition sert au chiffrage et reste masquée par défaut.
                              </p>
                            ) : it.elements.map((el, elIdx) => {
                              const elTotal = (el.purchases || []).reduce((s, r) => s + purchaseNet(r), 0)
                                            + (el.labor || []).reduce((s, r) => s + laborNet(r), 0)
                              return (
                                <div key={el._uid || elIdx} className="mx-3 mb-3 u-panel border u-line overflow-hidden">
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderTop: `1px solid ${C.border}` }}>
                                    <input
                                      className="flex-1 px-2 py-1 text-sm font-semibold bg-transparent focus:outline-none focus:u-surface focus:u-line rounded"
                                      style={{ color: AL.black }}
                                      placeholder="Nom de l’élément (ex : Toiture, Structure…)"
                                      value={el.name || ''}
                                      onChange={e => majElement(itemIdx, elIdx, x => ({ ...x, name: e.target.value }))}
                                    />
                                    <span style={{ ...sectionTotal, whiteSpace: 'nowrap' }}>{fmtCHF(elTotal)} CHF</span>
                                    <button onClick={() => { if (confirm(`Supprimer l’élément « ${el.name || 'sans nom'} » ?`)) removeElement(itemIdx, elIdx) }}
                                      className="u-info hover:u-ko text-sm" title="Supprimer cet élément">✕</button>
                                  </div>
                                  <CompositionElement
                                    element={el}
                                    generalMargin={quote.general_margin}
                                    fmtCHF={fmtCHF} purchaseNet={purchaseNet} laborNet={laborNet}
                                    th={th} td={td} tdRO={tdRO} txtCell={txtCell} numCell={numCell}
                                    QUOTE_UNITS={QUOTE_UNITS}
                                    onAdd={kind => addElementRow(itemIdx, elIdx, kind)}
                                    onUpdate={(kind, i, f, v) => updateElementRow(itemIdx, elIdx, kind, i, f, v)}
                                    onRemove={(kind, i) => removeElementRow(itemIdx, elIdx, kind, i)}
                                    onToggleHidden={(kind, i) => toggleElementRowHidden(itemIdx, elIdx, kind, i)}
                                  />
                                </div>
                              )
                            })}
                          </div>
                          </>
                          )}
                            </div>
                          )
                        })}

                        {/* Bouton ajouter un item (à l'intérieur de Fabrication) */}
                        <button onClick={addItem}
                          style={{ width: '100%', padding: 14, borderRadius: R.panel, border: `1.5px dashed ${C.outline}`, background: 'none', cursor: 'pointer', fontFamily: FONT, fontSize: 13, color: C.muted }}
                          onMouseEnter={e => { e.currentTarget.style.color = AL.black }}
                          onMouseLeave={e => { e.currentTarget.style.color = C.muted }}>
                          + Ajouter un item
                        </button>
                      </div>
                      )}
                    </div>

                    {/* ── Sous-traitance ── */}
                    <div style={sectionBox}>
                      <div style={{ ...sectionHeader, background: TEINTES.subcontracting.doux,
                        borderBottom: collapsedSections.subcontracting ? 'none' : `1px solid ${C.border}` }}>
                        <button type="button" onClick={() => toggleCollapsedSection('subcontracting')}
                          className="flex items-center gap-2 flex-1 text-left hover:opacity-80">
                          <span style={chevron(!collapsedSections.subcontracting)}>▾</span>
                          <span style={{ ...sectionTitle, color: TEINTES.subcontracting.fort }}>Sous-traitance</span>
                        </button>
                        <div className="flex items-center gap-4">
                          <span style={sectionTotal}>{fmtCHF(subcontractingTotal)} CHF</span>
                          {!collapsedSections.subcontracting && (
                            <>
                              <CatalogPicker kind="all" onPick={it => appendSubcontractingRow(toRateRow(it))} />
                              <button onClick={addSubcontractingRow}
                                className="quote-action" style={{ '--qa': TEINTES.subcontracting.fort }}>+ Ligne</button>
                            </>
                          )}
                        </div>
                      </div>
                      {!collapsedSections.subcontracting && (
                      <div className="overflow-x-auto">
                        <table className="w-full" style={{ minWidth: 900, tableLayout: 'fixed' }}>
                          <thead>
                            <tr>
                              <th className={th} style={{ width: '13%' }}>Item</th>
                              <th className={th} style={{ width: '22%' }}>Description</th>
                              <th className={th + ' text-right'} style={{ width: '12%' }}>Prix</th>
                              <th className={th + ' text-right'} style={{ width: '7%' }}>Qté</th>
                              <th className={th} style={{ width: '9%' }}>Unité</th>
                              <th className={th + ' text-right'} style={{ width: '6%' }}>Marge %</th>
                              <th className={th + ' text-right'} style={{ width: '9%' }}>Esc.&nbsp;%</th>
                              <th className={th + ' text-right'} style={{ width: '10%' }}>Esc.&nbsp;CHF</th>
                              <th className={th + ' text-right'} style={{ width: '8%' }}>Total</th>
                              <th className={th} style={{ width: '4%' }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {(quote.subcontracting || []).length === 0 ? (
                              <tr><td colSpan={10} className="text-center text-sm u-muted py-6">Aucune ligne.</td></tr>
                            ) : quote.subcontracting.map((r, i) => (
                              <tr key={r._uid || i} className="group quote-row">
                                <td className={td}><input className={txtCell} style={{ background: C.neutralBg, fontWeight: 500 }} value={r.item || ''} onChange={e => updateSubcontractingRow(i, 'item', e.target.value)} /></td>
                                <td className={td}><input className={txtCell} value={r.description || ''} onChange={e => updateSubcontractingRow(i, 'description', e.target.value)} /></td>
                                <td className={td}><input type="number" step="0.01" className={numCell} value={r.rate || ''} onChange={e => updateSubcontractingRow(i, 'rate', e.target.value)} /></td>
                                <td className={td}><QtyInput className={numCell} value={r.quantity} onChange={v => updateSubcontractingRow(i, 'quantity', v)} /></td>
                                <td className={td}><select className={txtCell} value={r.unit || ''} onChange={e => updateSubcontractingRow(i, 'unit', e.target.value)}><option value="">—</option>{QUOTE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select></td>
                                <td className={td}><input type="number" step="0.1" className={numCell} value={r.margin || ''} placeholder={quote.general_margin || ''} onChange={e => updateSubcontractingRow(i, 'margin', e.target.value)} /></td>
                                <td className={td}><input type="number" step="0.1" className={numCell} placeholder="0" value={r.discount || ''} onChange={e => updateSubcontractingRow(i, 'discount', e.target.value)} /></td>
                                <td className={td}><input type="number" step="0.01" className={numCell} placeholder="0" value={r.discount_amount || ''} onChange={e => updateSubcontractingRow(i, 'discount_amount', e.target.value)} /></td>
                                <td className={tdRO + ' ' + td + ' font-semibold u-ink'}>{fmtCHF(serviceNet(r))}</td>
                                <td className={td + ' text-center'}>
                                  <span className="inline-flex items-center gap-2">
                                    <OeilVisibilite masquee={!!r.hidden} onToggle={() => toggleRowHidden('subcontracting', i)} />
                                    <button onClick={() => removeSubcontractingRow(i)} className="u-muted hover:u-ko opacity-0 group-hover:opacity-100 text-sm">×</button>
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          {(quote.subcontracting || []).length > 0 && (
                            <tfoot>
                              <tr>
                                <td colSpan={8} style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, color: C.muted, borderTop: `1px solid ${C.border}` }}>Sous-total sous-traitance</td>
                                <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 14, fontWeight: 500, color: AL.black, fontVariantNumeric: 'tabular-nums', borderTop: `1px solid ${C.border}` }}>{fmtCHF(subcontractingTotal)}</td>
                                <td style={{ borderTop: `1px solid ${C.border}` }}></td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                      )}
                    </div>

                    {/* ── Logistique ── */}
                    <div style={sectionBox}>
                      <div style={{ ...sectionHeader, background: TEINTES.logistics.doux,
                        borderBottom: collapsedSections.logistics ? 'none' : `1px solid ${C.border}` }}>
                        <button type="button" onClick={() => toggleCollapsedSection('logistics')}
                          className="flex items-center gap-2 flex-1 text-left hover:opacity-80">
                          <span style={chevron(!collapsedSections.logistics)}>▾</span>
                          <span style={{ ...sectionTitle, color: TEINTES.logistics.fort }}>Logistique</span>
                        </button>
                        <div className="flex items-center gap-4">
                          <span style={sectionTotal}>{fmtCHF(logisticsTotal)} CHF</span>
                          {!collapsedSections.logistics && (
                            <>
                              <CatalogPicker kind="all" onPick={it => appendLogisticsRow(toRateRow(it))} />
                              <button onClick={addLogisticsRow}
                                className="quote-action" style={{ '--qa': TEINTES.logistics.fort }}>+ Ligne</button>
                            </>
                          )}
                        </div>
                      </div>
                      {!collapsedSections.logistics && (
                      <div className="overflow-x-auto">
                        <table className="w-full" style={{ minWidth: 900, tableLayout: 'fixed' }}>
                          <thead>
                            <tr>
                              <th className={th} style={{ width: '13%' }}>Item</th>
                              <th className={th} style={{ width: '22%' }}>Description</th>
                              <th className={th + ' text-right'} style={{ width: '12%' }}>Prix</th>
                              <th className={th + ' text-right'} style={{ width: '7%' }}>Qté</th>
                              <th className={th} style={{ width: '9%' }}>Unité</th>
                              <th className={th + ' text-right'} style={{ width: '6%' }}>Marge %</th>
                              <th className={th + ' text-right'} style={{ width: '9%' }}>Esc.&nbsp;%</th>
                              <th className={th + ' text-right'} style={{ width: '10%' }}>Esc.&nbsp;CHF</th>
                              <th className={th + ' text-right'} style={{ width: '8%' }}>Total</th>
                              <th className={th} style={{ width: '4%' }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {quote.logistics.length === 0 ? (
                              <tr><td colSpan={10} className="text-center text-sm u-muted py-6">Aucune ligne.</td></tr>
                            ) : quote.logistics.map((r, i) => (
                              <tr key={r._uid || i} className="group quote-row">
                                <td className={td}><input className={txtCell} style={{ background: C.neutralBg, fontWeight: 500 }} value={r.trajet || ''} onChange={e => updateLogisticsRow(i, 'trajet', e.target.value)} /></td>
                                <td className={td}><input className={txtCell} value={r.description || ''} onChange={e => updateLogisticsRow(i, 'description', e.target.value)} /></td>
                                <td className={td}><input type="number" step="0.01" className={numCell} value={r.rate || ''} onChange={e => updateLogisticsRow(i, 'rate', e.target.value)} /></td>
                                <td className={td}><QtyInput className={numCell} value={r.quantity} onChange={v => updateLogisticsRow(i, 'quantity', v)} /></td>
                                <td className={td}><select className={txtCell} value={r.unit || ''} onChange={e => updateLogisticsRow(i, 'unit', e.target.value)}><option value="">—</option>{QUOTE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select></td>
                                <td className={td}><input type="number" step="0.1" className={numCell} value={r.margin || ''} placeholder="0" onChange={e => updateLogisticsRow(i, 'margin', e.target.value)} /></td>
                                <td className={td}><input type="number" step="0.1" className={numCell} placeholder="0" value={r.discount || ''} onChange={e => updateLogisticsRow(i, 'discount', e.target.value)} /></td>
                                <td className={td}><input type="number" step="0.01" className={numCell} placeholder="0" value={r.discount_amount || ''} onChange={e => updateLogisticsRow(i, 'discount_amount', e.target.value)} /></td>
                                <td className={tdRO + ' ' + td + ' font-semibold u-ink'}>{fmtCHF(logisticsNet(r))}</td>
                                <td className={td + ' text-center'}>
                                  <span className="inline-flex items-center gap-2">
                                    <OeilVisibilite masquee={!!r.hidden} onToggle={() => toggleRowHidden('logistics', i)} />
                                    <button onClick={() => removeLogisticsRow(i)} className="u-muted hover:u-ko opacity-0 group-hover:opacity-100 text-sm">×</button>
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          {quote.logistics.length > 0 && (
                            <tfoot>
                              <tr>
                                <td colSpan={8} style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, color: C.muted, borderTop: `1px solid ${C.border}` }}>Sous-total logistique</td>
                                <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 14, fontWeight: 500, color: AL.black, fontVariantNumeric: 'tabular-nums', borderTop: `1px solid ${C.border}` }}>{fmtCHF(logisticsTotal)}</td>
                                <td style={{ borderTop: `1px solid ${C.border}` }}></td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                      )}
                    </div>

                    {/* ── Total général ── */}
                    <div className="u-panel px-5 py-4 flex items-center justify-between" style={{ background: AL.black, color: 'white' }}>
                      <span className="text-sm font-medium uppercase tracking-wider opacity-80">Total général</span>
                      <span className="font-bold tabular-nums" style={{ fontSize: 24, letterSpacing: '-0.02em' }}>
                        {fmtCHF(grandTotal)} <span className="text-sm opacity-70 ml-1">CHF</span>
                      </span>
                    </div>
    </>
  )
}
