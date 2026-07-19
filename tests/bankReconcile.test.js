import { describe, it, expect } from 'vitest'
import { planAutoReconcile, paymentDateOf, AUTO_MIN_SCORE, AUTO_MIN_GAP } from '../lib/bankReconcile'

// Un débit fournisseur type (montant négatif) avec référence QR.
const debit = (over = {}) => ({
  id: 1, amount: -1297.20, booking_date: '2026-05-14', value_date: '2026-05-14',
  reference: '210000000003139471430009017', counterparty_iban: 'CH9300762011623852957',
  counterparty_name: 'BOIS SA', matched_to_type: null, ...over,
})

const supplierInvoice = (over = {}) => ({
  id: 10, supplier_name: 'BOIS SA', invoice_number: '2026-0451', amount: 1297.20,
  iban: 'CH9300762011623852957', payment_reference: '210000000003139471430009017',
  due_date: '2026-05-14', status: 'sent_to_bank', scheduled_payment_date: '2026-05-14', ...over,
})

describe('planAutoReconcile — factures fournisseurs (débits)', () => {
  it('rapproche un débit qui correspond exactement (montant + référence + IBAN)', () => {
    const { matched, ambiguous } = planAutoReconcile([debit()], { supplier_invoices: [supplierInvoice()] })
    expect(matched).toHaveLength(1)
    expect(ambiguous).toHaveLength(0)
    expect(matched[0].type).toBe('supplier_invoice')
    expect(matched[0].candidate.id).toBe(10)
    expect(matched[0].score).toBeGreaterThanOrEqual(AUTO_MIN_SCORE)
  })

  it('ignore une transaction déjà rapprochée', () => {
    const { matched } = planAutoReconcile([debit({ matched_to_type: 'supplier_invoice' })], { supplier_invoices: [supplierInvoice()] })
    expect(matched).toHaveLength(0)
  })

  it('ne rapproche pas un montant seul, sans preuve d\'identité du bénéficiaire', () => {
    const tx = debit({ reference: 'REMBOURSEMENT DIVERS', counterparty_iban: null, counterparty_name: 'AUTRE' })
    const inv = supplierInvoice({ payment_reference: null, iban: null, scheduled_payment_date: null,
      supplier_name: 'AUTRE', due_date: '2026-01-01' })
    const { matched } = planAutoReconcile([tx], { supplier_invoices: [inv] })
    expect(matched).toHaveLength(0)
  })

  it('laisse à la main deux factures identiques indissociables', () => {
    const tx = debit({ reference: '', counterparty_iban: null })
    const a = supplierInvoice({ id: 10, payment_reference: null, iban: null })
    const b = supplierInvoice({ id: 11, payment_reference: null, iban: null })
    const { matched, ambiguous } = planAutoReconcile([tx], { supplier_invoices: [a, b] })
    expect(matched).toHaveLength(0)
    expect(ambiguous).toHaveLength(1)
  })

  it('n\'affecte pas deux débits à la même facture', () => {
    const { matched } = planAutoReconcile([debit({ id: 1 }), debit({ id: 2 })], { supplier_invoices: [supplierInvoice()] })
    expect(matched).toHaveLength(1)
  })
})

describe('planAutoReconcile — frais carte société (débits)', () => {
  const expense = (over = {}) => ({
    id: 20, merchant: 'MIGROS', amount: 47.30, date: '2026-05-12', payment_method: 'company', ...over,
  })
  const cardDebit = (over = {}) => ({
    id: 3, amount: -47.30, booking_date: '2026-05-12', value_date: '2026-05-12',
    reference: '', counterparty_iban: null, counterparty_name: 'MIGROS', matched_to_type: null, ...over,
  })

  it('rapproche un frais quand montant + commerçant + date collent', () => {
    const { matched } = planAutoReconcile([cardDebit()], { expenses: [expense()] })
    expect(matched).toHaveLength(1)
    expect(matched[0].type).toBe('expense')
    expect(matched[0].candidate.id).toBe(20)
  })

  it('ne rapproche pas un frais sur le seul montant (commerçant absent)', () => {
    const { matched } = planAutoReconcile([cardDebit({ counterparty_name: '' })], { expenses: [expense()] })
    expect(matched).toHaveLength(0)
  })

  it('ne mélange pas un frais avec un crédit', () => {
    const { matched } = planAutoReconcile([cardDebit({ amount: 47.30 })], { expenses: [expense()] })
    expect(matched).toHaveLength(0)
  })
})

describe('planAutoReconcile — factures émises (crédits)', () => {
  const customerInvoice = (over = {}) => ({
    id: 30, client_name: 'DIAGEO', invoice_number: '2026-012', amount: 5000.00,
    qr_reference: '210000000003139471430009999', due_date: '2026-05-20', status: 'pending', ...over,
  })
  const credit = (over = {}) => ({
    id: 4, amount: 5000.00, booking_date: '2026-05-21', value_date: '2026-05-21',
    reference: '210000000003139471430009999', counterparty_iban: null,
    counterparty_name: 'DIAGEO', matched_to_type: null, ...over,
  })

  it('rapproche un encaissement à sa facture émise (montant + référence QR)', () => {
    const { matched } = planAutoReconcile([credit()], { customer_invoices: [customerInvoice()] })
    expect(matched).toHaveLength(1)
    expect(matched[0].type).toBe('customer_invoice')
    expect(matched[0].candidate.id).toBe(30)
  })

  it('ne rapproche pas un crédit à une facture fournisseur', () => {
    const { matched } = planAutoReconcile([credit()], { supplier_invoices: [supplierInvoice({ amount: 5000, payment_reference: '210000000003139471430009999' })] })
    expect(matched).toHaveLength(0)
  })
})

describe('planAutoReconcile — types mélangés', () => {
  it('route chaque transaction vers le bon type sans collision', () => {
    const supDebit = debit({ id: 1 })
    const expDebit = { id: 3, amount: -47.30, booking_date: '2026-05-12', counterparty_name: 'MIGROS', reference: '', matched_to_type: null }
    const candidates = {
      supplier_invoices: [supplierInvoice()],
      expenses: [{ id: 20, merchant: 'MIGROS', amount: 47.30, date: '2026-05-12', payment_method: 'company' }],
    }
    const { matched } = planAutoReconcile([supDebit, expDebit], candidates)
    expect(matched).toHaveLength(2)
    expect(matched.find(m => m.tx.id === 1).type).toBe('supplier_invoice')
    expect(matched.find(m => m.tx.id === 3).type).toBe('expense')
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
