import { describe, it, expect } from 'vitest'
import { ErreurClaude, classerErreurScan } from '../lib/scanErreur'

// Régression : le 28 août 2026, le compte Anthropic s'est retrouvé sans crédit.
// Toute erreur de Claude affichait « Réessaie dans un instant », donc l'écran
// invitait à recommencer une opération qui ne pouvait plus jamais aboutir.

const claude = (status, corps) => new ErreurClaude(status, corps)

describe('échecs permanents — surtout ne pas dire « réessaie »', () => {
  it('crédit épuisé : renvoie vers la console Anthropic', () => {
    const e = claude(400, '{"error":{"message":"Your credit balance is too low to access the Anthropic API."}}')
    const { passager, message } = classerErreurScan(e)
    expect(passager).toBe(false)
    expect(message).toMatch(/crédit/i)
    expect(message).not.toMatch(/réessaie/i)
  })

  it('clé refusée : renvoie vers les variables d’environnement', () => {
    for (const e of [claude(401, 'authentication_error'), claude(403, 'permission denied'),
                     claude(400, 'invalid x-api-key')]) {
      const { passager, message } = classerErreurScan(e)
      expect(passager).toBe(false)
      expect(message).toMatch(/clé|ANTHROPIC_API_KEY/i)
    }
  })

  it('document refusé : invite à vérifier le fichier, pas à recommencer', () => {
    const { passager, message } = classerErreurScan(claude(400, 'image exceeds 5 MB maximum'))
    expect(passager).toBe(false)
    expect(message).toMatch(/document|PDF|photo/i)
    expect(message).not.toMatch(/réessaie/i)
  })
})

describe('échecs passagers — « réessaie » est le bon conseil', () => {
  it('limite de débit et surcharge', () => {
    for (const s of [429, 529, 500, 502, 503]) {
      const { passager, message } = classerErreurScan(claude(s, 'overloaded_error'))
      expect(passager).toBe(true)
      expect(message).toMatch(/réessaie/i)
    }
  })

  it('délai dépassé', () => {
    const e = Object.assign(new Error('timeout'), { timeout: true })
    const { passager, message } = classerErreurScan(e)
    expect(passager).toBe(true)
    expect(message).toMatch(/trop de temps/i)
  })

  it('erreur inconnue : on reste prudent et on propose de réessayer', () => {
    const { passager } = classerErreurScan(new Error('boum'))
    expect(passager).toBe(true)
  })
})

describe('ErreurClaude', () => {
  it('garde le statut et tronque le corps dans le message', () => {
    const e = claude(400, 'x'.repeat(500))
    expect(e.status).toBe(400)
    expect(e.message.startsWith('Claude API: ')).toBe(true)
    expect(e.message.length).toBeLessThan(230)
    // Le corps complet reste disponible pour la classification.
    expect(e.corps).toHaveLength(500)
  })
})
