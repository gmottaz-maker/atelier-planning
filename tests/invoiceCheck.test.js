import { describe, it, expect } from 'vitest'
import { validerFacture, subtotalFromSnapshot, recalculable, TAUX_TVA_ADMIS } from '../lib/invoiceCheck'
import { seqSuivante, formatNumero } from '../lib/invoiceNumber'
import { storageBillingKey } from '../lib/storageBilling'

// Devis : 1000 d'achat sans marge + 200 de main d'œuvre = 1200 HT
const snapshot = {
  management: [{ item: 'Projet', rate: 100, quantity: 2 }],
  items: [{ name: 'Néon', purchases: [{ description: 'Néon', unit_price: 1000, quantity: 1 }], labor: [] }],
}
const base = {
  client_name: 'Red Bull AG', quote_snapshot: snapshot,
  vat_rate: 8.1, currency: 'CHF',
  amount_net: 1200, vat_amount: 97.2, amount: 1297.2,
}

describe('recalcul serveur des totaux', () => {
  it('reconstitue le sous-total depuis l\'instantané', () => {
    expect(subtotalFromSnapshot(snapshot)).toBe(1200)
  })

  it('accepte une facture cohérente', () => {
    const r = validerFacture(base)
    expect(r.ok).toBe(true)
    expect(r.valeurs).toMatchObject({ amount: 1297.2, amount_net: 1200, vat_amount: 97.2 })
  })

  it('refuse un total qui ne correspond pas aux lignes', () => {
    const r = validerFacture({ ...base, amount: 100 })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/ne correspond pas/)
  })

  it('tolère un écart d\'arrondi d\'un centime', () => {
    expect(validerFacture({ ...base, amount: 1297.21 }).ok).toBe(true)
    expect(validerFacture({ ...base, amount: 1297.25 }).ok).toBe(false)
  })

  it('impose les valeurs recalculées, pas celles reçues', () => {
    // Net et TVA fantaisistes, total juste : ce sont les recalculés qui sortent.
    const r = validerFacture({ ...base, amount_net: 999, vat_amount: 298.2 })
    expect(r.ok).toBe(true)
    expect(r.valeurs.amount_net).toBe(1200)
    expect(r.valeurs.vat_amount).toBe(97.2)
  })

  it('tient compte de la remise globale', () => {
    // 1200 − 10 % = 1080 HT, TVA 87.48, total 1167.48
    const r = validerFacture({ ...base, discount_rate: 10, amount: 1167.48 })
    expect(r.ok).toBe(true)
    expect(r.valeurs.amount_net).toBe(1080)
  })

  it('refuse un montant négatif', () => {
    expect(validerFacture({ ...base, amount: -1 })).toMatchObject({ ok: false })
  })

  it('refuse un taux de TVA hors barème', () => {
    expect(validerFacture({ ...base, vat_rate: 20 })).toMatchObject({ ok: false })
    for (const taux of TAUX_TVA_ADMIS) {
      // le total suit le taux, donc on ne teste ici que l'acceptation du taux
      expect(validerFacture({ ...base, vat_rate: taux, amount: 1200 * (1 + taux / 100) }).ok).toBe(true)
    }
  })

  it('refuse une monnaie, un statut ou une remise invalides', () => {
    expect(validerFacture({ ...base, currency: 'USD' })).toMatchObject({ ok: false })
    expect(validerFacture({ ...base, status: 'inventé' })).toMatchObject({ ok: false })
    expect(validerFacture({ ...base, discount_rate: 150 })).toMatchObject({ ok: false })
    expect(validerFacture({ ...base, discount_amount: -5 })).toMatchObject({ ok: false })
  })

  it('refuse une échéance antérieure à l\'émission', () => {
    expect(validerFacture({ ...base, issue_date: '2026-08-10', due_date: '2026-08-01' }))
      .toMatchObject({ ok: false })
  })

  it('ne recalcule pas un instantané hérité, mais vérifie sa cohérence', () => {
    const herite = { purchases: [{ description: 'Bois', unit_price: 500, quantity: 2 }] }
    expect(recalculable(herite)).toBe(false)
    expect(validerFacture({ ...base, quote_snapshot: herite, amount: 1080, amount_net: 1000, vat_amount: 80 }).ok).toBe(true)
    expect(validerFacture({ ...base, quote_snapshot: herite, amount: 9999, amount_net: 1000, vat_amount: 80 }).ok).toBe(false)
  })
})

