// Totaux d'une facture émise : sous-total HT du devis, escompte global, TVA.
//
// L'escompte porte sur le sous-total HT (avant TVA) : c'est la règle suisse
// usuelle pour une remise commerciale, et la TVA se calcule sur le montant
// réellement dû. Ordre : pourcentage d'abord, puis montant fixe, borné à 0.

const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n }
const r2  = n => Math.round(n * 100) / 100

export function invoiceTotals({ subtotal, discount_rate, discount_amount, vat_rate }) {
  const sub = num(subtotal)
  const byRate = sub * (num(discount_rate) / 100)
  const discount = Math.min(sub, r2(byRate + num(discount_amount)))
  const net = r2(Math.max(0, sub - discount))
  const vat = r2(net * (num(vat_rate) / 100))
  return { subtotal: r2(sub), discount, net, vat, gross: r2(net + vat) }
}
