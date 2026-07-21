import { describe, it, expect } from 'vitest'
import { merchantKey } from '../lib/merchantAccounts'

describe('merchantKey', () => {
  it('unifie casse et espaces', () => {
    expect(merchantKey('Migros')).toBe(merchantKey('MIGROS'))
    expect(merchantKey('Migros Genève')).toBe('migrosgeneve')
  })

  it('retire les accents', () => {
    expect(merchantKey('Café du Commerce')).toBe('cafeducommerce')
  })

  it('retire les formes juridiques', () => {
    expect(merchantKey('Digitec Galaxus AG')).toBe('digitecgalaxus')
    expect(merchantKey('Amazing Lab Sàrl')).toBe('amazinglab')
    expect(merchantKey('Röhm (Schweiz) GmbH')).toBe('rohmschweiz')
  })

  it('retire les suffixes web', () => {
    expect(merchantKey('galaxus.ch')).toBe('galaxus')
  })

  it('ne fusionne pas deux commerçants distincts', () => {
    expect(merchantKey('Migros')).not.toBe(merchantKey('Manor'))
  })

  it('renvoie une chaîne vide pour une entrée vide', () => {
    expect(merchantKey('')).toBe('')
    expect(merchantKey(null)).toBe('')
  })
})
