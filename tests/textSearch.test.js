import { describe, it, expect } from 'vitest'
import { matchesQuery } from '../lib/textSearch'

const obi     = ['', 'Achat OBI Renens 04.02.2026, 08:51', '', null]
const automob = ['Dépannage automobile La Côte Sàrl', '', '', null]
const galaxus = ['Digitec Galaxus AG', 'Achat online Galaxus Mobile', '', null]
const dhl     = ['DHL Express (Suisse) SA', 'Facture transport', 'RF62000797', null]

describe('matchesQuery', () => {
  it('trouve OBI sans ramener « automobile » ni « Mobile »', () => {
    expect(matchesQuery(obi, 'OBI')).toBe(true)
    expect(matchesQuery(automob, 'OBI')).toBe(false)
    expect(matchesQuery(galaxus, 'OBI')).toBe(false)
  })

  it('accepte un début de mot (recherche partielle)', () => {
    expect(matchesQuery(galaxus, 'gala')).toBe(true)
    expect(matchesQuery(dhl, 'expr')).toBe(true)
  })

  it('exige que tous les mots correspondent, dans n\'importe quel ordre', () => {
    expect(matchesQuery(dhl, 'dhl exp')).toBe(true)
    expect(matchesQuery(dhl, 'exp dhl')).toBe(true)
    expect(matchesQuery(dhl, 'dhl migros')).toBe(false)
  })

  it('ignore la casse et les accents', () => {
    expect(matchesQuery(automob, 'DEPANNAGE')).toBe(true)
    expect(matchesQuery(automob, 'côte')).toBe(true)
  })

  it('cherche dans tous les champs fournis', () => {
    expect(matchesQuery(dhl, 'RF62000797')).toBe(true)   // référence
    expect(matchesQuery(obi, 'renens')).toBe(true)        // libellé
  })

  it('coupe sur la ponctuation et les chiffres collés', () => {
    expect(matchesQuery(obi, '2026')).toBe(true)
    expect(matchesQuery(dhl, 'suisse')).toBe(true)        // entre parenthèses
  })

  it('renvoie tout sur une recherche vide', () => {
    expect(matchesQuery(obi, '')).toBe(true)
    expect(matchesQuery(obi, '   ')).toBe(true)
  })

  it('tolère des champs nuls', () => {
    expect(matchesQuery([null, undefined, ''], 'obi')).toBe(false)
  })
})
