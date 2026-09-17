import { describe, it, expect } from 'vitest'
import { categorieOffre, compterOffres, CATEGORIES_OFFRE } from '../lib/quoteStatus'

describe('categorieOffre — ce que la liste des projets regroupe', () => {
  it('range sous « à faire » tout ce qui attend une action de notre côté', () => {
    expect(categorieOffre(undefined)).toBe('a_faire')          // aucune offre
    expect(categorieOffre({})).toBe('a_faire')                  // offre commencée, sans statut
    expect(categorieOffre({ status: 'brouillon' })).toBe('a_faire')
    expect(categorieOffre({ status: 'a_corriger' })).toBe('a_faire')
  })

  it('distingue ce qui est chez le client de ce qui est tranché', () => {
    expect(categorieOffre({ status: 'envoye' })).toBe('envoye')
    expect(categorieOffre({ status: 'accepte' })).toBe('accepte')
    expect(categorieOffre({ status: 'refuse' })).toBe('refuse')
  })

  it('un statut inconnu compte comme à faire plutôt que de disparaître du filtre', () => {
    expect(categorieOffre({ status: 'fantaisie' })).toBe('a_faire')
  })

  it('compte tous les projets, sans en perdre en route', () => {
    const projets = [
      { quote_data: { status: 'accepte' } },
      { quote_data: { status: 'accepte' } },
      { quote_data: { status: 'envoye' } },
      { quote_data: null },
      {},
    ]
    const total = compterOffres(projets)
    expect(total).toEqual({ a_faire: 2, envoye: 1, accepte: 2, refuse: 0 })
    expect(Object.values(total).reduce((a, b) => a + b, 0)).toBe(projets.length)
  })

  it('les catégories couvrent tous les statuts d\'offre existants', () => {
    expect(CATEGORIES_OFFRE.map(c => c.key)).toEqual(['a_faire', 'envoye', 'accepte', 'refuse'])
  })
})
