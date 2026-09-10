import { describe, it, expect } from 'vitest'
import { classerErreurScan, classerErreurSynthese, causeErreurClaude, PASSAGER, ErreurClaude } from '../lib/scanErreur'
import { MODELE_RAPIDE, MODELE_PRECIS } from '../lib/modelesClaude'

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

// ── Ajouts du 10 septembre 2026 ────────────────────────────────────────────
// claude-3-5-haiku-20241022 a été retiré de l'API. Le 404 tombait dans le
// fourre-tout final, classé « passager » : l'écran conseillait de réessayer un
// appel qui ne pouvait plus jamais aboutir, et le message parlait de « lecture
// automatique » sous une synthèse de projet, où rien n'est lu.
describe('modèle retiré de l\'API', () => {
  const mort = new ErreurClaude(404, '{"type":"error","error":{"type":"not_found_error","message":"model: claude-3-5-haiku-20241022"}}')

  it('est permanent : réessayer ne servira jamais à rien', () => {
    expect(causeErreurClaude(mort)).toBe('modele')
    expect(classerErreurScan(mort).passager).toBe(false)
    expect(classerErreurSynthese(mort).passager).toBe(false)
  })

  it('dit que la correction est dans le code, pas chez l\'utilisateur', () => {
    for (const c of [classerErreurScan(mort), classerErreurSynthese(mort)]) {
      expect(c.message).toMatch(/modèle/i)
      expect(c.message).toMatch(/modelesClaude/)
    }
  })

  it('se reconnaît au corps même sans le statut', () => {
    expect(causeErreurClaude(new ErreurClaude(undefined, 'not_found_error'))).toBe('modele')
  })
})

describe('la synthèse parle de synthèse, pas de lecture', () => {
  it('ne recycle jamais le vocabulaire de l\'OCR', () => {
    const cas = [
      new ErreurClaude(429, ''),
      new ErreurClaude(400, 'credit balance is too low'),
      new ErreurClaude(401, ''),
      new ErreurClaude(404, 'not_found_error'),
      Object.assign(new Error('lent'), { timeout: true }),
      new ErreurClaude(418, 'bizarre'),
    ]
    for (const e of cas) {
      const m = classerErreurSynthese(e).message
      expect(m, m).not.toMatch(/lecture automatique|justificatif|document.*15 Mo/i)
    }
  })

  it('rassure sur le fil quand le compte est à sec', () => {
    expect(classerErreurSynthese(new ErreurClaude(400, 'credit balance is too low')).message)
      .toMatch(/fil du projet.*intact/i)
  })

  it('couvre toutes les causes — aucune ne doit rendre undefined', () => {
    for (const cause of ['delai', 'credit', 'cle', 'modele', 'saturation', 'document', 'inconnu']) {
      expect(PASSAGER[cause], cause).toBeTypeOf('boolean')
    }
  })
})

describe('les modèles configurés', () => {
  it('ne référence plus un modèle retiré', () => {
    for (const m of [MODELE_RAPIDE, MODELE_PRECIS]) {
      expect(m).not.toMatch(/claude-3-5/)
      expect(m).toMatch(/^claude-/)
    }
  })
})
