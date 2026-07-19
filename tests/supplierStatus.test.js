import { describe, it, expect } from 'vitest'
import { effectiveStatus, DISPLAY_STATUSES, STATUS_ORDER } from '../lib/supplierStatus'

const TODAY = '2026-07-17'

describe('effectiveStatus', () => {
  it('marque en retard une facture échue non payée', () => {
    expect(effectiveStatus({ status: 'pending', due_date: '2026-07-16' }, TODAY)).toBe('overdue')
  })

  it('ne marque pas en retard une facture échue aujourd\'hui', () => {
    expect(effectiveStatus({ status: 'pending', due_date: TODAY }, TODAY)).toBe('pending')
  })

  it('ne marque jamais en retard un ordre transmis à la banque', () => {
    // L'ordre est parti : le retard ne dépend plus de nous.
    expect(effectiveStatus({ status: 'sent_to_bank', due_date: '2026-01-01' }, TODAY)).toBe('sent_to_bank')
  })

  it('ne marque jamais en retard une facture payée', () => {
    expect(effectiveStatus({ status: 'paid', due_date: '2026-01-01' }, TODAY)).toBe('paid')
  })

  it('reste « à payer » sans échéance', () => {
    expect(effectiveStatus({ status: 'pending', due_date: null }, TODAY)).toBe('pending')
  })

  it('supporte une facture absente', () => {
    expect(effectiveStatus(null, TODAY)).toBe('pending')
  })

  it('expose un libellé et une couleur pour chaque statut affichable', () => {
    for (const key of STATUS_ORDER) {
      expect(DISPLAY_STATUSES[key]?.label).toBeTruthy()
      expect(DISPLAY_STATUSES[key]?.color).toMatch(/^#/)
    }
  })
})
