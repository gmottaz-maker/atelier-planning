import { describe, it, expect } from 'vitest'
import { effectiveStatus, DISPLAY_STATUSES, STATUS_ORDER, correspondAuFiltre } from '../lib/supplierStatus'

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

describe('correspondAuFiltre — filtres de la liste', () => {
  const AUJ = '2026-09-04'
  const enRetard   = { status: 'pending',      due_date: '2026-08-01' }
  const aPayer     = { status: 'pending',      due_date: '2026-12-01' }
  const sansDate   = { status: 'pending',      due_date: null }
  const transmise  = { status: 'sent_to_bank', due_date: '2026-08-01' }
  const payee      = { status: 'paid',         due_date: '2026-08-01' }
  const toutes     = [enRetard, aPayer, sansDate, transmise, payee]
  const gardees    = f => toutes.filter(i => correspondAuFiltre(i, f, AUJ))

  // Le défaut corrigé : effectiveStatus rend « overdue » À LA PLACE de
  // « pending », donc une égalité stricte sortait les factures en retard du
  // filtre le plus utilisé.
  it('« À payer » inclut les factures en retard', () => {
    expect(correspondAuFiltre(enRetard, 'pending', AUJ)).toBe(true)
    expect(gardees('pending')).toEqual([enRetard, aPayer, sansDate])
  })

  it('« En retard » n\'affiche QUE les factures en retard', () => {
    expect(gardees('overdue')).toEqual([enRetard])
  })

  it('« À payer » n\'avale pas les transmises ni les payées', () => {
    expect(correspondAuFiltre(transmise, 'pending', AUJ)).toBe(false)
    expect(correspondAuFiltre(payee, 'pending', AUJ)).toBe(false)
  })

  it('les deux autres filtres restent des égalités', () => {
    expect(gardees('sent_to_bank')).toEqual([transmise])
    expect(gardees('paid')).toEqual([payee])
  })

  it('« Toutes » ne retire rien', () => {
    expect(gardees('all')).toEqual(toutes)
  })

  // Une clé inconnue ne doit pas vider l'écran sans explication.
  it('un filtre inconnu n\'ampute pas la liste', () => {
    expect(gardees('zzz')).toEqual(toutes)
  })

  // Une facture transmise à la banque n'est jamais « en retard », même échue :
  // l'ordre est parti, c'est déjà la règle d'effectiveStatus.
  it('une transmise échue ne tombe pas dans « En retard »', () => {
    expect(correspondAuFiltre(transmise, 'overdue', AUJ)).toBe(false)
  })
})
