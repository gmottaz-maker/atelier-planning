import { describe, it, expect } from 'vitest'
import { receiptFilename, quarterOf } from '../lib/receiptFile'

describe('receiptFilename', () => {
  const name = (r, orig) => receiptFilename(r, orig)

  it('construit date_MARCHAND_montant', () => {
    expect(name({ merchant: 'Migros', amount: 47.3, date: '2026-05-12' }, 'scan.pdf'))
      .toBe('2026-05-12_MIGROS_47.30.pdf')
  })

  it('force deux décimales sur le montant', () => {
    expect(name({ merchant: 'SBB CFF', amount: 88, date: '2026-05-14' }, 'a.pdf'))
      .toBe('2026-05-14_SBB-CFF_88.00.pdf')
  })

  it('retire accents et ponctuation du commerçant', () => {
    expect(name({ merchant: 'Café de la Gare', amount: 12.5, date: '2026-05-14' }, 'a.pdf'))
      .toBe('2026-05-14_CAFE-DE-LA-GARE_12.50.pdf')
  })

  it('omet le montant si absent ou illisible', () => {
    expect(name({ merchant: 'Migros', amount: null, date: '2026-05-12' }, 'a.pdf'))
      .toBe('2026-05-12_MIGROS.pdf')
  })

  it('conserve l\'extension d\'une photo de ticket', () => {
    expect(name({ merchant: 'Migros', amount: 47.3, date: '2026-05-12' }, 'IMG_1.HEIC'))
      .toBe('2026-05-12_MIGROS_47.30.heic')
  })

  it('reste lisible sans commerçant', () => {
    expect(name({ merchant: null, amount: 10, date: '2026-05-12' }, 'a.pdf'))
      .toBe('2026-05-12_JUSTIFICATIF_10.00.pdf')
  })

  it('réutilise quarterOf pour le trimestre', () => {
    expect(quarterOf('2026-05-12')).toEqual({ year: 2026, quarter: 2 })
  })
})
