import { describe, it, expect } from 'vitest'
import { invoiceCopyBody, offerCopy } from '../lib/duplicateDoc'

const paid = {
  id: 12, invoice_number: '2026-002', qr_reference: '2100000000031394714300',
  project_id: 'p1', client_name: 'DIAGEO Suisse', client_address: 'Rue X 1',
  object: 'MJF 2026', amount: 70798.15, amount_net: 65493.2, vat_rate: 8.1, vat_amount: 5304.95,
  currency: 'CHF', iban_recipient: 'CH93…', notes: 'Merci', detail_level: 'summary',
  discount_label: 'Remise', discount_rate: 5, discount_amount: 100,
  quote_snapshot: { items: [{ name: 'Bar', purchases: [], labor: [] }] },
  issue_date: '2026-07-14', due_date: '2026-08-13',
  status: 'paid', sent_at: '2026-08-10T10:00:00Z', paid_at: '2026-08-10', paid_transaction_id: 44,
}

describe('invoiceCopyBody', () => {
  const copy = invoiceCopyBody(paid, '2026-08-20')

  it('reprend le contenu facturable', () => {
    expect(copy.client_name).toBe('DIAGEO Suisse')
    expect(copy.amount).toBe(70798.15)
    expect(copy.quote_snapshot).toEqual(paid.quote_snapshot)
    expect(copy.object).toBe('MJF 2026')
    expect(copy.detail_level).toBe('summary')
  })

  it('reprend l\'escompte', () => {
    expect(copy.discount_label).toBe('Remise')
    expect(copy.discount_rate).toBe(5)
    expect(copy.discount_amount).toBe(100)
  })

  it('ne recopie JAMAIS le numéro ni la référence QR', () => {
    expect(copy.invoice_number).toBeUndefined()
    expect(copy.qr_reference).toBeUndefined()
  })

  it('ne recopie pas l\'état de paiement', () => {
    expect(copy.status).toBe('created')
    expect(copy.sent_at).toBeUndefined()
    expect(copy.paid_at).toBeUndefined()
    expect(copy.paid_transaction_id).toBeUndefined()
  })

  it('repart des dates du jour, échéance à 30 jours', () => {
    expect(copy.issue_date).toBe('2026-08-20')
    expect(copy.due_date).toBe('2026-09-19')
  })
})

describe('offerCopy', () => {
  const src = {
    management: [{ item: 'Projet' }], items: [{ name: 'Bar' }],
    subcontracting: [], logistics: [{ trajet: 'Montage' }], general_margin: '20',
    status: 'accepte', number: '2026-014', sent_date: '2026-05-01', archived: true,
  }
  const copy = offerCopy(src)

  it('garde les positions et la marge', () => {
    expect(copy.items).toEqual(src.items)
    expect(copy.management).toEqual(src.management)
    expect(copy.logistics).toEqual(src.logistics)
    expect(copy.general_margin).toBe('20')
  })

  it('repart en brouillon, sans numéro, sans date d\'envoi ni archivage', () => {
    expect(copy.status).toBe('brouillon')
    expect(copy.number).toBe('')
    expect(copy.sent_date).toBeUndefined()
    expect(copy.archived).toBeUndefined()
  })

  it('tolère un devis vide', () => {
    expect(offerCopy(null).items).toEqual([])
    expect(offerCopy(undefined).status).toBe('brouillon')
  })
})
