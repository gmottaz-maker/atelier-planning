import { describe, it, expect, vi, beforeEach } from 'vitest'
import { faireRes, faireReq, connecter, ANONYME, MEMBRE, ADMIN } from './helpers/routeHarness'

// La route relance le rapprochement sans relevé. Elle ÉCRIT — elle solde des
// factures — donc son garde-fou compte autant que son résultat.
let base = null
const proxy = new Proxy({}, { get: (_, p) => base?.[p] })
vi.mock('../lib/supabase-server', () => ({ getSupabaseServer: () => proxy }))

let entetes = {}
beforeEach(() => { const c = connecter(ANONYME); base = c.base; entetes = c.headers })

const sous = (qui, tables = {}) => { const c = connecter(qui, { tables }); base = c.base; entetes = c.headers }

const appeler = async (options = {}) => {
  const mod = await import('../pages/api/bank/reconcile')
  const res = faireRes()
  await mod.default(faireReq({ method: 'POST', ...options, headers: { ...entetes, ...(options.headers || {}) } }), res)
  return res
}

const VIDE = { bank_transactions: [], supplier_invoices: [], customer_invoices: [], expenses: [] }

describe('POST /api/bank/reconcile', () => {
  it('refuse un anonyme et un simple membre', async () => {
    expect((await appeler()).statusCode).toBe(401)
    sous(MEMBRE, VIDE)
    expect((await appeler()).statusCode).toBe(403)
  })

  it('répond à l\'admin avec le compte rendu', async () => {
    sous(ADMIN, VIDE)
    const res = await appeler()
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ reconciled: [], ambiguous: 0 })
  })

  // Rien à rapprocher n'est pas une erreur : le bouton doit pouvoir être
  // pressé deux fois de suite sans rien casser ni rien signaler.
  it('ne se plaint pas quand il n\'y a rien à faire', async () => {
    sous(ADMIN, VIDE)
    const a = await appeler()
    const b = await appeler()
    expect(a.body.error).toBeUndefined()
    expect(b.body.error).toBeUndefined()
  })

  it('refuse les autres méthodes', async () => {
    sous(ADMIN, VIDE)
    const res = await appeler({ method: 'GET' })
    expect(res.statusCode).toBe(405)
  })
})
