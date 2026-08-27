import { describe, it, expect } from 'vitest'
import { moisRevolu, offreArchivee, factureArchivee } from '../lib/autoArchive'

// Référence fixe : 24 août 2026. Sans date fixe, ces tests deviendraient faux
// au changement de mois — exactement le bug qu'ils sont censés attraper.
const LE_24_AOUT = new Date('2026-08-24T10:00:00Z')

describe('moisRevolu', () => {
  it('est faux pour une date du mois courant, y compris le dernier jour', () => {
    expect(moisRevolu('2026-08-01', LE_24_AOUT)).toBe(false)
    expect(moisRevolu('2026-08-24', LE_24_AOUT)).toBe(false)
    expect(moisRevolu('2026-08-31', LE_24_AOUT)).toBe(false)
  })

  it('est vrai dès le mois précédent', () => {
    expect(moisRevolu('2026-07-31', LE_24_AOUT)).toBe(true)
    expect(moisRevolu('2025-12-01', LE_24_AOUT)).toBe(true)
  })

  it('est faux dans le futur, et pour une date absente ou invalide', () => {
    expect(moisRevolu('2026-09-01', LE_24_AOUT)).toBe(false)
    expect(moisRevolu(null, LE_24_AOUT)).toBe(false)
    expect(moisRevolu('', LE_24_AOUT)).toBe(false)
    expect(moisRevolu('pas une date', LE_24_AOUT)).toBe(false)
  })

  it('compare des mois, pas des durées : 30 jours à cheval ne suffisent pas', () => {
    // Le 26 juillet est à moins de 30 jours, mais son mois est révolu.
    expect(moisRevolu('2026-07-26', LE_24_AOUT)).toBe(true)
  })
})

describe('offreArchivee', () => {
  it('respecte l’archivage manuel, sans regarder la facture', () => {
    expect(offreArchivee({ archived: true }, LE_24_AOUT)).toBe(true)
  })

  it('laisse une offre non facturée dans la liste courante', () => {
    expect(offreArchivee({ archived: false, invoice: null }, LE_24_AOUT)).toBe(false)
  })

  it('garde une offre facturée ce mois-ci, archive celle du mois passé', () => {
    expect(offreArchivee({ invoice: { issue_date: '2026-08-02' } }, LE_24_AOUT)).toBe(false)
    expect(offreArchivee({ invoice: { issue_date: '2026-07-30' } }, LE_24_AOUT)).toBe(true)
  })

  it('se rabat sur created_at quand la date d’émission manque', () => {
    expect(offreArchivee({ invoice: { created_at: '2026-06-15' } }, LE_24_AOUT)).toBe(true)
  })
})

describe('factureArchivee', () => {
  it('n’archive que les factures payées', () => {
    expect(factureArchivee({ status: 'sent', paid_at: '2026-07-01' }, LE_24_AOUT)).toBe(false)
    expect(factureArchivee({ status: 'overdue', issue_date: '2026-01-01' }, LE_24_AOUT)).toBe(false)
  })

  it('garde une facture payée ce mois-ci', () => {
    expect(factureArchivee({ status: 'paid', paid_at: '2026-08-20' }, LE_24_AOUT)).toBe(false)
  })

  it('archive une facture payée un mois révolu', () => {
    expect(factureArchivee({ status: 'paid', paid_at: '2026-07-28' }, LE_24_AOUT)).toBe(true)
  })

  it('se rabat sur la date d’émission quand le paiement n’est pas daté', () => {
    // Une facture marquée payée sans date ne doit pas rester en tête de liste
    // indéfiniment.
    expect(factureArchivee({ status: 'paid', paid_at: null, issue_date: '2026-05-04' }, LE_24_AOUT)).toBe(true)
    expect(factureArchivee({ status: 'paid', paid_at: null, issue_date: '2026-08-04' }, LE_24_AOUT)).toBe(false)
  })
})
