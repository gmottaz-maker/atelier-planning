import { describe, it, expect, vi, beforeEach } from 'vitest'
import { faireRes, faireReq, connecter, ANONYME, MEMBRE, ADMIN } from './helpers/routeHarness'

let base = null
const proxy = new Proxy({}, { get: (_, prop) => base?.[prop] })
vi.mock('../lib/supabase-server', () => ({ getSupabaseServer: () => proxy }))

let entetes = {}
beforeEach(() => { const c = connecter(ANONYME); base = c.base; entetes = c.headers })

const compensation = h => ({ item: 'Compensation consulting', rate: 160, quantity: String(h), unit: 'heure(s)', hidden: true, compensation: true })
const TABLES = () => ({
  heures: [
    { id: 1, user_name: 'Guillaume', date: '2026-09-02', activite: 14, contact_id: 3, project_id: null, minutes: 90, note: 'téléphone' },
    { id: 2, user_name: 'Guillaume', date: '2026-09-03', activite: 13, contact_id: 3, project_id: null, minutes: 60 },
    { id: 3, user_name: 'Guillaume', date: '2026-09-04', activite: 14, contact_id: 9, project_id: null, minutes: 30 },
    { id: 4, user_name: 'Guillaume', date: '2026-09-05', activite: 14, contact_id: null, project_id: 'pA', minutes: 45 },
  ],
  projects: [
    { id: 'pA', numero: 150, name: 'Stand', client_contact_id: 3, quote_data: { status: 'accepte', management: [compensation(1)] } },
    { id: 'pB', numero: 151, name: 'Refusé', client_contact_id: 3, quote_data: { status: 'refuse', management: [compensation(0.5)] } },
  ],
})
const sous = (qui) => { const c = connecter(qui, { tables: TABLES() }); base = c.base; entetes = c.headers }
const appeler = async (query = {}) => {
  const mod = await import('../pages/api/consulting')
  const res = faireRes()
  await mod.default(faireReq({ method: 'GET', query, headers: entetes }), res)
  return res
}

describe('/api/consulting', () => {
  it('est réservé à l\'admin', async () => {
    expect((await appeler({ contact: '3' })).statusCode).toBe(401)
    sous(MEMBRE)
    expect((await appeler({ contact: '3' })).statusCode).toBe(403)
  })

  // 90 min de consulting chez le client 3 ; 1 h compensée dans une offre
  // acceptée ; l'offre refusée rend sa demi-heure. La relation client (13)
  // et le consulting imputé à un projet ne comptent pas.
  it('calcule le solde d\'un client', async () => {
    sous(ADMIN)
    const res = await appeler({ contact: '3' })
    expect(res.body).toMatchObject({ contact_id: 3, consulte: 90, compense: 60, solde: 30 })
    expect(res.body.heures.map(h => h.id)).toEqual([1])
  })

  it('met de côté le projet à l\'écran', async () => {
    sous(ADMIN)
    expect((await appeler({ contact: '3', exclure: 'pA' })).body).toMatchObject({ compense: 0, solde: 90 })
  })

  it('donne une vue par client', async () => {
    sous(ADMIN)
    expect((await appeler()).body.map(s => [s.contact_id, s.solde])).toEqual([[3, 30], [9, 30]])
  })

  it('refuse un identifiant de client illisible', async () => {
    sous(ADMIN)
    expect((await appeler({ contact: 'andros' })).statusCode).toBe(400)
  })
})
