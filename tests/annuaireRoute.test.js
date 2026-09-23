import { describe, it, expect, vi, beforeEach } from 'vitest'
import { faireRes, faireReq, connecter, ANONYME, MEMBRE } from './helpers/routeHarness'

let base = null
const proxy = new Proxy({}, { get: (_, prop) => base?.[prop] })
vi.mock('../lib/supabase-server', () => ({ getSupabaseServer: () => proxy }))

let entetes = {}
beforeEach(() => { const c = connecter(ANONYME); base = c.base; entetes = c.headers })

const TABLES = () => ({
  annuaire: [{ id: 1, nom: 'Métaux Dupont', quoi: 'découpe', archived: false }],
  annuaire_categories: [
    { id: 10, nom: 'Sous-traitance', parent_id: null },
    { id: 11, nom: 'Tôlerie', parent_id: 10 },
    { id: 20, nom: 'CNC', parent_id: null },
  ],
  annuaire_liens: [{ entree_id: 1, categorie_id: 11 }],
})
const sous = (qui) => { const c = connecter(qui, { tables: TABLES() }); base = c.base; entetes = c.headers }

function capturer() {
  const vrai = base.from.bind(base)
  const vues = []
  base.from = (nom) => { const q = vrai(nom); vues.push({ nom, q }); return q }
  return {
    insere: (table) => vues.filter(v => v.nom === table).find(v => v.q._inserted)?.q._inserted,
    maj: (table) => vues.filter(v => v.nom === table).find(v => v.q._updated)?.q._updated,
    supprime: (table) => vues.filter(v => v.nom === table).some(v => v.q._deleted),
  }
}

const appelerAnnuaire = async (options = {}) => {
  const mod = await import('../pages/api/annuaire')
  const res = faireRes()
  await mod.default(faireReq({ ...options, headers: entetes }), res)
  return res
}
const appelerCategories = async (options = {}) => {
  const mod = await import('../pages/api/annuaire-categories')
  const res = faireRes()
  await mod.default(faireReq({ ...options, headers: entetes }), res)
  return res
}

describe('/api/annuaire', () => {
  it('refuse l\'anonyme', async () => {
    expect((await appelerAnnuaire({ method: 'GET' })).statusCode).toBe(401)
  })

  it('rend les trois listes en une seule lecture', async () => {
    sous(MEMBRE)
    const res = await appelerAnnuaire({ method: 'GET' })
    expect(res.statusCode).toBe(200)
    expect(Object.keys(res.body).sort()).toEqual(['categories', 'entrees', 'liens'])
  })

  it('un membre peut inscrire une adresse : c\'est un savoir d\'atelier', async () => {
    sous(MEMBRE)
    const c = capturer()
    const res = await appelerAnnuaire({ method: 'POST', body: { nom: 'Laquage Riviera', site: 'laquage.ch' } })
    expect(res.statusCode).toBe(200)
    const ligne = c.insere('annuaire')[0]
    expect(ligne.nom).toBe('Laquage Riviera')
    // Le préfixe manquant est posé, pas refusé.
    expect(ligne.site).toBe('https://laquage.ch')
  })

  it('l\'identité vient du jeton, jamais du corps', async () => {
    sous(MEMBRE)
    const c = capturer()
    await appelerAnnuaire({ method: 'POST', body: { nom: 'X', created_by: 'pirate@ailleurs.ch', id: 999 } })
    const ligne = c.insere('annuaire')[0]
    expect(ligne.created_by).toBe(MEMBRE.email)
    expect(ligne.id).toBeUndefined()
  })

  it('refuse une entrée sans nom', async () => {
    sous(MEMBRE)
    const res = await appelerAnnuaire({ method: 'POST', body: { quoi: 'thermolaquage' } })
    expect(res.statusCode).toBe(400)
  })

  it('remplace les rattachements quand ils sont envoyés', async () => {
    sous(MEMBRE)
    const c = capturer()
    await appelerAnnuaire({ method: 'PUT', body: { id: 1, categories: [10, 20] } })
    expect(c.supprime('annuaire_liens')).toBe(true)
    expect(c.insere('annuaire_liens').map(l => l.categorie_id)).toEqual([10, 20])
  })

  it('ne touche PAS au rangement quand on ne corrige qu\'un téléphone', async () => {
    sous(MEMBRE)
    const c = capturer()
    await appelerAnnuaire({ method: 'PUT', body: { id: 1, telephone: '021 000 00 00' } })
    expect(c.maj('annuaire').telephone).toBe('021 000 00 00')
    expect(c.supprime('annuaire_liens')).toBe(false)
  })

  it('exige un id pour modifier ou supprimer', async () => {
    sous(MEMBRE)
    expect((await appelerAnnuaire({ method: 'PUT', body: { nom: 'X' } })).statusCode).toBe(400)
    expect((await appelerAnnuaire({ method: 'DELETE', body: {} })).statusCode).toBe(400)
  })
})

describe('/api/annuaire-categories', () => {
  it('refuse l\'anonyme', async () => {
    expect((await appelerCategories({ method: 'POST', body: { nom: 'X' } })).statusCode).toBe(401)
  })

  it('crée une sous-catégorie sous une racine existante', async () => {
    sous(MEMBRE)
    const c = capturer()
    const res = await appelerCategories({ method: 'POST', body: { nom: 'Fraises', parent_id: 20 } })
    expect(res.statusCode).toBe(200)
    expect(c.insere('annuaire_categories')[0]).toEqual({ nom: 'Fraises', parent_id: 20 })
  })

  it('refuse un parent inconnu et une catégorie qui descendrait d\'elle-même', async () => {
    sous(MEMBRE)
    expect((await appelerCategories({ method: 'POST', body: { nom: 'X', parent_id: 999 } })).statusCode).toBe(400)
    // 11 (Tôlerie) descend de 10 : 10 ne peut pas se ranger dessous.
    expect((await appelerCategories({ method: 'PUT', body: { id: 10, nom: 'Sous-traitance', parent_id: 11 } })).statusCode).toBe(400)
  })

  it('annonce le nombre de sous-catégories emportées', async () => {
    sous(MEMBRE)
    const res = await appelerCategories({ method: 'DELETE', body: { id: 10 } })
    expect(res.statusCode).toBe(200)
    expect(res.body.sousCategories).toBe(1)
  })
})
