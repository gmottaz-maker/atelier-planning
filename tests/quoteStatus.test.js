import { describe, it, expect } from 'vitest'
import { QUOTE_STATUSES, quoteStatusMeta } from '../lib/quoteStatus'

describe('quoteStatusMeta', () => {
  it('renvoie le bon statut pour une clé connue', () => {
    expect(quoteStatusMeta('accepte').label).toBe('Accepté')
    expect(quoteStatusMeta('refuse').label).toBe('Refusé')
  })

  it('retombe sur Brouillon pour une clé inconnue ou vide', () => {
    expect(quoteStatusMeta('inconnu').key).toBe('brouillon')
    expect(quoteStatusMeta(undefined).key).toBe('brouillon')
  })

  it('chaque statut a label, color et bg', () => {
    for (const s of QUOTE_STATUSES) {
      expect(s.label).toBeTruthy()
      expect(s.color).toMatch(/^#/)
      expect(s.bg).toMatch(/^#/)
    }
  })
})
