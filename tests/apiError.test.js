import { describe, it, expect, vi, afterEach } from 'vitest'
import { erreurApi, nettoyer, requestId, logErreur } from '../lib/apiError'

const faireRes = () => {
  const r = { statut: null, corps: null, entetes: {} }
  return {
    r,
    setHeader: (k, v) => { r.entetes[k] = v },
    status(s) { r.statut = s; return this },
    json(c) { r.corps = c; return this },
  }
}
const faireReq = (headers = {}) => ({ headers })

afterEach(() => vi.restoreAllMocks())

describe('réponses d\'erreur', () => {
  it('ne renvoie jamais le message du fournisseur au navigateur', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = faireRes()
    const interne = new Error('duplicate key value violates unique constraint "customer_invoices_pkey"')
    erreurApi(faireReq(), res, 'internal', interne, { route: 'x' })
    expect(res.r.statut).toBe(500)
    expect(JSON.stringify(res.r.corps)).not.toMatch(/constraint|duplicate key|pkey/)
    expect(res.r.corps.error).toBe('Erreur interne')
  })

  it('journalise le détail côté serveur, avec l\'identifiant de requête', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = faireRes()
    erreurApi(faireReq({ 'x-request-id': 'abc123' }), res, 'internal', new Error('détail interne'), { route: 'y' })
    expect(log).toHaveBeenCalledOnce()
    expect(log.mock.calls[0][0]).toContain('abc123')
    expect(log.mock.calls[0][0]).toContain('détail interne')
    expect(res.r.corps.request_id).toBe('abc123')
  })

  it('associe un statut HTTP à chaque code', () => {
    for (const [code, statut] of [['unauthorized', 401], ['forbidden', 403], ['not_found', 404],
                                  ['bad_request', 400], ['conflict', 409], ['unsupported', 415],
                                  ['too_large', 413], ['upstream', 502], ['internal', 500]]) {
      const res = faireRes()
      erreurApi(faireReq(), res, code)
      expect(res.r.statut, code).toBe(statut)
      expect(res.r.corps.code).toBe(code)
    }
  })

  it('accepte un message destiné à l\'utilisateur', () => {
    const res = faireRes()
    erreurApi(faireReq(), res, 'bad_request', null, null, "L'échéance précède la date d'émission")
    expect(res.r.corps.error).toBe("L'échéance précède la date d'émission")
  })

  it('retombe sur « interne » pour un code inconnu', () => {
    const res = faireRes()
    erreurApi(faireReq(), res, 'code_qui_nexiste_pas')
    expect(res.r.statut).toBe(500)
  })

  it('génère un identifiant quand la plateforme n\'en fournit pas', () => {
    expect(requestId(faireReq())).toMatch(/^[0-9a-f]{8}$/)
    expect(requestId(faireReq({ 'x-vercel-id': 'cdg1::xyz' }))).toBe('cdg1::xyz')
  })
})

describe('nettoyage des métadonnées de log', () => {
  it('masque tout ce qui ressemble à un secret', () => {
    const m = nettoyer({ token: 'ghp_reel', api_key: 'sk-123', iban: 'CH85…', route: 'bank' })
    expect(m.token).toBe('[masqué]')
    expect(m.api_key).toBe('[masqué]')
    expect(m.iban).toBe('[masqué]')
    expect(m.route).toBe('bank')
  })

  it('tronque les valeurs longues — un base64 de facture n\'a rien à faire dans les logs', () => {
    const m = nettoyer({ contenu: 'x'.repeat(5000) })
    expect(m.contenu.length).toBeLessThan(120)
    expect(m.contenu).toMatch(/5000 car\./)
  })

  it('descend dans les objets imbriqués', () => {
    expect(nettoyer({ a: { authorization: 'Bearer x' } }).a.authorization).toBe('[masqué]')
  })

  it('laisse passer les valeurs simples', () => {
    expect(nettoyer({ n: 42, b: true, z: null })).toEqual({ n: 42, b: true, z: null })
    expect(nettoyer(null)).toBeNull()
  })

  it('ne fait pas fuiter un secret par les logs', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    logErreur('rid', 'test', new Error('boum'), { password: 'motdepasse' })
    expect(log.mock.calls[0][0]).not.toContain('motdepasse')
  })
})
