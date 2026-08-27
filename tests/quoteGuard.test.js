import { describe, it, expect } from 'vitest'
import { devisAEcrire, lignesDevis } from '../lib/quoteGuard'

// Régression : entre le 21 et le 27 août 2026, trois offres ont été détruites
// par un simple changement de phase depuis la liste des projets. La liste
// charge `?light=1`, qui réduit `quote_data` à `{ status }`, et renvoyait le
// projet entier en PUT — moignon compris. Le serveur remplaçait l'offre par lui.

const complet = {
  status: 'accepte',
  number: '2026-0042',
  management: [{ item: 'Gestion', rate: 120, quantity: 4 }],
  items: [{ name: 'Bar', purchases: [{ description: 'MDF', unit_price: 80, quantity: 3 }], labor: [] }],
  subcontracting: [],
  logistics: [{ trajet: 'Aller', rate: 90, quantity: 1 }],
}
const vide = { status: 'brouillon', management: [], items: [], subcontracting: [], logistics: [] }

describe('lignesDevis', () => {
  it('compte toutes les sections', () => expect(lignesDevis(complet)).toBe(3))
  it('vaut 0 pour un devis vide, nul ou absurde', () => {
    for (const q of [vide, null, undefined, {}, { status: 'accepte' }, 'x', 42]) expect(lignesDevis(q)).toBe(0)
  })
})

describe('devisAEcrire — ce qui est refusé', () => {
  it('refuse le moignon `{ status }` que renvoie ?light=1', () => {
    const v = devisAEcrire(complet, { status: 'accepte' })
    expect(v.ecrire).toBe(false)
    expect(v.raison).toContain('3 ligne(s) préservée(s)')
  })

  it('refuse null et undefined', () => {
    expect(devisAEcrire(complet, null).ecrire).toBe(false)
    expect(devisAEcrire(complet, undefined).ecrire).toBe(false)
  })

  it('ne perd aucune ligne même quand le moignon porte d’autres champs', () => {
    // Le moignon se reconnaît à l'ABSENCE des sections. Ici il change aussi le
    // statut : la fonction l'accepte, mais SANS toucher aux lignes. Ce qui
    // compte n'est pas qu'elle refuse d'écrire, c'est qu'elle ne perde rien.
    const v = devisAEcrire(complet, { status: 'brouillon', number: 'X' })
    expect(v.valeur.items).toHaveLength(1)
    expect(v.valeur.management).toHaveLength(1)
    expect(v.valeur.logistics).toHaveLength(1)
    expect(v.valeur.status).toBe('brouillon')
    // Les champs hors sections du moignon ne s'imposent pas non plus.
    expect(v.valeur.number).toBe('2026-0042')
  })
})

describe('devisAEcrire — ce qui passe', () => {
  it('laisse créer un devis là où il n’y en avait pas', () => {
    for (const avant of [null, undefined, {}, vide]) {
      const v = devisAEcrire(avant, complet)
      expect(v.ecrire).toBe(true)
      expect(v.valeur).toEqual(complet)
    }
  })

  it('laisse VIDER un devis : l’éditeur envoie les quatre sections, vides', () => {
    // Distinct du moignon : ici les tableaux sont présents. C'est une intention.
    const v = devisAEcrire(complet, vide)
    expect(v.ecrire).toBe(true)
    expect(v.valeur).toEqual(vide)
  })

  it('laisse raccourcir un devis — supprimer des lignes est une intention', () => {
    const court = { status: 'brouillon', management: [], items: [{ name: 'Podium', purchases: [], labor: [] }], subcontracting: [], logistics: [] }
    expect(devisAEcrire(complet, court)).toEqual({ ecrire: true, valeur: court })
  })

  it('accepte un no-op sur un devis déjà vide', () => {
    expect(devisAEcrire(vide, vide).ecrire).toBe(true)
  })

  it('laisse passer un changement de STATUT porté par le moignon, sans perdre une ligne', () => {
    // La liste des offres fait passer un devis de « envoyé » à « accepté » avec
    // la charge allégée : ce cas doit rester possible.
    const v = devisAEcrire(complet, { status: 'facture' })
    expect(v.ecrire).toBe(true)
    expect(v.valeur.status).toBe('facture')
    expect(v.valeur.items).toHaveLength(1)
    expect(v.valeur.management).toHaveLength(1)
    expect(v.valeur.logistics).toHaveLength(1)
    expect(v.valeur.number).toBe('2026-0042')
  })

  it('ne réécrit rien quand le moignon porte le MÊME statut', () => {
    expect(devisAEcrire(complet, { status: 'accepte' }).ecrire).toBe(false)
  })
})
