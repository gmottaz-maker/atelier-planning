// Calcul du total d'un devis (quote_data) — même logique que l'éditeur et le PDF.
// Marge générale sur achats + sous-traitance ; PAS sur la logistique ni la gestion.

function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n }
function effMargin(r, gm)    { return (r?.margin !== '' && r?.margin != null) ? num(r.margin) : num(gm) }
function effMarginLog(r)     { return (r?.margin !== '' && r?.margin != null) ? num(r.margin) : 0 }
// Escompte par ligne : % puis montant CHF, sur le montant facturé (borné à 0).
function applyDisc(amt, r)   { return Math.max(0, amt * (1 - num(r.discount) / 100) - num(r.discount_amount)) }

export function computeQuoteTotal(q) {
  if (!q) return 0
  const gm = q.general_margin ?? ''
  const management = (q.management || []).reduce((s, r) => s + applyDisc(num(r.rate) * num(r.quantity), r), 0)
  const items = (q.items || []).reduce((s, it) => {
    const p = (it.purchases || []).reduce((a, r) => a + applyDisc(num(r.unit_price) * num(r.quantity) * (1 + effMargin(r, gm) / 100), r), 0)
    const l = (it.labor || []).reduce((a, r) => a + applyDisc(num(r.rate) * num(r.quantity), r), 0)
    return s + p + l
  }, 0)
  const subcontracting = (q.subcontracting || []).reduce((s, r) => s + applyDisc(num(r.rate) * num(r.quantity) * (1 + effMargin(r, gm) / 100), r), 0)
  const logistics = (q.logistics || []).reduce((s, r) => s + applyDisc(num(r.rate) * num(r.quantity) * (1 + effMarginLog(r) / 100), r), 0)
  return management + items + subcontracting + logistics
}
