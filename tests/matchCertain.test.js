import { describe, it, expect } from 'vitest'
import { memeCommercant, scoreCandidate } from '../lib/bankMatching'
import { planAutoReconcile } from '../lib/bankReconcile'

// Assouplissement demandé le 28 août 2026 : montant exact + commerçant exact
// doivent se rapprocher tout seuls, sans condition de date.
//
// Ça ne marchait pas, et pas seulement à cause du seuil. La comparaison de noms
// renvoyait un RATIO DE LONGUEURS quand un nom était contenu dans l'autre :
// « Migros » dans « MIGROS LAUSANNE GARE 4144 » valait 0,24 — sous le seuil du
// « nom proche ». Le commerçant le plus évident ne rapportait aucun point.

const debit = (o = {}) => ({
  id: 1, amount: -84.5, booking_date: '2026-08-20',
  counterparty_name: 'MIGROS LAUSANNE GARE 4144', reference: '', description: '', ...o,
})
const frais = (o = {}) => ({ id: 100, amount: 84.5, merchant: 'Migros', date: '2026-06-02', payment_method: 'company', ...o })

describe('memeCommercant — l’inclusion vaut identité', () => {
  it('reconnaît l’enseigne dans un libellé de carte', () => {
    for (const [a, b] of [
      ['Migros', 'MIGROS LAUSANNE GARE 4144'],
      ['Coop', 'COOP-2160 LAUSANNE'],
      ['Jumbo', 'JUMBO CRISSIER'],
      ['Aliexpress', 'ALIEXPRESS.COM'],
      ['Ikea SA', 'IKEA AUBONNE'],
    ]) expect(memeCommercant(a, b), `${a} ↔ ${b}`).toBe(true)
  })

  it('ne confond pas deux enseignes différentes', () => {
    for (const [a, b] of [['Migros', 'COOP LAUSANNE'], ['Jumbo', 'HORNBACH'], ['Landi', 'MANOR VEVEY']])
      expect(memeCommercant(a, b), `${a} ↔ ${b}`).toBe(false)
  })

  it('refuse les clés trop courtes, qui se retrouvent partout', () => {
    // « co » se loge dans coop, cornèr, coiffure… Sous 4 caractères, l'inclusion
    // ne veut rien dire.
    expect(memeCommercant('Co', 'COOP LAUSANNE')).toBe(false)
    expect(memeCommercant('AB', 'ABEILLE SARL')).toBe(false)
  })

  it('ignore accents, casse, ponctuation et forme juridique', () => {
    expect(memeCommercant('Café Zürich SA', 'CAFE ZURICH')).toBe(true)
  })
})

describe('scoreCandidate — le drapeau de certitude', () => {
  it('lève `certain` sur montant exact + commerçant identique', () => {
    const r = scoreCandidate(debit(), frais(), 'expense')
    expect(r.certain).toBe(true)
    expect(r.reasons).toContain('montant exact')
    expect(r.reasons).toContain('commerçant identique')
  })

  it('ne lève pas `certain` si le montant diffère, même d’un franc', () => {
    expect(scoreCandidate(debit({ amount: -85.5 }), frais(), 'expense').certain).toBeFalsy()
  })

  it('ne lève pas `certain` sur un commerçant seulement ressemblant', () => {
    expect(scoreCandidate(debit({ counterparty_name: 'MIGROL LAUSANNE' }), frais(), 'expense').certain).toBeFalsy()
  })

  it('ne lève pas `certain` sans nom de contrepartie', () => {
    expect(scoreCandidate(debit({ counterparty_name: null }), frais(), 'expense').certain).toBeFalsy()
  })
})

describe('planAutoReconcile — la certitude se passe de la date', () => {
  it('rapproche un ticket déposé deux mois après l’achat', () => {
    // Auparavant : montant exact (5) + nom ignoré (0) = 5, très loin du seuil.
    const { matched } = planAutoReconcile([debit()], { expenses: [frais()] })
    expect(matched).toHaveLength(1)
    expect(matched[0].candidate.id).toBe(100)
  })

  it('laisse à la main deux frais identiques chez le même commerçant', () => {
    // Le piège du double paiement : deux certitudes ne se départagent pas.
    const { matched, ambiguous } = planAutoReconcile([debit()], {
      expenses: [frais({ id: 100 }), frais({ id: 101 })],
    })
    expect(matched).toHaveLength(0)
    expect(ambiguous).toHaveLength(1)
  })

  it('ne rapproche pas un commerçant différent au même montant', () => {
    const { matched } = planAutoReconcile([debit()], { expenses: [frais({ merchant: 'Coop' })] })
    expect(matched).toHaveLength(0)
  })

  it('respecte toujours le sens : un crédit ne solde pas un frais', () => {
    const { matched } = planAutoReconcile([debit({ amount: 84.5 })], { expenses: [frais()] })
    expect(matched).toHaveLength(0)
  })

  it('ne rapproche pas deux fois le même document', () => {
    const { matched } = planAutoReconcile(
      [debit({ id: 1 }), debit({ id: 2 })],
      { expenses: [frais()] },
    )
    expect(matched).toHaveLength(1)
  })
})
