import { describe, it, expect } from 'vitest'
import { QUOTE_STATUSES, quoteStatusMeta, quoteStripe, offreAFaire } from '../lib/quoteStatus'
import { C } from '../lib/theme'

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

describe('quoteStripe — pastille d\'offre de la carte projet', () => {
  it('rouge quand il n\'y a rien à montrer au client', () => {
    expect(quoteStripe(null)).toBe(C.danger)                      // aucune offre
    expect(quoteStripe(undefined)).toBe(C.danger)
    expect(quoteStripe({})).toBe(C.danger)                        // quote_data sans statut
    expect(quoteStripe({ status: 'brouillon' })).toBe(C.danger)
    expect(quoteStripe({ status: 'a_corriger' })).toBe(C.danger)
  })

  it('vert une fois l\'offre acceptée', () => {
    expect(quoteStripe({ status: 'accepte' })).toBe(C.success)
  })

  it('gris quand l\'offre est refusée — dossier clos, pas une alerte', () => {
    expect(quoteStripe({ status: 'refuse' })).toBe(C.muted)
  })

  it('aucune pastille tant que la balle est chez le client', () => {
    expect(quoteStripe({ status: 'envoye' })).toBeNull()
  })

  it('une clé inconnue est traitée comme une offre à faire, jamais comme acceptée', () => {
    expect(quoteStripe({ status: 'zzz' })).toBe(C.danger)
  })

  // La pastille doit rester lisible à côté du liseré haut : les deux se lisent
  // sur la même carte, et n'ont pas le droit de se confondre.
  it('n\'utilise que des jetons du thème', () => {
    const attendus = [C.danger, C.success, C.muted, null]
    for (const s of [...QUOTE_STATUSES.map(q => ({ status: q.key })), null, {}]) {
      expect(attendus).toContain(quoteStripe(s))
    }
  })
})

describe('offreAFaire — fond de la carte projet', () => {
  it('vrai quand rien n\'est parti au client', () => {
    expect(offreAFaire(null)).toBe(true)         // aucune offre
    expect(offreAFaire(undefined)).toBe(true)
    expect(offreAFaire({})).toBe(true)           // quote_data sans statut
    expect(offreAFaire({ status: 'brouillon' })).toBe(true)
  })

  it('faux dès que l\'offre est sortie', () => {
    expect(offreAFaire({ status: 'envoye' })).toBe(false)
    expect(offreAFaire({ status: 'accepte' })).toBe(false)
    expect(offreAFaire({ status: 'refuse' })).toBe(false)
  })

  // Le cas qui distingue ce signal de la pastille : « à corriger » appelle une
  // action, mais l'offre est DÉJÀ partie une fois. La pastille la signale, le
  // fond non — sans quoi le fond ne veut plus dire « rien n'est parti ».
  it('faux pour « à corriger », que la pastille signale pourtant en rouge', () => {
    expect(offreAFaire({ status: 'a_corriger' })).toBe(false)
    expect(quoteStripe({ status: 'a_corriger' })).toBe(C.danger)
  })

  it('un statut inconnu n\'allume pas la carte', () => {
    expect(offreAFaire({ status: 'zzz' })).toBe(false)
  })
})
