import { describe, it, expect } from 'vitest'
import { invoiceTotals } from '../lib/invoiceTotals'

describe('invoiceTotals', () => {
  it('calcule la TVA sans escompte', () => {
    expect(invoiceTotals({ subtotal: 1000, vat_rate: 8.1 }))
      .toEqual({ subtotal: 1000, discount: 0, net: 1000, vat: 81, gross: 1081 })
  })

  it('applique un escompte en pourcentage avant la TVA', () => {
    const t = invoiceTotals({ subtotal: 1000, discount_rate: 10, vat_rate: 8.1 })
    expect(t.discount).toBe(100)
    expect(t.net).toBe(900)
    expect(t.vat).toBe(72.9)      // TVA sur le montant réellement dû
    expect(t.gross).toBe(972.9)
  })

  it('applique un escompte en montant fixe', () => {
    const t = invoiceTotals({ subtotal: 1000, discount_amount: 150, vat_rate: 8.1 })
    expect(t.discount).toBe(150)
    expect(t.net).toBe(850)
  })

  it('cumule pourcentage puis montant fixe', () => {
    const t = invoiceTotals({ subtotal: 1000, discount_rate: 10, discount_amount: 50, vat_rate: 8.1 })
    expect(t.discount).toBe(150)  // 100 (10 %) + 50
    expect(t.net).toBe(850)
  })

  it('ne descend jamais sous zéro', () => {
    const t = invoiceTotals({ subtotal: 100, discount_amount: 500, vat_rate: 8.1 })
    expect(t.discount).toBe(100)
    expect(t.net).toBe(0)
    expect(t.gross).toBe(0)
  })

  it('gère une TVA à 0 % et des champs vides', () => {
    expect(invoiceTotals({ subtotal: 500, vat_rate: 0 }).gross).toBe(500)
    expect(invoiceTotals({ subtotal: 500, discount_rate: '', discount_amount: '', vat_rate: '8.1' }).net).toBe(500)
  })

  it('arrondit au centime', () => {
    const t = invoiceTotals({ subtotal: 333.33, discount_rate: 3, vat_rate: 8.1 })
    expect(t.net).toBe(323.33)
    expect(t.vat).toBe(26.19)
  })
})
