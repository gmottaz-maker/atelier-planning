import { describe, it, expect, vi, beforeEach } from 'vitest'
import { faireRes, faireReq, connecter, ANONYME, MEMBRE } from './helpers/routeHarness'

let base = null
const proxy = new Proxy({}, { get: (_, prop) => base?.[prop] })
vi.mock('../lib/supabase-server', () => ({ getSupabaseServer: () => proxy }))

let entetes = {}
beforeEach(() => { const c = connecter(ANONYME); base = c.base; entetes = c.headers })

const PROJET = () => ({ projects: [{ id: 'p1', name: 'EOY 2026', deadline: '2026-12-01', statut: null }] })
const sous = (qui) => { const c = connecter(qui, { tables: PROJET() }); base = c.base; entetes = c.headers }

function capturer() {
  const vrai = base.from.bind(base)
  const vues = []
  base.from = (nom) => { const q = vrai(nom); vues.push({ nom, q }); return q }
  return { maj: () => vues.find(v => v.q._updated)?.q._updated }
}

const appeler = async (options = {}) => {
  const mod = await import('../pages/api/projects/[id]/statut')
  const res = faireRes()
  await mod.default(faireReq({ query: { id: 'p1' }, ...options, headers: entetes }), res)
  return res
}

describe('/api/projects/[id]/statut', () => {
  it('refuse l’anonyme', async () => {
    expect((await appeler({ method: 'PUT', body: { statut: 'production' } })).statusCode).toBe(401)
  })

  it('n’accepte que PUT', async () => {
    sous(MEMBRE)
    expect((await appeler({ method: 'GET' })).statusCode).toBe(405)
  })

  it('pose un statut manuel, et RIEN d’autre que le statut', async () => {
    sous(MEMBRE)
    const vu = capturer()
    const res = await appeler({ method: 'PUT', body: { statut: 'production', deadline: null, name: 'piratage' } })
    expect(res.statusCode).toBe(200)
    expect(Object.keys(vu.maj()).sort()).toEqual(['statut', 'updated_at'])
    expect(vu.maj().statut).toBe('production')
  })

  it('rend la main à la déduction avec un statut vide', async () => {
    sous(MEMBRE)
    const vu = capturer()
    expect((await appeler({ method: 'PUT', body: { statut: null } })).statusCode).toBe(200)
    expect(vu.maj().statut).toBe(null)
  })

  it('refuse un statut déduit ou inconnu', async () => {
    sous(MEMBRE)
    for (const statut of ['facture', 'preproduction', 'archive', 'n’importe quoi']) {
      expect((await appeler({ method: 'PUT', body: { statut } })).statusCode).toBe(400)
    }
  })
})
