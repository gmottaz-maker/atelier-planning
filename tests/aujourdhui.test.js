import { describe, it, expect, vi, afterEach } from 'vitest'
import { dateDuJour, jourLocal } from '../lib/aujourdhui'

// Ces deux fonctions existent parce que la variante naïve s'est déjà refermée
// deux fois : une facture déclarée en retard le jour même où elle est due, et
// une tâche cochée le soir comptée pour le lendemain.

describe('dateDuJour', () => {
  afterEach(() => vi.useRealTimers())

  it('rend le jour LOCAL, pas le jour UTC', () => {
    vi.useFakeTimers()
    // 22h30 à Zurich le 3 septembre = 20h30 UTC : même jour des deux côtés.
    vi.setSystemTime(new Date('2026-09-03T20:30:00Z'))
    expect(dateDuJour()).toBe('2026-09-03')
    // 00h30 UTC le 4 = 02h30 à Zurich le 4 : le jour local a déjà changé.
    vi.setSystemTime(new Date('2026-09-04T00:30:00Z'))
    expect(dateDuJour()).toBe('2026-09-04')
  })

  it('complète les mois et les jours à deux chiffres', () => {
    expect(dateDuJour(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('jourLocal — le jour vécu, pas le jour UTC', () => {
  // Le cas qui a motivé la fonction : en Suisse d'été (UTC+2), tout ce qui se
  // passe après 22h00 locales est déjà daté du lendemain en UTC.
  it('une action de 23h le 3 appartient au 3, pas au 4', () => {
    expect(jourLocal('2026-09-03T21:30:00Z')).toBe('2026-09-03')   // 23h30 à Zurich
  })

  it('une action de 01h le 4 appartient au 4, pas au 3', () => {
    expect(jourLocal('2026-09-03T23:30:00Z')).toBe('2026-09-04')   // 01h30 à Zurich
  })

  // C'est exactement ce que « created_at.split('T')[0] » se trompait à faire.
  it('diffère du découpage naïf de la chaîne UTC', () => {
    const iso = '2026-09-03T22:15:00Z'
    expect(iso.split('T')[0]).toBe('2026-09-03')
    expect(jourLocal(iso)).toBe('2026-09-04')     // il est minuit passé à Zurich
  })

  it('tolère une valeur absente ou illisible', () => {
    expect(jourLocal(null)).toBeNull()
    expect(jourLocal(undefined)).toBeNull()
    expect(jourLocal('')).toBeNull()
    expect(jourLocal('pas une date')).toBeNull()
  })

  it('accepte un objet Date autant qu\'une chaîne', () => {
    expect(jourLocal(new Date('2026-09-04T10:00:00Z'))).toBe('2026-09-04')
  })
})
