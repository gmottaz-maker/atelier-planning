// Validation et recalcul serveur des montants d'une facture émise.
//
// Les montants arrivaient tels quels du navigateur : rien n'empêchait de poster
// une facture dont le total ne correspondait pas à ses lignes, ni un taux de
// TVA fantaisiste, ni un montant négatif. Le serveur recalcule donc depuis
// `quote_snapshot` et refuse un écart supérieur au centime.
import { computeQuoteTotal } from './quoteTotals'
import { invoiceTotals } from './invoiceTotals'

const num = v => { const n = parseFloat(v); return isNaN(n) ? NaN : n }
const r2 = n => Math.round(n * 100) / 100

// Taux de TVA suisses en vigueur, plus 0 pour les opérations exclues.
export const TAUX_TVA_ADMIS = [0, 2.6, 3.8, 8.1]
export const MONNAIES_ADMISES = ['CHF', 'EUR']
export const STATUTS_ADMIS = ['created', 'sent', 'pending', 'paid', 'cancelled']

// Tolérance d'arrondi entre le total annoncé et le total recalculé.
export const TOLERANCE = 0.01

/**
 * Sous-total HT reconstitué depuis l'instantané du devis. On réutilise
 * `computeQuoteTotal`, exactement la fonction dont l'éditeur se sert : deux
 * implémentations du même calcul finiraient par diverger, et la facture serait
 * alors refusée pour une raison qui n'existe pas.
 */
export function subtotalFromSnapshot(snapshot) {
  return r2(computeQuoteTotal(snapshot))
}

/**
 * Vrai si l'instantané est au format groupé produit par l'éditeur. Les
 * instantanés hérités (format plat) ne sont pas recalculables par
 * `computeQuoteTotal` : on ne les refuse pas, on se contente du contrôle de
 * cohérence interne.
 */
export function recalculable(snapshot) {
  return Array.isArray(snapshot?.items) || Array.isArray(snapshot?.management)
}

/**
 * Valide un corps de facture. Renvoie { ok: true, valeurs } où `valeurs` porte
 * les montants recalculés à enregistrer, ou { ok: false, error }.
 *
 * Sans `quote_snapshot` exploitable (facture saisie à la main, reprise d'un
 * historique), on ne peut rien recalculer : on valide alors seulement la
 * cohérence interne net + TVA = total.
 */
export function validerFacture(body) {
  const amount = num(body.amount)
  if (!Number.isFinite(amount) || amount < 0) {
    return { ok: false, error: 'Montant invalide' }
  }

  const currency = body.currency || 'CHF'
  if (!MONNAIES_ADMISES.includes(currency)) {
    return { ok: false, error: `Monnaie non prise en charge : ${currency}` }
  }

  const vatRate = body.vat_rate == null || body.vat_rate === '' ? null : num(body.vat_rate)
  if (vatRate != null && !TAUX_TVA_ADMIS.includes(vatRate)) {
    return { ok: false, error: `Taux de TVA non admis : ${body.vat_rate}` }
  }

  if (body.status && !STATUTS_ADMIS.includes(body.status)) {
    return { ok: false, error: `Statut inconnu : ${body.status}` }
  }

  const discountRate = body.discount_rate == null || body.discount_rate === '' ? 0 : num(body.discount_rate)
  if (!Number.isFinite(discountRate) || discountRate < 0 || discountRate > 100) {
    return { ok: false, error: 'Remise en pourcentage invalide' }
  }
  const discountAmount = body.discount_amount == null || body.discount_amount === '' ? 0 : num(body.discount_amount)
  if (!Number.isFinite(discountAmount) || discountAmount < 0) {
    return { ok: false, error: 'Montant de remise invalide' }
  }

  if (body.issue_date && body.due_date && String(body.due_date) < String(body.issue_date)) {
    return { ok: false, error: "L'échéance précède la date d'émission" }
  }

  const snapshot = body.quote_snapshot

  if (!recalculable(snapshot)) {
    // Rien à recalculer : on vérifie seulement que les trois montants annoncés
    // sont cohérents entre eux, quand ils sont tous fournis.
    const net = body.amount_net == null || body.amount_net === '' ? null : num(body.amount_net)
    const vat = body.vat_amount == null || body.vat_amount === '' ? null : num(body.vat_amount)
    if (net != null && vat != null && Math.abs(r2(net + vat) - amount) > TOLERANCE) {
      return { ok: false, error: `Incohérence : net ${net} + TVA ${vat} ≠ total ${amount}` }
    }
    return { ok: true, valeurs: { amount, amount_net: net, vat_amount: vat, vat_rate: vatRate, currency } }
  }

  const subtotal = subtotalFromSnapshot(snapshot)
  const t = invoiceTotals({
    subtotal,
    discount_rate: discountRate,
    discount_amount: discountAmount,
    vat_rate: vatRate ?? 0,
  })

  if (Math.abs(t.gross - amount) > TOLERANCE) {
    return {
      ok: false,
      error: `Le total ne correspond pas aux lignes : ${amount} annoncé, ${t.gross} recalculé`,
    }
  }

  // Les valeurs recalculées font foi : le client ne fixe que les lignes, la
  // remise et le taux.
  return {
    ok: true,
    valeurs: {
      amount: t.gross,
      amount_net: vatRate == null ? null : t.net,
      vat_amount: vatRate == null ? null : t.vat,
      vat_rate: vatRate,
      currency,
    },
  }
}
