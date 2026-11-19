import { describe, it, expect } from 'vitest'
import { moisRevolu, offreArchivee, factureArchivee, peutArchiver } from '../lib/autoArchive'

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

// L'archivage automatique ne sait ranger que ce qui finit par être payé. Une
// annulée et un brouillon jamais envoyé ne le seront jamais, et restaient
// donc dans la liste courante à vie — 15 sur 50 au 19 novembre 2026.
describe('archivage manuel d’une facture', () => {
  it('ce qui est rangé à la main l’est, quel que soit le statut', () => {
    expect(factureArchivee({ status: 'cancelled', archived_at: '2026-11-19T10:00:00Z' }, LE_24_AOUT)).toBe(true)
    expect(factureArchivee({ status: 'created', archived_at: '2026-11-19T10:00:00Z' }, LE_24_AOUT)).toBe(true)
    // Même une facture encore due : si quelqu'un l'a rangée, elle est rangée.
    // Le refus se fait à la POSE du geste (`peutArchiver`), pas à la lecture.
    expect(factureArchivee({ status: 'sent', archived_at: '2026-11-19T10:00:00Z' }, LE_24_AOUT)).toBe(true)
  })

  it('sans rangement manuel, la règle automatique décide comme avant', () => {
    expect(factureArchivee({ status: 'paid', paid_at: '2026-07-28', archived_at: null }, LE_24_AOUT)).toBe(true)
    expect(factureArchivee({ status: 'cancelled', archived_at: null }, LE_24_AOUT)).toBe(false)
  })

  it('on range ce qui est clos, et le brouillon jamais parti', () => {
    expect(peutArchiver({ status: 'cancelled' })).toBe(true)
    expect(peutArchiver({ status: 'created' })).toBe(true)
    expect(peutArchiver({ status: 'paid' })).toBe(true)
  })

  // Sortir une créance ouverte de la liste, c'est se retirer de sous les yeux
  // la ligne qu'on doit relancer — pendant que « à encaisser » la compte
  // toujours, puisque ce total porte sur TOUTES les factures.
  it('on ne range pas ce qui est encore dû', () => {
    expect(peutArchiver({ status: 'sent' })).toBe(false)
    expect(peutArchiver({ status: 'pending' })).toBe(false)
  })

  it('ne propose pas d’archiver ce qui l’est déjà', () => {
    expect(peutArchiver({ status: 'paid', archived_at: '2026-11-19T10:00:00Z' })).toBe(false)
    expect(peutArchiver(null)).toBe(false)
  })
})
