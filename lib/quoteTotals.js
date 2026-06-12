// Calcul du total d'un devis (quote_data) — même logique que l'éditeur et le PDF.
// Marge générale sur achats + sous-traitance ; PAS sur la logistique ni la gestion.

function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n }
function effMargin(r, gm)    { return (r?.margin !== '' && r?.margin != null) ? num(r.margin) : num(gm) }
function effMarginLog(r)     { return (r?.margin !== '' && r?.margin != null) ? num(r.margin) : 0 }

export function computeQuoteTotal(q) {
  if (!q) return 0
  const gm = q.general_margin ?? ''
  const management = (q.management || []).reduce((s, r) => s + num(r.rate) * num(r.quantity), 0)
  const items = (q.items || []).reduce((s, it) => {
    const p = (it.purchases || []).reduce((a, r) => a + num(r.unit_price) * num(r.quantity) * (1 + effMargin(r, gm) / 100), 0)
    const l = (it.labor || []).reduce((a, r) => a + num(r.rate) * num(r.quantity), 0)
    return s + p + l
  }, 0)
  const subcontracting = (q.subcontracting || []).reduce((s, r) => s + num(r.rate) * num(r.quantity) * (1 + effMargin(r, gm) / 100), 0)
  const logistics = (q.logistics || []).reduce((s, r) => s + num(r.rate) * num(r.quantity) * (1 + effMarginLog(r) / 100), 0)
  return management + items + subcontracting + logistics
}
