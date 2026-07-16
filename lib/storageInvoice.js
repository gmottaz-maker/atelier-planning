// Construit les factures de stockage trimestrielles à partir des groupes.
// 1 palette = 1 m² = 20 CHF HT / mois. Trimestre = 3 mois.
export const STORAGE_RATE = 20
export const QUARTER_MONTHS = 3
const VAT_RATE = 8.1
const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n }
const round2 = n => Math.round(n * 100) / 100

export function quarterEndDate(year, q) {
  return { 1: `${year}-03-31`, 2: `${year}-06-30`, 3: `${year}-09-30`, 4: `${year}-12-31` }[q]
}
export function quarterLabel(year, q) { return `T${q} ${year}` }

// Un groupe est facturable pour un trimestre si non archivé, palettes > 0, et
// billable_from vide ou <= fin du trimestre.
export function billableGroups(groups, year, q) {
  const end = quarterEndDate(year, q)
  return (groups || []).filter(g =>
    !g.archived && num(g.pallets) > 0 && (!g.billable_from || String(g.billable_from) <= end))
}

// Retourne un payload de facture (customer_invoices) par client pour ce trimestre.
export function buildStorageInvoices(groups, year, q) {
  const label = quarterLabel(year, q)
  const issue = quarterEndDate(year, q)
  const bill = billableGroups(groups, year, q)
  const byClient = {}
  for (const g of bill) (byClient[g.client] ||= []).push(g)

  return Object.entries(byClient).map(([client, gs]) => {
    // Une ligne (item) par marque/projet, avec une position « stockage ».
    const items = gs.map(g => ({
      name: g.brand,
      purchases: [],
      labor: [{
        description: `Stockage ${label} — ${num(g.pallets)} palette(s) × ${STORAGE_RATE} CHF/m²/mois`,
        rate: STORAGE_RATE, quantity: num(g.pallets) * QUARTER_MONTHS, unit: 'palette·mois',
      }],
    }))
    const net = round2(gs.reduce((s, g) => s + num(g.pallets) * STORAGE_RATE * QUARTER_MONTHS, 0))
    const vat = round2(net * VAT_RATE / 100)
    return {
      client,
      object: `Stockage — ${label}`,
      issue_date: issue,
      quote_snapshot: { management: [], items, subcontracting: [], logistics: [] },
      amount_net: net,
      vat_rate: VAT_RATE,
      vat_amount: vat,
      amount: round2(net + vat),
    }
  }).sort((a, b) => a.client.localeCompare(b.client))
}
