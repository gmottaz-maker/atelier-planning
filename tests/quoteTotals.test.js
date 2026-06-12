import { describe, it, expect } from 'vitest'
import { computeQuoteTotal } from '../lib/quoteTotals'

describe('computeQuoteTotal', () => {
  it('renvoie 0 pour null / undefined / vide', () => {
    expect(computeQuoteTotal(null)).toBe(0)
    expect(computeQuoteTotal(undefined)).toBe(0)
    expect(computeQuoteTotal({})).toBe(0)
    expect(computeQuoteTotal({ management: [], items: [], subcontracting: [], logistics: [], general_margin: '20' })).toBe(0)
  })

  it('gestion : rate × quantité, sans marge', () => {
    const q = { management: [{ rate: '120', quantity: '2' }, { rate: '100', quantity: '0.5' }], general_margin: '20' }
    expect(computeQuoteTotal(q)).toBe(120 * 2 + 100 * 0.5) // 290 — la marge générale ne s'applique pas à la gestion
  })

  it('fabrication : achats avec marge générale + main d’œuvre sans marge', () => {
    const q = {
      items: [{
        purchases: [{ unit_price: '100', quantity: '1' }], // 100 * 1.20 = 120
        labor:     [{ rate: '100', quantity: '2' }],        // 200 (pas de marge)
      }],
      general_margin: '20',
    }
    expect(computeQuoteTotal(q)).toBeCloseTo(120 + 200, 6)
  })

  it('marge spécifique sur une ligne prend le dessus sur la marge générale', () => {
    const q = {
      items: [{ purchases: [{ unit_price: '100', quantity: '1', margin: '50' }] }],
      general_margin: '20',
    }
    expect(computeQuoteTotal(q)).toBeCloseTo(150, 6) // 100 * 1.50
  })

  it('sous-traitance : applique la marge générale', () => {
    const q = { subcontracting: [{ rate: '100', quantity: '1' }], general_margin: '20' }
    expect(computeQuoteTotal(q)).toBeCloseTo(120, 6)
  })

  it('logistique : N’hérite PAS de la marge générale (0 % par défaut)', () => {
    const q = { logistics: [{ rate: '100', quantity: '1' }], general_margin: '20' }
    expect(computeQuoteTotal(q)).toBeCloseTo(100, 6) // pas de marge
  })

  it('logistique : applique une marge spécifique si présente sur la ligne', () => {
    const q = { logistics: [{ rate: '100', quantity: '1', margin: '10' }], general_margin: '20' }
    expect(computeQuoteTotal(q)).toBeCloseTo(110, 6)
  })

  it('marge générale vide = 0 % sur achats et sous-traitance', () => {
    const q = {
      items: [{ purchases: [{ unit_price: '100', quantity: '1' }] }],
      subcontracting: [{ rate: '50', quantity: '1' }],
      general_margin: '',
    }
    expect(computeQuoteTotal(q)).toBeCloseTo(100 + 50, 6)
  })

  it('valeurs non numériques traitées comme 0', () => {
    const q = { management: [{ rate: 'abc', quantity: '2' }, { rate: '100', quantity: '' }] }
    expect(computeQuoteTotal(q)).toBe(0)
  })

  it('devis complet : somme de toutes les sections', () => {
    const q = {
      management:     [{ rate: '120', quantity: '1' }],                       // 120
      items:          [{ purchases: [{ unit_price: '200', quantity: '1' }],   // 200 * 1.2 = 240
                         labor:     [{ rate: '100', quantity: '3' }] }],      // 300
      subcontracting: [{ rate: '500', quantity: '1' }],                       // 500 * 1.2 = 600
      logistics:      [{ rate: '3', quantity: '40' }],                        // 120 (pas de marge)
      general_margin: '20',
    }
    expect(computeQuoteTotal(q)).toBeCloseTo(120 + 240 + 300 + 600 + 120, 6) // 1380
  })
})
