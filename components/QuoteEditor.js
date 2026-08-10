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
  function fmtCHF(n) { return new Intl.NumberFormat('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) }
  function itemTotal(it) {
    return (it.purchases || []).reduce((s, r) => s + purchaseNet(r), 0)
         + (it.labor     || []).reduce((s, r) => s + laborNet(r), 0)
  }

  // ── Gestion ──
  function addManagementRow()   { setQuote(q => ({ ...q, management: [...q.management, emptyLaborRow()] })); setQuoteDirty(true) }
  function updateManagementRow(idx, field, v) { setQuote(q => ({ ...q, management: q.management.map((r, i) => i === idx ? { ...r, [field]: v } : r) })); setQuoteDirty(true) }
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
    const empty = kind === 'purchases' ? emptyPurchaseRow() : emptyLaborRow()
    setQuote(q => ({ ...q, items: q.items.map((it, i) => i === itemIdx ? { ...it, [kind]: [...(it[kind] || []), empty] } : it) }))
    setQuoteDirty(true)
  }
  function updateItemRow(itemIdx, kind, rowIdx, field, v) {
    setQuote(q => ({ ...q, items: q.items.map((it, i) => i === itemIdx
      ? { ...it, [kind]: it[kind].map((r, j) => j === rowIdx ? { ...r, [field]: v } : r) } : it) }))
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
    const base = kind === 'purchases' ? emptyPurchaseRow() : emptyLaborRow()
    setQuote(q => ({ ...q, items: q.items.map((it, i) => i === itemIdx ? { ...it, [kind]: [...(it[kind] || []), { ...base, ...pre }] } : it) }))
    setQuoteDirty(true)
  }

  const managementTotal     = (quote.management || []).reduce((s, r) => s + laborNet(r), 0)
  const itemsTotal          = (quote.items || []).reduce((s, it) => s + itemTotal(it), 0)
  const subcontractingTotal = (quote.subcontracting || []).reduce((s, r) => s + serviceNet(r), 0)
  const logisticsTotal      = (quote.logistics || []).reduce((s, r) => s + logisticsNet(r), 0)
  const grandTotal          = managementTotal + itemsTotal + subcontractingTotal + logisticsTotal

  const numCell = "px-2 py-1.5 text-sm bg-transparent text-right tabular-nums w-full focus:outline-none focus:bg-white focus:ring-1 focus:ring-gray-300 rounded"
  const txtCell = "px-2 py-1.5 text-sm bg-transparent w-full focus:outline-none focus:bg-white focus:ring-1 focus:ring-gray-300 rounded"
  const th = "px-3 py-2 text-left text-xs font-semibold text-gray-700 bg-gray-100"
  const td = "border-t border-gray-100 align-middle"
  const tdRO = "px-3 py-1.5 text-sm text-right text-gray-600 tabular-nums"

  return (
    <>
                    {/* ── Marge générale ── */}
                    <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
                      <span className="text-sm font-medium text-amber-900">Marge générale</span>
                      <input
                        type="number"
                        step="0.1"
                        className="px-3 py-1.5 border border-amber-300 rounded-md text-sm w-24 text-right bg-white tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-400"
                        placeholder="0"
                        value={quote.general_margin ?? ''}
                        onChange={e => { setQuote(q => ({ ...q, general_margin: e.target.value })); setQuoteDirty(true) }}
                      />
                      <span className="text-sm text-amber-900">%</span>
                      <span className="text-xs text-amber-800/80 ml-2">S'applique aux achats et à la sous-traitance. Une marge spécifique sur une ligne prend le dessus.</span>
                    </div>

                    {/* ── Gestion projet ── */}
                    <div className="bg-white rounded-2xl border border-indigo-200 overflow-hidden">
                      <div className="px-5 py-3 flex items-center justify-between gap-3" style={{ background: '#eef2ff', borderBottom: collapsedSections.management ? 'none' : '1px solid #e0e7ff' }}>
                        <button type="button" onClick={() => toggleCollapsedSection('management')}
                          className="flex items-center gap-2 flex-1 text-left hover:opacity-80">
                          <span style={{ color: '#3730a3', fontSize: 12 }}>{collapsedSections.management ? '▸' : '▾'}</span>
                          <span className="font-semibold" style={{ fontSize: 17, color: '#3730a3' }}>● Gestion projet</span>
                        </button>
                        <div className="flex items-center gap-4">
                          <span className="text-sm font-semibold tabular-nums" style={{ color: '#3730a3' }}>{fmtCHF(managementTotal)} CHF</span>
                          {!collapsedSections.management && (
                            <>
                              <CatalogPicker kind="heure" onPick={it => appendManagementRow(toRateRow(it))} />
                              <button onClick={addManagementRow}
                                className="text-xs font-medium text-indigo-700 hover:text-indigo-900">+ Ligne</button>
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
                              <tr><td colSpan={9} className="text-center text-sm text-gray-400 py-6">Aucune ligne. Clique "+ Ligne" pour ajouter.</td></tr>
                            ) : quote.management.map((r, i) => (
                              <tr key={r._uid || i} className="group hover:bg-gray-50">
                                <td className={td}><input className={txtCell} style={{ background: '#f3f4f6', fontWeight: 500 }} value={r.item || ''} onChange={e => updateManagementRow(i, 'item', e.target.value)} /></td>
                                <td className={td}><input className={txtCell} value={r.description || ''} onChange={e => updateManagementRow(i, 'description', e.target.value)} /></td>
                                <td className={td}><input type="number" step="0.01" className={numCell} value={r.rate || ''} onChange={e => updateManagementRow(i, 'rate', e.target.value)} /></td>
                                <td className={td}><QtyInput className={numCell} value={r.quantity} onChange={v => updateManagementRow(i, 'quantity', v)} /></td>
                                <td className={td}><select className={txtCell} value={r.unit || ''} onChange={e => updateManagementRow(i, 'unit', e.target.value)}><option value="">—</option>{QUOTE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select></td>
                                <td className={td}><input type="number" step="0.1" className={numCell} placeholder="0" value={r.discount || ''} onChange={e => updateManagementRow(i, 'discount', e.target.value)} /></td>
                                <td className={td}><input type="number" step="0.01" className={numCell} placeholder="0" value={r.discount_amount || ''} onChange={e => updateManagementRow(i, 'discount_amount', e.target.value)} /></td>
                                <td className={tdRO + ' ' + td + ' font-semibold text-gray-900'}>{fmtCHF(laborNet(r))}</td>
                                <td className={td + ' text-center'}>
                                  <button onClick={() => removeManagementRow(i)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 text-sm">×</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          {quote.management.length > 0 && (
                            <tfoot>
                              <tr>
                                <td colSpan={7} className="px-3 py-2 text-right text-xs font-medium text-gray-500 bg-gray-50">Sous-total gestion</td>
                                <td className="px-3 py-2 text-right text-sm font-bold text-gray-900 tabular-nums bg-gray-50">{fmtCHF(managementTotal)}</td>
                                <td className="bg-gray-50"></td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                      )}
                    </div>

                    {/* ── Fabrication (groupe d'items: Bar, Pergola, etc.) ── */}
                    <div className="bg-white rounded-2xl border border-emerald-300 overflow-hidden">
                      <div className="px-5 py-3 flex items-center justify-between gap-3" style={{ background: '#d1fae5', borderBottom: collapsedSections.fabrication ? 'none' : '1px solid #a7f3d0' }}>
                        <button type="button" onClick={() => toggleCollapsedSection('fabrication')}
                          className="flex items-center gap-2 flex-1 text-left hover:opacity-80">
                          <span style={{ color: '#065f46', fontSize: 12 }}>{collapsedSections.fabrication ? '▸' : '▾'}</span>
                          <span className="font-bold" style={{ fontSize: 17, color: '#065f46' }}>● Fabrication</span>
                        </button>
                        <span className="text-sm font-semibold tabular-nums" style={{ color: '#065f46' }}>{fmtCHF(itemsTotal)} CHF</span>
                      </div>

                      {!collapsedSections.fabrication && (
                      <div className="p-4 space-y-3" style={{ background: '#f0fdf4' }}>
                        {quote.items.length === 0 && (
                          <div className="text-center text-sm text-emerald-700/70 py-6">Aucun item pour l'instant. Ajoute Bar, Pergola, etc.</div>
                        )}
                        {quote.items.map((it, itemIdx) => {
                          const purchSub = (it.purchases || []).reduce((s, r) => s + purchaseNet(r), 0)
                          const laborSub = (it.labor || []).reduce((s, r) => s + laborNet(r), 0)
                          const subTotal = purchSub + laborSub
                          return (
                            <div key={it._uid || itemIdx} className="bg-white rounded-xl border border-emerald-200 overflow-hidden shadow-sm">
                              <div className="px-4 py-2.5 flex items-center justify-between gap-3" style={{ background: '#ecfdf5', borderBottom: collapsedItems[it._uid] ? 'none' : '1px solid #d1fae5' }}>
                                <button type="button" onClick={() => toggleCollapsedItem(it._uid)}
                                  className="hover:opacity-70" title={collapsedItems[it._uid] ? 'Déplier' : 'Replier'}>
                                  <span className="text-emerald-700" style={{ fontSize: 12 }}>{collapsedItems[it._uid] ? '▸' : '▾'}</span>
                                </button>
                                <span className="text-emerald-700">●</span>
                                <input
                                  className="flex-1 px-2 py-1 text-base font-semibold bg-transparent focus:outline-none focus:bg-white focus:ring-1 focus:ring-emerald-400 rounded"
                                  style={{ color: '#065f46' }}
                                  placeholder="Nom de l'item (ex: Bar, Backbar…)"
                                  value={it.name || ''}
                                  onChange={e => updateItemName(itemIdx, e.target.value)}
                                />
                                <span className="text-sm font-semibold tabular-nums whitespace-nowrap" style={{ color: '#065f46' }}>{fmtCHF(subTotal)} CHF</span>
                                <button onClick={() => { if (confirm(`Supprimer l'item "${it.name || 'sans nom'}" ?`)) removeItem(itemIdx) }}
                                  className="text-emerald-600 hover:text-red-500 text-sm" title="Supprimer cet item">✕</button>
                              </div>

                              {!collapsedItems[it._uid] && (
                              <>
                              {/* Achats de l'item */}
                              <div className="border-b border-gray-100">
                                <div className="px-4 py-2 flex items-center justify-between" style={{ background: '#fffbeb' }}>
                                  <h4 className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#92400e' }}>● Achats (matériaux)</h4>
                                  <span className="flex items-center gap-2">
                                    <CatalogPicker kind="article" onPick={it => appendItemRow(itemIdx, 'purchases', toPurchaseRow(it))} />
                                    <button onClick={() => addItemRow(itemIdx, 'purchases')}
                                      className="text-xs font-medium text-amber-700 hover:text-amber-900">+ Ligne</button>
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
                                    <tr><td colSpan={11} className="text-center text-sm text-gray-400 py-4">Aucun achat.</td></tr>
                                  ) : it.purchases.map((r, i) => (
                                    <tr key={r._uid || i} className="group hover:bg-gray-50">
                                      <td className={td}><input className={txtCell} value={r.description || ''} onChange={e => updateItemRow(itemIdx, 'purchases', i, 'description', e.target.value)} /></td>
                                      <td className={td}><input className={txtCell} placeholder="ex: 200×120×40" value={r.dimension || ''} onChange={e => updateItemRow(itemIdx, 'purchases', i, 'dimension', e.target.value)} /></td>
                                      <td className={td}><input type="number" step="0.01" className={numCell} value={r.unit_price || ''} onChange={e => updateItemRow(itemIdx, 'purchases', i, 'unit_price', e.target.value)} /></td>
                                      <td className={td}><QtyInput className={numCell} value={r.quantity} onChange={v => updateItemRow(itemIdx, 'purchases', i, 'quantity', v)} /></td>
                                      <td className={td}><select className={txtCell} value={r.unit || ''} onChange={e => updateItemRow(itemIdx, 'purchases', i, 'unit', e.target.value)}><option value="">—</option>{QUOTE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select></td>
                                      <td className={tdRO + ' ' + td}>{fmtCHF(purchaseTotal(r))}</td>
                                      <td className={td}><input type="number" step="0.1" className={numCell} value={r.margin || ''} placeholder={quote.general_margin || ''} onChange={e => updateItemRow(itemIdx, 'purchases', i, 'margin', e.target.value)} /></td>
                                      <td className={td}><input type="number" step="0.1" className={numCell} placeholder="0" value={r.discount || ''} onChange={e => updateItemRow(itemIdx, 'purchases', i, 'discount', e.target.value)} /></td>
                                      <td className={td}><input type="number" step="0.01" className={numCell} placeholder="0" value={r.discount_amount || ''} onChange={e => updateItemRow(itemIdx, 'purchases', i, 'discount_amount', e.target.value)} /></td>
                                      <td className={tdRO + ' ' + td + ' font-semibold text-gray-900'}>{fmtCHF(purchaseNet(r))}</td>
                                      <td className={td + ' text-center'}>
                                        <button onClick={() => removeItemRow(itemIdx, 'purchases', i)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 text-sm">×</button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                                {(it.purchases || []).length > 0 && (
                                  <tfoot>
                                    <tr>
                                      <td colSpan={9} className="px-3 py-2 text-right text-xs font-medium text-gray-500 bg-gray-50">Sous-total achats</td>
                                      <td className="px-3 py-2 text-right text-sm font-bold text-gray-900 tabular-nums bg-gray-50">{fmtCHF(purchSub)}</td>
                                      <td className="bg-gray-50"></td>
                                    </tr>
                                  </tfoot>
                                )}
                              </table>
                            </div>
                          </div>

                          {/* Main d'œuvre de l'item */}
                          <div>
                            <div className="px-4 py-2 flex items-center justify-between" style={{ background: '#faf5ff' }}>
                              <h4 className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#6b21a8' }}>● Main d'œuvre (découpe, peinture…)</h4>
                              <span className="flex items-center gap-2">
                                <CatalogPicker kind="heure" onPick={it => appendItemRow(itemIdx, 'labor', toRateRow(it))} />
                                <button onClick={() => addItemRow(itemIdx, 'labor')}
                                  className="text-xs font-medium text-purple-700 hover:text-purple-900">+ Ligne</button>
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
                                    <tr><td colSpan={8} className="text-center text-sm text-gray-400 py-4">Aucune main d'œuvre.</td></tr>
                                  ) : it.labor.map((r, i) => (
                                    <tr key={r._uid || i} className="group hover:bg-gray-50">
                                      <td className={td}><input className={txtCell} value={r.description || ''} onChange={e => updateItemRow(itemIdx, 'labor', i, 'description', e.target.value)} /></td>
                                      <td className={td}><input type="number" step="0.01" className={numCell} value={r.rate || ''} onChange={e => updateItemRow(itemIdx, 'labor', i, 'rate', e.target.value)} /></td>
                                      <td className={td}><QtyInput className={numCell} value={r.quantity} onChange={v => updateItemRow(itemIdx, 'labor', i, 'quantity', v)} /></td>
                                      <td className={td}><select className={txtCell} value={r.unit || ''} onChange={e => updateItemRow(itemIdx, 'labor', i, 'unit', e.target.value)}><option value="">—</option>{QUOTE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select></td>
                                      <td className={td}><input type="number" step="0.1" className={numCell} placeholder="0" value={r.discount || ''} onChange={e => updateItemRow(itemIdx, 'labor', i, 'discount', e.target.value)} /></td>
                                      <td className={td}><input type="number" step="0.01" className={numCell} placeholder="0" value={r.discount_amount || ''} onChange={e => updateItemRow(itemIdx, 'labor', i, 'discount_amount', e.target.value)} /></td>
                                      <td className={tdRO + ' ' + td + ' font-semibold text-gray-900'}>{fmtCHF(laborNet(r))}</td>
                                      <td className={td + ' text-center'}>
                                        <button onClick={() => removeItemRow(itemIdx, 'labor', i)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 text-sm">×</button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                                {(it.labor || []).length > 0 && (
                                  <tfoot>
                                    <tr>
                                      <td colSpan={6} className="px-3 py-2 text-right text-xs font-medium text-gray-500 bg-gray-50">Sous-total main d'œuvre</td>
                                      <td className="px-3 py-2 text-right text-sm font-bold text-gray-900 tabular-nums bg-gray-50">{fmtCHF(laborSub)}</td>
                                      <td className="bg-gray-50"></td>
                                    </tr>
                                  </tfoot>
                                )}
                              </table>
                            </div>
                          </div>
                          </>
                          )}
                            </div>
                          )
                        })}

                        {/* Bouton ajouter un item (à l'intérieur de Fabrication) */}
                        <button onClick={addItem}
                          className="w-full py-2.5 rounded-xl border-2 border-dashed border-emerald-300 text-sm font-medium text-emerald-700 hover:border-emerald-600 hover:bg-white transition-colors">
                          + Ajouter un item
                        </button>
                      </div>
                      )}
                    </div>

                    {/* ── Sous-traitance ── */}
                    <div className="bg-white rounded-2xl border border-orange-200 overflow-hidden">
                      <div className="px-5 py-3 flex items-center justify-between gap-3" style={{ background: '#fff7ed', borderBottom: collapsedSections.subcontracting ? 'none' : '1px solid #fed7aa' }}>
                        <button type="button" onClick={() => toggleCollapsedSection('subcontracting')}
                          className="flex items-center gap-2 flex-1 text-left hover:opacity-80">
                          <span style={{ color: '#9a3412', fontSize: 12 }}>{collapsedSections.subcontracting ? '▸' : '▾'}</span>
                          <span className="font-bold" style={{ fontSize: 17, color: '#9a3412' }}>● Sous-traitance</span>
                        </button>
                        <div className="flex items-center gap-4">
                          <span className="text-sm font-semibold tabular-nums" style={{ color: '#9a3412' }}>{fmtCHF(subcontractingTotal)} CHF</span>
                          {!collapsedSections.subcontracting && (
                            <>
                              <CatalogPicker kind="all" onPick={it => appendSubcontractingRow(toRateRow(it))} />
                              <button onClick={addSubcontractingRow}
                                className="text-xs font-medium text-orange-700 hover:text-orange-900">+ Ligne</button>
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
                              <tr><td colSpan={10} className="text-center text-sm text-gray-400 py-6">Aucune ligne.</td></tr>
                            ) : quote.subcontracting.map((r, i) => (
                              <tr key={r._uid || i} className="group hover:bg-gray-50">
                                <td className={td}><input className={txtCell} style={{ background: '#f3f4f6', fontWeight: 500 }} value={r.item || ''} onChange={e => updateSubcontractingRow(i, 'item', e.target.value)} /></td>
                                <td className={td}><input className={txtCell} value={r.description || ''} onChange={e => updateSubcontractingRow(i, 'description', e.target.value)} /></td>
                                <td className={td}><input type="number" step="0.01" className={numCell} value={r.rate || ''} onChange={e => updateSubcontractingRow(i, 'rate', e.target.value)} /></td>
                                <td className={td}><QtyInput className={numCell} value={r.quantity} onChange={v => updateSubcontractingRow(i, 'quantity', v)} /></td>
                                <td className={td}><select className={txtCell} value={r.unit || ''} onChange={e => updateSubcontractingRow(i, 'unit', e.target.value)}><option value="">—</option>{QUOTE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select></td>
                                <td className={td}><input type="number" step="0.1" className={numCell} value={r.margin || ''} placeholder={quote.general_margin || ''} onChange={e => updateSubcontractingRow(i, 'margin', e.target.value)} /></td>
                                <td className={td}><input type="number" step="0.1" className={numCell} placeholder="0" value={r.discount || ''} onChange={e => updateSubcontractingRow(i, 'discount', e.target.value)} /></td>
                                <td className={td}><input type="number" step="0.01" className={numCell} placeholder="0" value={r.discount_amount || ''} onChange={e => updateSubcontractingRow(i, 'discount_amount', e.target.value)} /></td>
                                <td className={tdRO + ' ' + td + ' font-semibold text-gray-900'}>{fmtCHF(serviceNet(r))}</td>
                                <td className={td + ' text-center'}>
                                  <button onClick={() => removeSubcontractingRow(i)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 text-sm">×</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          {(quote.subcontracting || []).length > 0 && (
                            <tfoot>
                              <tr>
                                <td colSpan={8} className="px-3 py-2 text-right text-xs font-medium text-gray-500 bg-gray-50">Sous-total sous-traitance</td>
                                <td className="px-3 py-2 text-right text-sm font-bold text-gray-900 tabular-nums bg-gray-50">{fmtCHF(subcontractingTotal)}</td>
                                <td className="bg-gray-50"></td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                      )}
                    </div>

                    {/* ── Logistique ── */}
                    <div className="bg-white rounded-2xl border border-cyan-200 overflow-hidden">
                      <div className="px-5 py-3 flex items-center justify-between gap-3" style={{ background: '#ecfeff', borderBottom: collapsedSections.logistics ? 'none' : '1px solid #cffafe' }}>
                        <button type="button" onClick={() => toggleCollapsedSection('logistics')}
                          className="flex items-center gap-2 flex-1 text-left hover:opacity-80">
                          <span style={{ color: '#155e75', fontSize: 12 }}>{collapsedSections.logistics ? '▸' : '▾'}</span>
                          <span className="font-bold" style={{ fontSize: 17, color: '#155e75' }}>● Logistique</span>
                        </button>
                        <div className="flex items-center gap-4">
                          <span className="text-sm font-semibold tabular-nums" style={{ color: '#155e75' }}>{fmtCHF(logisticsTotal)} CHF</span>
                          {!collapsedSections.logistics && (
                            <>
                              <CatalogPicker kind="all" onPick={it => appendLogisticsRow(toRateRow(it))} />
                              <button onClick={addLogisticsRow}
                                className="text-xs font-medium text-cyan-700 hover:text-cyan-900">+ Ligne</button>
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
                              <tr><td colSpan={10} className="text-center text-sm text-gray-400 py-6">Aucune ligne.</td></tr>
                            ) : quote.logistics.map((r, i) => (
                              <tr key={r._uid || i} className="group hover:bg-gray-50">
                                <td className={td}><input className={txtCell} style={{ background: '#f3f4f6', fontWeight: 500 }} value={r.trajet || ''} onChange={e => updateLogisticsRow(i, 'trajet', e.target.value)} /></td>
                                <td className={td}><input className={txtCell} value={r.description || ''} onChange={e => updateLogisticsRow(i, 'description', e.target.value)} /></td>
                                <td className={td}><input type="number" step="0.01" className={numCell} value={r.rate || ''} onChange={e => updateLogisticsRow(i, 'rate', e.target.value)} /></td>
                                <td className={td}><QtyInput className={numCell} value={r.quantity} onChange={v => updateLogisticsRow(i, 'quantity', v)} /></td>
                                <td className={td}><select className={txtCell} value={r.unit || ''} onChange={e => updateLogisticsRow(i, 'unit', e.target.value)}><option value="">—</option>{QUOTE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select></td>
                                <td className={td}><input type="number" step="0.1" className={numCell} value={r.margin || ''} placeholder="0" onChange={e => updateLogisticsRow(i, 'margin', e.target.value)} /></td>
                                <td className={td}><input type="number" step="0.1" className={numCell} placeholder="0" value={r.discount || ''} onChange={e => updateLogisticsRow(i, 'discount', e.target.value)} /></td>
                                <td className={td}><input type="number" step="0.01" className={numCell} placeholder="0" value={r.discount_amount || ''} onChange={e => updateLogisticsRow(i, 'discount_amount', e.target.value)} /></td>
                                <td className={tdRO + ' ' + td + ' font-semibold text-gray-900'}>{fmtCHF(logisticsNet(r))}</td>
                                <td className={td + ' text-center'}>
                                  <button onClick={() => removeLogisticsRow(i)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 text-sm">×</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          {quote.logistics.length > 0 && (
                            <tfoot>
                              <tr>
                                <td colSpan={8} className="px-3 py-2 text-right text-xs font-medium text-gray-500 bg-gray-50">Sous-total logistique</td>
                                <td className="px-3 py-2 text-right text-sm font-bold text-gray-900 tabular-nums bg-gray-50">{fmtCHF(logisticsTotal)}</td>
                                <td className="bg-gray-50"></td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                      )}
                    </div>

                    {/* ── Total général ── */}
                    <div className="rounded-2xl px-5 py-4 flex items-center justify-between" style={{ background: '#111827', color: 'white' }}>
                      <span className="text-sm font-medium uppercase tracking-wider opacity-80">Total général</span>
                      <span className="font-bold tabular-nums" style={{ fontSize: 24, letterSpacing: '-0.02em' }}>
                        {fmtCHF(grandTotal)} <span className="text-sm opacity-70 ml-1">CHF</span>
                      </span>
                    </div>
    </>
  )
}
