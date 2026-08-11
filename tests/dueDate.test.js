import { describe, it, expect } from 'vitest'
import { defaultDueDate } from '../lib/dueDate'

describe('defaultDueDate', () => {
  it('ajoute 30 jours à la date d\'émission', () => {
    expect(defaultDueDate('2026-05-12')).toBe('2026-06-11')
  })

  it('franchit correctement une fin de mois', () => {
    expect(defaultDueDate('2026-01-31')).toBe('2026-03-02')  // 2026 non bissextile
    expect(defaultDueDate('2026-04-15')).toBe('2026-05-15')
  })

  it('franchit correctement une fin d\'année', () => {
    expect(defaultDueDate('2026-12-20')).toBe('2027-01-19')
  })

  it('gère une année bissextile', () => {
    expect(defaultDueDate('2028-01-31')).toBe('2028-03-01')  // février compte 29 jours
  })

  it('part d\'aujourd\'hui si la date d\'émission manque ou est illisible', () => {
    const today = new Date('2026-05-12T10:00:00Z')
    expect(defaultDueDate(null, 30, today)).toBe('2026-06-11')
    expect(defaultDueDate('', 30, today)).toBe('2026-06-11')
    expect(defaultDueDate('12.05.2026', 30, today)).toBe('2026-06-11')
  })

  it('ne décale pas d\'un jour selon le fuseau (calcul en UTC)', () => {
    // Un serveur en UTC-x ferait basculer la veille avec un calcul en heure locale.
    expect(defaultDueDate('2026-01-01')).toBe('2026-01-31')
  })

  it('accepte un autre délai', () => {
    expect(defaultDueDate('2026-05-12', 10)).toBe('2026-05-22')
  })
})
