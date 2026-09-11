import { describe, it, expect, vi, beforeEach } from 'vitest'
import { faireRes, faireReq, connecter, ANONYME, MEMBRE, ADMIN } from './helpers/routeHarness'

let base = null
const proxy = new Proxy({}, { get: (_, prop) => base?.[prop] })
vi.mock('../lib/supabase-server', () => ({ getSupabaseServer: () => proxy }))

let entetes = {}
beforeEach(() => { const c = connecter(ANONYME); base = c.base; entetes = c.headers })
const TABLES = () => ({ app_settings: [
  { key: 'transport', value: { vehicules: [{ id: 'master', nom: 'Renault Master' }], forfaits: [] } },
  { key: 'couts_vehicules', value: { prix_diesel: 2.26, vehicules: { master: { leasing_mensuel: 479 } } } },
] })
const sous = (qui) => { const c = connecter(qui, { tables: TABLES() }); base = c.base; entetes = c.headers }
const lire = async (key) => {
  const mod = await import('../pages/api/app-settings/[key]')
  const res = faireRes()
  await mod.default(faireReq({ method: 'GET', query: { key }, headers: entetes }), res)
  return res
}

describe('réglages de transport', () => {
  it('les noms des véhicules et les forfaits se lisent par tout le monde', async () => {
    sous(MEMBRE)
    const res = await lire('transport')
    expect(res.statusCode).toBe(200)
    expect(res.body.value.vehicules[0].nom).toBe('Renault Master')
  })

  // Leasing, assurance et consommation, rapprochés des km facturés, disent la
  // marge du transport.
  it('les coûts des véhicules ne se lisent que par l\'admin', async () => {
    expect((await lire('couts_vehicules')).statusCode).toBe(401)
    sous(MEMBRE)
    expect((await lire('couts_vehicules')).statusCode).toBe(403)
    sous(ADMIN)
    const res = await lire('couts_vehicules')
    expect(res.statusCode).toBe(200)
    expect(res.body.value.prix_diesel).toBe(2.26)
  })

  it('une clé inconnue reste introuvable', async () => {
    sous(ADMIN)
    expect((await lire('iban_secret')).statusCode).toBe(404)
  })
})
