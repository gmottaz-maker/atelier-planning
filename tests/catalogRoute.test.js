import { describe, it, expect, vi, beforeEach } from 'vitest'
import { faireRes, faireReq, connecter, ANONYME, MEMBRE, ADMIN } from './helpers/routeHarness'

// Même montage que tests/apiAuth.test.js : pages/api/catalog.js appelle
// getSupabaseServer() au niveau MODULE, donc une seule fois à l'import. On rend
// un proxy vers la base du test en cours, sinon la route resterait figée sur la
// première.
let base = null
const proxy = new Proxy({}, { get: (_, prop) => base?.[prop] })
vi.mock('../lib/supabase-server', () => ({ getSupabaseServer: () => proxy }))

let entetes = {}
beforeEach(() => { const c = connecter(ANONYME); base = c.base; entetes = c.headers })

const sous = (qui, tables = {}) => {
  const c = connecter(qui, { tables })
  base = c.base; entetes = c.headers
}

const appeler = async (options = {}) => {
  const mod = await import('../pages/api/catalog')
  const res = faireRes()
  await mod.default(faireReq({ ...options, headers: { ...entetes, ...(options.headers || {}) } }), res)
  return res
}

// Une ligne déjà présente : le banc d'essai résout `.single()` sur un
// instantané pris avant l'insert, il lui faut donc de quoi répondre.
const CATALOGUE = { catalog_items: [{ id: 1, type: 'article', name: 'Panneau 3 plis' }] }

describe('POST /api/catalog — créer un article', () => {
  // Le vrai bug : la page catalogue est un tableau qui s'édite sur place.
  // « + article » crée une ligne VIDE et le nom se tape ensuite dans la
  // cellule. Exiger le nom au POST rendait le bouton inutilisable.
  it('accepte une ligne sans nom — elle sera nommée dans la cellule', async () => {
    sous(ADMIN, CATALOGUE)
    const res = await appeler({ method: 'POST', body: { type: 'article', name: '', unit: '', vat_rate: 8.1 } })
    expect(res.statusCode).toBe(201)
    expect(res.body?.error).toBeUndefined()
  })

  it('accepte aussi une ligne « heure » sans nom', async () => {
    sous(ADMIN, CATALOGUE)
    const res = await appeler({ method: 'POST', body: { type: 'heure', name: '', unit: 'heure(s)', vat_rate: 8.1 } })
    expect(res.statusCode).toBe(201)
  })

  it('n\'écrit que les colonnes de la liste blanche', async () => {
    sous(ADMIN, CATALOGUE)
    await appeler({ method: 'POST', body: { type: 'article', name: 'Vis', id: 999, archived: true, colonne_pirate: 'x' } })
    // On relit par la route plutôt que d'inspecter le banc d'essai : `from()`
    // rend une nouvelle requête à chaque appel, l'objet de l'insert n'est plus
    // accessible ensuite.
    const liste = await appeler({ method: 'GET' })
    const cree = liste.body.find(r => r.name === 'Vis')
    expect(cree).toBeTruthy()
    expect(cree.colonne_pirate).toBeUndefined()
    expect(cree.id).toBeUndefined()   // l'id vient de la base, jamais du corps
    expect(cree.archived).toBe(true)  // celle-là est dans la liste blanche
  })

  it('reste réservé à l\'admin', async () => {
    const anon = await appeler({ method: 'POST', body: { type: 'article', name: '' } })
    expect(anon.statusCode).toBe(401)
    sous(MEMBRE, CATALOGUE)
    const membre = await appeler({ method: 'POST', body: { type: 'article', name: '' } })
    expect(membre.statusCode).toBe(403)
  })
})

describe('POST /api/catalog?bulk=1 — import en masse', () => {
  // Ici le garde-fou garde tout son sens : une ligne de CSV sans nom est une
  // ligne vide, pas une ligne qu'on s'apprête à remplir à la main.
  it('ignore les lignes sans nom au lieu de les créer', async () => {
    sous(ADMIN, CATALOGUE)
    const res = await appeler({
      method: 'POST', query: { bulk: '1' },
      body: { items: [{ type: 'article', name: 'Vis 4x40' }, { type: 'article', name: '' }, { type: 'article' }] },
    })
    expect(res.statusCode).toBe(200)
    expect(res.body.inserted).toBe(1)
  })

  it('refuse un corps sans items[]', async () => {
    sous(ADMIN, CATALOGUE)
    const res = await appeler({ method: 'POST', query: { bulk: '1' }, body: {} })
    expect(res.statusCode).toBe(400)
  })
})
