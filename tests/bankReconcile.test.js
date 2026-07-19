import { describe, it, expect } from 'vitest'
import { planAutoReconcile, paymentDateOf, AUTO_MIN_SCORE, AUTO_MIN_GAP } from '../lib/bankReconcile'

// Un débit fournisseur type (montant négatif) avec référence QR.
const debit = (over = {}) => ({
  id: 1, amount: -1297.20, booking_date: '2026-05-14', value_date: '2026-05-14',
  reference: '210000000003139471430009017', counterparty_iban: 'CH9300762011623852957',
  counterparty_name: 'BOIS SA', matched_to_type: null, ...over,
})

// Une facture fournisseur correspondante.
const invoice = (over = {}) => ({
  id: 10, supplier_name: 'BOIS SA', invoice_number: '2026-0451', amount: 1297.20,
  iban: 'CH9300762011623852957', payment_reference: '210000000003139471430009017',
  due_date: '2026-05-14', status: 'sent_to_bank', scheduled_payment_date: '2026-05-14', ...over,
})

describe('planAutoReconcile', () => {
  it('rapproche un débit qui correspond exactement (montant + référence + IBAN)', () => {
    const { matched, ambiguous } = planAutoReconcile([debit()], [invoice()])
    expect(matched).toHaveLength(1)
    expect(ambiguous).toHaveLength(0)
    expect(matched[0].invoice.id).toBe(10)
    expect(matched[0].score).toBeGreaterThanOrEqual(AUTO_MIN_SCORE)
  })

  it('ignore un crédit (encaissement), jamais un paiement fournisseur', () => {
    const { matched } = planAutoReconcile([debit({ amount: 1297.20 })], [invoice()])
    expect(matched).toHaveLength(0)
  })

  it('ignore une transaction déjà rapprochée', () => {
    const { matched } = planAutoReconcile([debit({ matched_to_type: 'supplier_invoice' })], [invoice()])
    expect(matched).toHaveLength(0)
  })

  it('ne rapproche pas un montant seul, sans preuve d\'identité du bénéficiaire', () => {
    // Montant exact mais ni référence, ni IBAN, ni date annoncée → score sous le seuil.
    const tx = debit({ reference: 'REMBOURSEMENT DIVERS', counterparty_iban: null, counterparty_name: 'AUTRE' })
    const inv = invoice({ payment_reference: null, iban: null, scheduled_payment_date: null,
      supplier_name: 'AUTRE', due_date: '2026-01-01' })
    const { matched } = planAutoReconcile([tx], [inv])
    expect(matched).toHaveLength(0)
  })

  it('laisse à la main deux factures identiques indissociables', () => {
    // Même montant, même fournisseur, sans référence discriminante dans le débit.
    const tx = debit({ reference: '', counterparty_iban: null })
    const a = invoice({ id: 10, payment_reference: null, iban: null })
    const b = invoice({ id: 11, payment_reference: null, iban: null })
    const { matched, ambiguous } = planAutoReconcile([tx], [a, b])
    expect(matched).toHaveLength(0)
    expect(ambiguous).toHaveLength(1)
    expect(ambiguous[0].candidates).toHaveLength(2)
  })

  it('n\'affecte pas deux débits à la même facture', () => {
    const t1 = debit({ id: 1 })
    const t2 = debit({ id: 2 })
    const { matched } = planAutoReconcile([t1, t2], [invoice()])
    expect(matched).toHaveLength(1)
  })

  it('rapproche chaque débit à sa propre facture', () => {
    const t1 = debit({ id: 1, amount: -1297.20, reference: 'REF-A', counterparty_iban: 'CH11' })
    const t2 = debit({ id: 2, amount: -500.00,  reference: 'REF-B', counterparty_iban: 'CH22' })
    const a = invoice({ id: 10, amount: 1297.20, payment_reference: 'REF-A', iban: 'CH11' })
    const b = invoice({ id: 11, amount: 500.00,  payment_reference: 'REF-B', iban: 'CH22', supplier_name: 'AUTRE SA' })
    const { matched } = planAutoReconcile([t1, t2], [a, b])
    expect(matched).toHaveLength(2)
    expect(matched.find(m => m.tx.id === 1).invoice.id).toBe(10)
    expect(matched.find(m => m.tx.id === 2).invoice.id).toBe(11)
  })
})

describe('paymentDateOf', () => {
  it('prend la date de comptabilisation du débit', () => {
    expect(paymentDateOf({ booking_date: '2026-05-14', value_date: '2026-05-15' })).toBe('2026-05-14')
  })
  it('retombe sur la date de valeur si la comptabilisation manque', () => {
    expect(paymentDateOf({ booking_date: null, value_date: '2026-05-15' })).toBe('2026-05-15')
  })
  it('renvoie null sans date exploitable', () => {
    expect(paymentDateOf({})).toBe(null)
  })
})

describe('constantes de sûreté', () => {
  it('exige au moins montant exact + une preuve d\'identité', () => {
    expect(AUTO_MIN_SCORE).toBeGreaterThanOrEqual(8)
    expect(AUTO_MIN_GAP).toBeGreaterThanOrEqual(1)
  })
})
