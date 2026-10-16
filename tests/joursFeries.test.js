import { describe, it, expect } from 'vitest'
import { paques, lundiDuJeune, joursFeries, datesFeriees } from '../lib/joursFeries'

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

describe('Pâques', () => {
  it('tombe aux dates connues', () => {
    expect(iso(paques(2025))).toBe('2025-04-20')
    expect(iso(paques(2026))).toBe('2026-04-05')
    expect(iso(paques(2027))).toBe('2027-03-28')
  })
})

describe('Lundi du Jeûne fédéral', () => {
  it('suit le TROISIÈME dimanche de septembre', () => {
    // 2025 : dimanches du 7, 14, 21 → le jeûne tombe le 21, le lundi le 22.
    expect(iso(lundiDuJeune(2025))).toBe('2025-09-22')
    // 2026 : dimanches du 6, 13, 20 → lundi le 21.
    expect(iso(lundiDuJeune(2026))).toBe('2026-09-21')
    // 2027 : le 1er septembre est un mercredi ; dimanches du 5, 12, 19.
    expect(iso(lundiDuJeune(2027))).toBe('2027-09-20')
  })

  it('tombe toujours un lundi', () => {
    for (let a = 2024; a <= 2035; a++) expect(lundiDuJeune(a).getDay(), String(a)).toBe(1)
  })
})

describe('joursFeries', () => {
  const v2026 = joursFeries(2026)

  it('en donne neuf, triés', () => {
    expect(v2026).toHaveLength(9)
    expect(v2026.map(j => j.date)).toEqual([...v2026.map(j => j.date)].sort())
  })

  it('contient le Jeûne fédéral — celui qui manquait', () => {
    expect(v2026.find(j => j.label.includes('Jeûne'))?.date).toBe('2026-09-21')
  })

  it('n\'inclut PAS le 1er mai : férié à Genève, pas dans le canton de Vaud', () => {
    expect(v2026.some(j => j.date === '2026-05-01')).toBe(false)
  })

  it('cale les mobiles sur Pâques', () => {
    const par = Object.fromEntries(v2026.map(j => [j.label, j.date]))
    expect(par['Vendredi Saint']).toBe('2026-04-03')
    expect(par['Lundi de Pâques']).toBe('2026-04-06')
    expect(par['Ascension']).toBe('2026-05-14')
    expect(par['Lundi de Pentecôte']).toBe('2026-05-25')
  })

  it('couvre plusieurs années d\'un coup', () => {
    const d = datesFeriees(2026, 2027)
    expect(d).toHaveLength(18)
    expect(d).toContain('2027-09-20')
  })
})
