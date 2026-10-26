// Totaux d'une facture émise : sous-total HT du devis, escompte global, TVA,
// puis déduction des acomptes déjà facturés.
//
// L'escompte porte sur le sous-total HT (avant TVA) : c'est la règle suisse
// usuelle pour une remise commerciale, et la TVA se calcule sur le montant
// réellement dû. Ordre : pourcentage d'abord, puis montant fixe, borné à 0.
//
// Les ACOMPTES se déduisent APRÈS la TVA, et c'est la seule place juste : un
// acompte est une facture à part entière qui a déjà porté SA TVA. La déduire
// une seconde fois du HT la ferait disparaître du décompte. La facture finale
// montre donc le total complet, TVA comprise, puis retire l'acompte TTC.

const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n }
const r2  = n => Math.round(n * 100) / 100

export function invoiceTotals({ subtotal, discount_rate, discount_amount, vat_rate, acomptes }) {
  const sub = num(subtotal)
  const byRate = sub * (num(discount_rate) / 100)
  const discount = Math.min(sub, r2(byRate + num(discount_amount)))
  const net = r2(Math.max(0, sub - discount))
  const vat = r2(net * (num(vat_rate) / 100))
  const gross = r2(net + vat)

  // Déjà encaissé (ou du moins déjà facturé), TTC.
  const verse = Math.max(0, r2(num(acomptes)))
  const deduit = Math.min(gross, verse)
  // Si les acomptes DÉPASSENT le total — un chantier réduit en cours de route —
  // on ne rend pas un dû négatif : on le borne à zéro et on sort l'excédent
  // pour que l'écran puisse réclamer une note de crédit. Une facture à montant
  // négatif passerait le rapprochement bancaire sans jamais se laisser payer.
  return {
    subtotal: r2(sub), discount, net, vat, gross,
    acomptes: deduit,
    excedent: r2(Math.max(0, verse - gross)),
    du: r2(gross - deduit),
  }
}
