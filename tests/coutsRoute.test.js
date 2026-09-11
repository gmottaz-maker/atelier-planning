import { describe, it, expect, vi, beforeEach } from 'vitest'
import { faireRes, faireReq, connecter, ANONYME, MEMBRE, ADMIN } from './helpers/routeHarness'

let base = null
const proxy = new Proxy({}, { get: (_, prop) => base?.[prop] })
vi.mock('../lib/supabase-server', () => ({ getSupabaseServer: () => proxy }))

let entetes = {}
beforeEach(() => { const c = connecter(ANONYME); base = c.base; entetes = c.headers })

// La première ligne sert aussi de réponse à `.single()` : le banc d'essai le
// résout sur un instantané pris AVANT l'insert.
const TABLES = () => ({
  projects: [{ id: 'p1' }, { id: 'p2' }],
  project_couts: [
    { id: 1, project_id: 'p1', categorie: 'materiel', libelle: 'Panneaux', montant_ht: 250, fournisseur: null, date: null },
    { id: 2, project_id: 'p2', categorie: 'materiel', libelle: 'Autre projet', montant_ht: 90, fournisseur: null, date: null },
  ],
})
const sous = (qui) => { const c = connecter(qui, { tables: TABLES() }); base = c.base; entetes = c.headers }

function capturer() {
  const vrai = base.from.bind(base)
  const vues = []
  base.from = (nom) => { const q = vrai(nom); vues.push({ nom, q }); return q }
  return {
    insere: () => vues.find(v => v.q._inserted)?.q._inserted?.[0],
    maj: () => vues.find(v => v.q._updated)?.q._updated,
    supprime: () => vues.some(v => v.q._deleted),
  }
}

const appeler = async (options = {}) => {
  const mod = await import('../pages/api/projects/[id]/couts')
  const res = faireRes()
  await mod.default(faireReq({ ...options, query: { id: 'p1', ...(options.query || {}) }, headers: entetes }), res)
  return res
}

describe('/api/projects/[id]/couts', () => {
  // Rapprochés de l'offre, ces montants disent la marge : même la lecture est
  // réservée à l'admin.
  it('refuse l\'anonyme et le membre, lecture comprise', async () => {
    expect((await appeler({ method: 'GET' })).statusCode).toBe(401)
    sous(MEMBRE)
    expect((await appeler({ method: 'GET' })).statusCode).toBe(403)
  })

  it('ne liste que les coûts du projet demandé', async () => {
    sous(ADMIN)
    expect((await appeler({ method: 'GET' })).body.map(c => c.id)).toEqual([1])
  })

  it('rattache la ligne au projet de l\'URL et à l\'admin connecté', async () => {
    sous(ADMIN)
    const c = capturer()
    const res = await appeler({ method: 'POST', body: {
      categorie: 'materiel', libelle: 'Mousse', montant_ht: "1'200.50", project_id: 'p2', created_by: 'Pirate',
    } })
    expect(res.statusCode).toBe(201)
    expect(c.insere()).toEqual({
      categorie: 'materiel', libelle: 'Mousse', fournisseur: null, montant_ht: 1200.5, date: null,
      project_id: 'p1', created_by: 'Guillaume',
    })
  })

  it('refuse un projet inconnu', async () => {
    sous(ADMIN)
    expect((await appeler({ method: 'GET', query: { id: 'p9' } })).statusCode).toBe(404)
  })

  it('refuse une ligne invalide', async () => {
    sous(ADMIN)
    expect((await appeler({ method: 'POST', body: { categorie: 'materiel', libelle: 'x', montant_ht: '' } })).statusCode).toBe(400)
  })

  it('ne touche jamais le coût d\'un autre projet', async () => {
    sous(ADMIN)
    const c = capturer()
    expect((await appeler({ method: 'DELETE', body: { coutId: 2 } })).statusCode).toBe(404)
    expect(c.supprime()).toBe(false)
    sous(ADMIN)
    expect((await appeler({ method: 'PATCH', body: { coutId: 2, montant_ht: 1 } })).statusCode).toBe(404)
  })

  it('modifie une ligne en ne réécrivant que les champs autorisés', async () => {
    sous(ADMIN)
    const c = capturer()
    const res = await appeler({ method: 'PATCH', body: { coutId: 1, montant_ht: '275', project_id: 'p2' } })
    expect(res.statusCode).toBe(200)
    expect(c.maj()).toEqual({ categorie: 'materiel', libelle: 'Panneaux', fournisseur: null, montant_ht: 275, date: null })
  })

  it('supprime une ligne du projet', async () => {
    sous(ADMIN)
    const c = capturer()
    expect((await appeler({ method: 'DELETE', body: { coutId: 1 } })).statusCode).toBe(200)
    expect(c.supprime()).toBe(true)
  })
})
