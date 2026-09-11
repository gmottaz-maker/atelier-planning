import { describe, it, expect, vi, beforeEach } from 'vitest'
import { faireRes, faireReq, connecter, ANONYME, MEMBRE, ADMIN } from './helpers/routeHarness'

let base = null
const proxy = new Proxy({}, { get: (_, prop) => base?.[prop] })
vi.mock('../lib/supabase-server', () => ({ getSupabaseServer: () => proxy }))
// Chromium n'a rien à faire dans un test : on vérifie ce qu'on lui confie.
const pdf = { dernierHtml: null }
vi.mock('../lib/htmlToPdf', () => ({ htmlToPdf: async (html) => { pdf.dernierHtml = html; return Buffer.from('%PDF-1.7') } }))

let entetes = {}
beforeEach(() => { const c = connecter(ANONYME); base = c.base; entetes = c.headers; pdf.dernierHtml = null })

const TABLES = () => ({
  projects: [
    { numero: 124, name: 'Canapé Margherita', client: 'Coca-Cola', status: 'active' },
    { numero: 140, name: 'En pause', client: 'Red Bull', status: 'active', suspended: true },
  ],
  activites: [{ code: 23, libelle: 'Assemblage', famille: 'atelier', actif: true }],
})
const sous = (qui) => { const c = connecter(qui, { tables: TABLES() }); base = c.base; entetes = c.headers }
const appeler = async (query) => {
  const mod = await import('../pages/api/heures/feuille')
  const res = faireRes()
  await mod.default(faireReq({ method: 'GET', query, headers: entetes }), res)
  return res
}
const SEMAINE = { from: '2026-09-14', to: '2026-09-20' }   // lun → dim : 4 jours travaillés

describe('/api/heures/feuille', () => {
  it('refuse l\'anonyme', async () => {
    expect((await appeler({ ...SEMAINE, format: 'html' })).statusCode).toBe(401)
  })

  it('un membre n\'imprime que sa feuille, même s\'il en demande d\'autres', async () => {
    sous(MEMBRE)
    const res = await appeler({ ...SEMAINE, users: 'Arnaud,Guillaume', format: 'html' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('·GABIN')
    expect(res.body).not.toContain('·ARNAUD')
    expect(res.body.match(/class="feuille"/g)).toHaveLength(4)
  })

  it('l\'admin imprime pour qui il veut : une feuille par personne et par jour travaillé', async () => {
    sous(ADMIN)
    const res = await appeler({ ...SEMAINE, users: 'Arnaud,Guillaume', format: 'html' })
    expect(res.body.match(/class="feuille"/g)).toHaveLength(8)
  })

  it('n\'imprime pas les projets en pause', async () => {
    sous(ADMIN)
    const res = await appeler({ ...SEMAINE, format: 'html' })
    expect(res.body).toContain('Canapé Margherita')
    expect(res.body).not.toContain('En pause')
  })

  it('sort la feuille d\'un mercredi demandé seul', async () => {
    sous(ADMIN)
    const res = await appeler({ from: '2026-09-16', to: '2026-09-16', format: 'html' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('mercredi 16 septembre 2026')
  })

  it('imprime aussi mercredi et week-end sur demande', async () => {
    sous(ADMIN)
    const res = await appeler({ ...SEMAINE, tous: '1', format: 'html' })
    expect(res.body.match(/class="feuille"/g)).toHaveLength(7)
  })

  it('rend un PDF par défaut', async () => {
    sous(ADMIN)
    const res = await appeler({ ...SEMAINE })
    expect(res.headers['Content-Type']).toBe('application/pdf')
    expect(res.headers['Content-Disposition']).toMatch(/feuilles-heures_2026-09-14_2026-09-20\.pdf/)
    expect(pdf.dernierHtml).toContain('@page')
  })

  it('refuse une période invalide, vide ou trop longue', async () => {
    sous(ADMIN)
    expect((await appeler({ from: '2026-09-18', to: '2026-09-14' })).statusCode).toBe(400)
    sous(ADMIN)
    expect((await appeler({ from: '2026-09-19', to: '2026-09-20' })).body.error).toMatch(/Aucun jour travaillé/)
    sous(ADMIN)
    expect((await appeler({ from: '2026-01-01', to: '2026-12-31' })).statusCode).toBe(400)
  })
})
