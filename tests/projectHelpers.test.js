import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  toDateStr, isCompletedToday, fmtDate, getDaysRemaining, getProjectColor,
  ensureUid, initLogistics, parseTimeRange, combineTime, fmtTimeDisplay, fmtTaskDate,
} from '../lib/projectHelpers'

// Date figée : ces fonctions dépendent d'« aujourd'hui », un test qui s'appuie
// sur l'horloge réelle finit par échouer un jour donné.
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 7, 18, 10, 0, 0)) })
afterEach(() => vi.useRealTimers())

describe('dates', () => {
  it('formate une date locale sans décalage UTC', () => {
    expect(toDateStr(new Date(2026, 0, 1))).toBe('2026-01-01')
    expect(toDateStr(new Date(2026, 11, 31))).toBe('2026-12-31')
  })

  it('rend une date en toutes lettres', () => {
    expect(fmtDate('2026-09-01')).toMatch(/1 septembre 2026/)
    expect(fmtDate(null)).toBe('—')
  })

  it('compte les jours restants, signés', () => {
    expect(getDaysRemaining('2026-08-18')).toBe(0)
    expect(getDaysRemaining('2026-08-25')).toBe(7)
    expect(getDaysRemaining('2026-08-11')).toBe(-7)
    expect(getDaysRemaining(null)).toBeNull()
  })
})

describe('couleur d\'un projet', () => {
  it('respecte une couleur forcée', () => {
    expect(getProjectColor({ color_override: '#123456', deadline: '2026-01-01' })).toBe('#123456')
  })

  it('passe du vert au rouge à mesure que l\'échéance approche', () => {
    expect(getProjectColor({ deadline: '2026-09-30' })).toBe('#22c55e')   // > 14 j
    expect(getProjectColor({ deadline: '2026-08-30' })).toBe('#eab308')   // ≤ 14 j
    expect(getProjectColor({ deadline: '2026-08-22' })).toBe('#f59e0b')   // ≤ 7 j
    expect(getProjectColor({ deadline: '2026-08-01' })).toBe('#dc2626')   // dépassée
  })

  it('reste gris sans échéance', () => {
    expect(getProjectColor({})).toBe('#94a3b8')
  })
})

describe('tâche terminée aujourd\'hui', () => {
  it('ne retient que les tâches complétées ce jour', () => {
    expect(isCompletedToday({ status: 'completed', completed_at: '2026-08-18T09:00:00Z' })).toBe(true)
    expect(isCompletedToday({ status: 'completed', completed_at: '2026-08-17T23:00:00Z' })).toBe(false)
    expect(isCompletedToday({ status: 'active', completed_at: '2026-08-18T09:00:00Z' })).toBe(false)
    expect(isCompletedToday({ status: 'completed' })).toBe(false)
  })
})

describe('logistique — trois formats en base', () => {
  it('garde le format tableau et complète les uid manquants', () => {
    const r = initLogistics({ logistics_data: [{ type: 'montage' }, { type: 'livraison', uid: 'fixe' }] })
    expect(r).toHaveLength(2)
    expect(r[0].uid).toMatch(/^log_/)
    expect(r[1].uid).toBe('fixe')      // un uid existant n'est jamais réécrit
  })

  it('convertit le format objet indexé par type', () => {
    const r = initLogistics({ logistics_data: { montage: { address: 'Rue X' }, livraison: {} } })
    expect(r.map(i => i.type)).toEqual(['montage'])   // les entrées vides sont ignorées
    expect(r[0].address).toBe('Rue X')
  })

  it('retombe sur les colonnes d\'origine', () => {
    const r = initLogistics({
      logistics_address: 'Rue Y', logistics_time: '08:00',
      disassembly_date: '2026-09-02', disassembly_address: 'Rue Z',
    })
    expect(r.map(i => i.type)).toEqual(['montage', 'demontage'])
    expect(r[1].date).toBe('2026-09-02')
  })

  it('ne renvoie rien pour un projet sans logistique', () => {
    expect(initLogistics({})).toEqual([])
    expect(initLogistics({ logistics_data: [] })).toEqual([])
  })

  it('donne un uid unique à chaque item', () => {
    const uids = new Set([ensureUid({}).uid, ensureUid({}).uid, ensureUid({}).uid])
    expect(uids.size).toBe(3)
  })
})

describe('plages horaires', () => {
  it('sépare et recompose une plage', () => {
    expect(parseTimeRange('08:00 – 10:00')).toEqual({ start: '08:00', end: '10:00' })
    expect(parseTimeRange('08:00-10:00')).toEqual({ start: '08:00', end: '10:00' })
    expect(combineTime('08:00', '10:00')).toBe('08:00 – 10:00')
  })

  it('accepte une plage incomplète', () => {
    expect(parseTimeRange('')).toEqual({ start: '', end: '' })
    expect(combineTime('08:00', '')).toBe('08:00')
    expect(combineTime('', '')).toBe('')
  })

  it('rejette un format non horaire plutôt que de le propager', () => {
    expect(parseTimeRange('matin')).toEqual({ start: '', end: '' })
  })

  it('affiche à la suisse', () => {
    expect(fmtTimeDisplay('08:00 – 10:00')).toBe('08h00 – 10h00')
    expect(fmtTimeDisplay(null)).toBeNull()
  })
})

describe('libellé relatif d\'une date de tâche', () => {
  it('nomme les repères proches', () => {
    expect(fmtTaskDate('2026-08-18').label).toBe("Aujourd'hui")
    expect(fmtTaskDate('2026-08-19').label).toBe('Demain')
    expect(fmtTaskDate('2026-08-21').label).toBe('Dans 3j')
  })

  it('signale le retard en rouge', () => {
    const r = fmtTaskDate('2026-08-15')
    expect(r.label).toBe('3j en retard')
    expect(r.color).toBe('#dc2626')
  })

  it('donne une date courte au-delà d\'une semaine', () => {
    expect(fmtTaskDate('2026-09-15').label).toMatch(/15/)
  })

  it('ne renvoie rien sans date', () => {
    expect(fmtTaskDate(null)).toBeNull()
  })
})
