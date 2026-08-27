import { describe, it, expect } from 'vitest'
import { buildDevisBody } from '../lib/devisHtml'

// Une offre minimale : un item de fabrication avec une ligne de main d'œuvre.
const projet = (quote = {}) => ({
  id: 'abcd1234',
  name: 'Bar mobile',
  client: 'Red Bull',
  quote_data: {
    management: [],
    items: [{ name: 'Bar', purchases: [], labor: [{ description: 'Montage', rate: 100, quantity: 2 }] }],
    subcontracting: [],
    logistics: [],
    ...quote,
  },
})

// `items_label` et `conditions` ont été ajoutés pour l'offre annuelle de
// stockage, où « FABRICATION » et « 30 % à la commande, solde à la livraison »
// sont faux et peuvent faire recaler un bon de commande chez le client.
//
// Ces deux options sont FACULTATIVES, et ces tests sont là pour que ça le
// reste : sans elles, le document doit être identique à ce qu'il a toujours
// été. Toutes les offres déjà envoyées en dépendent.
describe('offre : libellés par défaut', () => {
  it('nomme la section des items « Fabrication »', () => {
    expect(buildDevisBody(projet(), {})).toContain('Fabrication')
  })

  it('affiche les conditions de paiement historiques', () => {
    const html = buildDevisBody(projet(), {})
    expect(html).toContain("Offre valable 30 jours à compter de la date d'émission.")
    expect(html).toContain('30 % à la commande, solde à la livraison')
    expect(html).toContain('Prix en francs suisses (CHF).')
  })

  it('ignore un items_label vide plutôt que de rendre une section sans nom', () => {
    expect(buildDevisBody(projet({ items_label: '' }), {})).toContain('Fabrication')
  })

  it('ignore des conditions vides ou mal formées', () => {
    for (const mauvais of [[], null, 'une chaîne', {}]) {
      expect(buildDevisBody(projet({ conditions: mauvais }), {}))
        .toContain('30 % à la commande, solde à la livraison')
    }
  })
})

describe('offre : libellés remplacés', () => {
  it('remplace le nom de la section des items', () => {
    const html = buildDevisBody(projet({ items_label: 'Stockage' }), {})
    expect(html).toContain('Stockage')
    expect(html).not.toContain('Fabrication')
  })

  it('remplace toutes les conditions, sans en garder aucune par défaut', () => {
    const html = buildDevisBody(projet({ conditions: ['Paiement à 30 jours net.'] }), {})
    expect(html).toContain('Paiement à 30 jours net.')
    expect(html).not.toContain('30 % à la commande')
    expect(html).not.toContain('Offre valable 30 jours')
  })

  it('laisse les totaux intacts — ces options ne touchent que du texte', () => {
    const avec = buildDevisBody(projet({ items_label: 'Stockage', conditions: ['x'] }), {})
    // 2 × 100 = 200 net, TVA 8,1 % = 16,20, total 216,20
    for (const attendu of ["200,00", "16,20", "216,20"]) expect(avec).toContain(attendu)
  })
})
