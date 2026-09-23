import { describe, it, expect, vi, beforeEach } from 'vitest'
import { faireRes, faireReq, connecter, ANONYME, MEMBRE } from './helpers/routeHarness'

let base = null
const proxy = new Proxy({}, { get: (_, prop) => base?.[prop] })
vi.mock('../lib/supabase-server', () => ({ getSupabaseServer: () => proxy }))

const creerDossier = vi.fn(async () => 4242)
vi.mock('../lib/kdrive', async () => {
  const vrai = await vi.importActual('../lib/kdrive')
  return { ...vrai, ensureProjectFolder: (...a) => creerDossier(...a) }
})

let entetes = {}
beforeEach(() => { creerDossier.mockClear(); const c = connecter(ANONYME); base = c.base; entetes = c.headers })

const TABLES = () => ({
  projects: [
    { id: 'p1', name: 'Petite intervention', client: 'Manor', kdrive_folder_id: null },
    { id: 'p2', name: 'Vitrine', client: 'BCV', kdrive_folder_id: 9001 },
  ],
})
const sous = (qui) => { const c = connecter(qui, { tables: TABLES() }); base = c.base; entetes = c.headers }

const appeler = async (projet, options = {}) => {
  const mod = await import('../pages/api/projects/[id]/kdrive-folder')
  const res = faireRes()
  await mod.default(faireReq({ method: 'POST', ...options, query: { id: projet }, headers: entetes }), res)
  return res
}

describe('/api/projects/[id]/kdrive-folder', () => {
  it('refuse l\'anonyme', async () => {
    expect((await appeler('p1')).statusCode).toBe(401)
  })

  it('crée le dossier quand on le DEMANDE', async () => {
    sous(MEMBRE)
    const res = await appeler('p1')
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ kdrive_folder_id: 4242, cree: true })
    expect(creerDossier).toHaveBeenCalledWith('Manor', 'Petite intervention')
  })

  it('ne fabrique pas un second dossier quand le projet en a déjà un', async () => {
    sous(MEMBRE)
    const res = await appeler('p2')
    expect(res.body).toEqual({ kdrive_folder_id: 9001, cree: false })
    expect(creerDossier).not.toHaveBeenCalled()
  })

  it('projet inconnu : 404', async () => {
    sous(MEMBRE)
    expect((await appeler('inconnu')).statusCode).toBe(404)
  })

  it('refuse les autres méthodes', async () => {
    sous(MEMBRE)
    expect((await appeler('p1', { method: 'GET' })).statusCode).toBe(405)
  })
})

describe('déposer dans un projet sans dossier', () => {
  it('le dépôt de fichier répond 409 et n\'invente pas de dossier', async () => {
    sous(MEMBRE)
    const mod = await import('../pages/api/projects/[id]/files')
    const res = faireRes()
    // 1×1 PNG.
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    await mod.default(faireReq({
      method: 'POST', query: { id: 'p1' }, headers: entetes,
      body: { filename: 'plan.png', mime_type: 'image/png', base64: png, size: 70 },
    }), res)
    expect(res.statusCode).toBe(409)
    expect(res.body.error).toMatch(/pas de dossier kDrive/)
    expect(creerDossier).not.toHaveBeenCalled()
  })
})
