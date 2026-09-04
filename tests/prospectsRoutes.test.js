import { describe, it, expect, vi, beforeEach } from 'vitest'
import { faireRes, faireReq, connecter, ANONYME, MEMBRE, ADMIN } from './helpers/routeHarness'

// Les routes de prospection écrivent dans trois tables et créent des contacts à
// la conversion. Leur garde-fou compte autant que leur résultat.
let base = null
const proxy = new Proxy({}, { get: (_, p) => base?.[p] })
vi.mock('../lib/supabase-server', () => ({ getSupabaseServer: () => proxy }))

let entetes = {}
beforeEach(() => { const c = connecter(ANONYME); base = c.base; entetes = c.headers })
const sous = (qui, tables = {}) => { const c = connecter(qui, { tables }); base = c.base; entetes = c.headers }

const appeler = async (mod, options = {}) => {
  const m = await import(mod)
  const res = faireRes()
  await m.default(faireReq({ ...options, headers: { ...entetes, ...(options.headers || {}) } }), res)
  return res
}

const LISTE = '../pages/api/prospects/index'
const FICHE = '../pages/api/prospects/[id]'
const JOURNAL = '../pages/api/prospects/[id]/interactions'
const CONVERT = '../pages/api/prospects/[id]/convert'

// Chaque table porte au moins une ligne : le banc d'essai résout `.single()`
// sur un instantané pris AVANT l'insert, il lui faut de quoi répondre.
const BASE = () => ({
  prospects: [{ id: 1, name: 'Galeries Rive', stage: 'presentation', city: 'Genève' }],
  prospect_people: [{ id: 5, prospect_id: 1, name: 'Sophie Renaud' }],
  prospect_interactions: [{ id: 7, prospect_id: 1, channel: 'email', occurred_on: '2026-08-12' }],
  contacts: [{ id: 99, kind: 'company', name: 'Déjà là' }],
})

describe('autorisations', () => {
  it('toutes les routes de prospection sont réservées à l\'admin', async () => {
    for (const mod of [LISTE, FICHE, JOURNAL, CONVERT]) {
      const anon = await appeler(mod, { method: 'GET', query: { id: '1' } })
      expect(anon.statusCode, mod).toBe(401)
    }
    sous(MEMBRE, BASE())
    for (const mod of [LISTE, FICHE, JOURNAL, CONVERT]) {
      const membre = await appeler(mod, { method: 'GET', query: { id: '1' } })
      expect(membre.statusCode, mod).toBe(403)
    }
  })
})

describe('création d\'un prospect', () => {
  it('exige un nom', async () => {
    sous(ADMIN, BASE())
    const res = await appeler(LISTE, { method: 'POST', body: { city: 'Genève' } })
    expect(res.statusCode).toBe(400)
  })

  // Liste blanche : sans elle, toute colonne ajoutée plus tard devient
  // inscriptible depuis le navigateur.
  it('n\'écrit que les colonnes de la liste blanche', async () => {
    sous(ADMIN, BASE())
    const vues = []
    const vrai = base.from.bind(base)
    base.from = (n) => { const q = vrai(n); vues.push(q); return q }
    await appeler(LISTE, { method: 'POST', body: { name: 'X', id: 42, converted_to_contact_id: 7, pirate: 'x' } })
    const insere = vues.find(q => q._inserted)?._inserted?.[0] ?? {}
    expect(insere.name).toBe('X')
    expect(insere.id).toBeUndefined()
    expect(insere.converted_to_contact_id).toBeUndefined()
    expect(insere.pirate).toBeUndefined()
  })
})

describe('journal des échanges', () => {
  it('refuse un canal inconnu', async () => {
    sous(ADMIN, BASE())
    const res = await appeler(JOURNAL, { method: 'POST', query: { id: '1' }, body: { channel: 'pigeon' } })
    expect(res.statusCode).toBe(400)
  })

  it('accepte les canaux du modèle', async () => {
    sous(ADMIN, BASE())
    for (const c of ['telephone', 'email', 'linkedin', 'whatsapp', 'visite']) {
      const res = await appeler(JOURNAL, { method: 'POST', query: { id: '1' }, body: { channel: c } })
      expect(res.statusCode, c).toBe(201)
    }
  })

  // L'identité vient du JWT, jamais du corps : un champ `author` envoyé par le
  // navigateur est une déclaration, pas une identité.
  it('signe l\'échange avec l\'utilisateur du jeton, pas avec le corps', async () => {
    sous(ADMIN, BASE())
    const vues = []
    const vrai = base.from.bind(base)
    base.from = (n) => { const q = vrai(n); vues.push(q); return q }
    await appeler(JOURNAL, { method: 'POST', query: { id: '1' }, body: { channel: 'email', author: 'Quelqu\'un d\'autre' } })
    const insere = vues.find(q => q._inserted)?._inserted?.[0] ?? {}
    expect(insere.author).toBe('Guillaume')
  })
})

describe('conversion en client', () => {
  it('crée la société et marque le prospect converti', async () => {
    sous(ADMIN, BASE())
    const res = await appeler(CONVERT, { method: 'POST', query: { id: '1' } })
    expect(res.statusCode).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('refuse une seconde conversion', async () => {
    sous(ADMIN, {
      ...BASE(),
      prospects: [{ id: 1, name: 'Galeries Rive', converted_to_contact_id: 99 }],
    })
    const res = await appeler(CONVERT, { method: 'POST', query: { id: '1' } })
    expect(res.statusCode).toBe(409)
  })

  it('répond 404 sur un prospect inconnu', async () => {
    sous(ADMIN, BASE())
    const res = await appeler(CONVERT, { method: 'POST', query: { id: '404' } })
    expect(res.statusCode).toBe(404)
  })

  // Le journal explique pourquoi ce client existe : par quel canal, en combien
  // de relances. Le supprimer avec le prospect l'effacerait.
  it('un prospect converti ne se supprime pas', async () => {
    sous(ADMIN, { ...BASE(), prospects: [{ id: 1, name: 'X', converted_to_contact_id: 99 }] })
    const res = await appeler(FICHE, { method: 'DELETE', query: { id: '1' } })
    expect(res.statusCode).toBe(409)
  })
})