describe('numérotation', () => {
  it('reprend au-dessus du plus haut numéro de l\'année', () => {
    expect(seqSuivante(['2026-001', '2026-013', '2025-099'], 2026)).toBe(14)
    expect(seqSuivante([], 2026)).toBe(1)
    expect(seqSuivante(['2025-050'], 2026)).toBe(1)
  })

  it('formate sur trois chiffres', () => {
    expect(formatNumero(2026, 7)).toBe('2026-007')
    expect(formatNumero(2026, 142)).toBe('2026-142')
  })
})

describe('clé d\'idempotence du stockage', () => {
  it('identifie un client et un trimestre', () => {
    expect(storageBillingKey(2026, 2, 'DIAGEO')).toBe('2026-Q2-DIAGEO')
  })

  it('distingue deux trimestres et deux clients', () => {
    expect(storageBillingKey(2026, 2, 'A')).not.toBe(storageBillingKey(2026, 3, 'A'))
    expect(storageBillingKey(2026, 2, 'A')).not.toBe(storageBillingKey(2026, 2, 'B'))
  })
})

describe('factures d\'acompte, côté serveur', () => {
  // Offre de 1200 HT. Un acompte de 30 % vaut 360 HT, 389.16 TTC à 8,1 %.
  const acompte = { ...base, type: 'acompte', acompte_base: 'pourcentage', acompte_valeur: 30,
    amount: 389.16, amount_net: 360, vat_amount: 29.16 }

  it('recalcule le montant d\'un acompte depuis le POURCENTAGE, pas depuis le corps', () => {
    const r = validerFacture(acompte)
    expect(r.ok).toBe(true)
    expect(r.valeurs).toMatchObject({ amount: 389.16, amount_net: 360, vat_amount: 29.16 })
  })

  it('accepte un acompte en montant fixe', () => {
    const r = validerFacture({ ...acompte, acompte_base: 'montant', acompte_valeur: 500,
      amount: 540.5, amount_net: 500, vat_amount: 40.5 })
    expect(r.ok).toBe(true)
    expect(r.valeurs.amount).toBe(540.5)
  })

  it('refuse un acompte dont le montant annoncé ne suit pas le pourcentage', () => {
    // Le navigateur ne fixe pas la somme : elle se déduit de l'offre.
    expect(validerFacture({ ...acompte, amount: 900 }).ok).toBe(false)
  })

  it('refuse un acompte qui dépasse l\'offre, ou sans base', () => {
    expect(validerFacture({ ...acompte, acompte_valeur: 150 }).ok).toBe(false)
    expect(validerFacture({ ...acompte, acompte_base: undefined }).ok).toBe(false)
    expect(validerFacture({ ...base, type: 'inventé' }).ok).toBe(false)
  })

  it('un acompte ne se déduit pas d\'acomptes', () => {
    // Même si la route en annonçait, un acompte EST la déduction à venir.
    const r = validerFacture(acompte, { acomptesTTC: 300 })
    expect(r.ok).toBe(true)
    expect(r.valeurs.amount).toBe(389.16)
  })
})

describe('la facture finale déduit les acomptes', () => {
  it('attend le SOLDE, pas le total', () => {
    // 1297.20 TTC moins 389.16 d'acompte = 908.04 à payer.
    const r = validerFacture({ ...base, amount: 908.04 }, { acomptesTTC: 389.16 })
    expect(r.ok).toBe(true)
    expect(r.valeurs.amount).toBe(908.04)
    // Le net et la TVA restent ceux de la facture ENTIÈRE : la TVA a déjà été
    // déclarée sur l'acompte, mais le document montre bien le total complet.
    expect(r.valeurs.amount_net).toBe(1200)
    expect(r.valeurs.vat_amount).toBe(97.2)
  })

  it('refuse le total complet quand un acompte a déjà été facturé', () => {
    const r = validerFacture({ ...base, amount: 1297.2 }, { acomptesTTC: 389.16 })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/acomptes/)
  })

  it('ignore ce que le NAVIGATEUR prétend sur les acomptes', () => {
    // Le corps porte un champ `acomptes` menteur : il ne doit rien changer.
    const r = validerFacture({ ...base, acomptes: 1200, acomptes_deduits: [{ montant: 1200 }], amount: 97.2 })
    expect(r.ok).toBe(false)
  })

  it('sans acompte, le comportement d\'avant est intact', () => {
    expect(validerFacture(base).ok).toBe(true)
    expect(validerFacture(base, { acomptesTTC: 0 }).ok).toBe(true)
  })
})
