import { describe, it, expect } from 'vitest'
import {
  LIMITE_CORPS_VERCEL, MAX_FICHIER_OCTETS,
  formaterTaille, verifierTailleFichier, lireReponse,
} from '../lib/uploadLimit'

const reponse = (status, type, corps) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => type },
  json: async () => corps,
})

describe('verifierTailleFichier', () => {
  it('laisse passer un fichier sous la limite', () => {
    expect(verifierTailleFichier({ size: 1024 * 1024 }).ok).toBe(true)
    expect(verifierTailleFichier({ size: MAX_FICHIER_OCTETS }).ok).toBe(true)
  })

  it('refuse au-delà, en donnant la taille du fichier ET la limite', () => {
    const r = verifierTailleFichier({ size: 8 * 1024 * 1024 })
    expect(r.ok).toBe(false)
    expect(r.message).toContain('8.0 Mo')
    expect(r.message).toContain(formaterTaille(MAX_FICHIER_OCTETS))
  })

  // Le base64 gonfle d'un tiers : un fichier tout juste sous 4,5 Mo produirait
  // un corps AU-DESSUS du plafond. La limite doit en tenir compte.
  it('laisse la marge du base64 sous le plafond de l\'hébergeur', () => {
    expect(MAX_FICHIER_OCTETS).toBeLessThan(LIMITE_CORPS_VERCEL)
    expect(MAX_FICHIER_OCTETS * (4 / 3)).toBeLessThan(LIMITE_CORPS_VERCEL)
  })

  it('tolère un fichier sans taille connue', () => {
    expect(verifierTailleFichier(null).ok).toBe(true)
    expect(verifierTailleFichier({}).ok).toBe(true)
  })
})

describe('lireReponse', () => {
  it('renvoie le corps quand tout va bien', async () => {
    await expect(lireReponse(reponse(200, 'application/json', { invoices: [] })))
      .resolves.toEqual({ invoices: [] })
  })

  // Le bug rapporté : Vercel refuse en TEXTE BRUT, et res.json() levait
  // « Unexpected token 'R', "Request En"... is not valid JSON ».
  it('traduit un 413 en texte brut plutôt que de planter sur le JSON', async () => {
    await expect(lireReponse(reponse(413, 'text/plain')))
      .rejects.toThrow(/trop volumineux/i)
  })

  it('ne laisse jamais fuiter une erreur de syntaxe JSON', async () => {
    for (const [status, type] of [[413, 'text/plain'], [502, 'text/html'], [504, '']]) {
      await expect(lireReponse(reponse(status, type)))
        .rejects.not.toThrow(/Unexpected token/i)
    }
  })

  it('reprend le message de la route et son identifiant de requête', async () => {
    await expect(lireReponse(reponse(400, 'application/json', { error: 'Document illisible', request_id: 'fra1::abc' })))
      .rejects.toThrow('Document illisible (réf. fra1::abc)')
  })

  it('se rabat sur le statut quand le corps ne dit rien', async () => {
    await expect(lireReponse(reponse(500, 'application/json', {}))).rejects.toThrow('500')
  })

  it('signale une réponse 200 qui n\'est pas du JSON', async () => {
    await expect(lireReponse(reponse(200, 'text/html'))).rejects.toThrow(/illisible/i)
  })
})
