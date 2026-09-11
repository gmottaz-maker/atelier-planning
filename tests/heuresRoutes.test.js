import { describe, it, expect, vi, beforeEach } from 'vitest'
import { faireRes, faireReq, connecter, ANONYME, MEMBRE, ADMIN } from './helpers/routeHarness'

// Même montage que tests/catalogRoute.test.js : les routes appellent
// getSupabaseServer() à l'appel, mais on garde le proxy par sécurité.
let base = null
const proxy = new Proxy({}, { get: (_, prop) => base?.[prop] })
vi.mock('../lib/supabase-server', () => ({ getSupabaseServer: () => proxy }))

let entetes = {}
beforeEach(() => { const c = connecter(ANONYME); base = c.base; entetes = c.headers })

const ACTIVITES = [
  { code: 2, libelle: 'CNC', famille: 'atelier', actif: true },
  { code: 8, libelle: 'Peinture / vernis', famille: 'finitions', actif: true },
  { code: 9, libelle: 'Ancienne', famille: 'finitions', actif: false },
]
// MEMBRE s'appelle Gabin, ADMIN Guillaume (tests/helpers/routeHarness.js).
// La première ligne sert aussi de réponse à `.single()` : le banc d'essai le
// résout sur un instantané pris AVANT l'insert.
const HEURES = () => [
  { id: 1, user_name: 'Gabin',  date: '2026-09-01', debut: '09:00:00', fin: '11:00:00', minutes: 120, activite: 2, project_id: 'p1' },
  { id: 2, user_name: 'Arnaud', date: '2026-09-01', debut: '09:00:00', fin: '12:00:00', minutes: 180, activite: 8, project_id: 'p1' },
]
const TABLES = () => ({
  activites: ACTIVITES,
  projects: [{ id: 'p1', numero: 162, name: 'Canapé Margherita', client: 'Coca-Cola' }],
  heures: HEURES(),
})

const sous = (qui, tables = TABLES()) => {
  const c = connecter(qui, { tables })
  base = c.base; entetes = c.headers
}

// Le banc d'essai n'applique AUCUNE contrainte : on inspecte ce qui PART vers
// la base, pas seulement le code de retour (cf. CLAUDE.md).
function capturer() {
  const vrai = base.from.bind(base)
  const vues = []
  base.from = (nom) => { const q = vrai(nom); vues.push({ nom, q }); return q }
  return {
    insere: () => vues.find(v => v.nom === 'heures' && v.q._inserted)?.q._inserted?.[0],
    maj: () => vues.find(v => v.q._updated)?.q._updated,
    supprime: () => vues.some(v => v.q._deleted),
  }
}

const appeler = async (chemin, options = {}) => {
  const mod = await import(`../pages/api/${chemin}`)
  const res = faireRes()
  await mod.default(faireReq({ ...options, headers: { ...entetes, ...(options.headers || {}) } }), res)
  return res
}

describe('GET /api/heures', () => {
  it('refuse un anonyme', async () => {
    expect((await appeler('heures/index', { method: 'GET' })).statusCode).toBe(401)
  })

  it('un membre ne voit que ses heures, même s\'il en demande d\'autres', async () => {
    sous(MEMBRE)
    const res = await appeler('heures/index', { method: 'GET', query: { user: 'Arnaud' } })
    expect(res.body.map(h => h.user_name)).toEqual(['Gabin'])
  })

  it('l\'admin voit qui il veut, ou tout le monde', async () => {
    sous(ADMIN)
    expect((await appeler('heures/index', { method: 'GET', query: { user: 'Arnaud' } })).body.map(h => h.id)).toEqual([2])
    sous(ADMIN)
    expect((await appeler('heures/index', { method: 'GET' })).body).toHaveLength(2)
  })

  it('filtre par période', async () => {
    sous(ADMIN)
    const res = await appeler('heures/index', { method: 'GET', query: { from: '2026-09-02', to: '2026-09-30' } })
    expect(res.body).toEqual([])
  })
})

describe('POST /api/heures', () => {
  const ligne = (o = {}) => ({ date: '2026-09-02', debut: '09:00', fin: '11:30', activite: 8, project_id: 'p1', ...o })

  // L'identité vient du JWT, jamais du corps (CLAUDE.md, invariants).
  it('un membre impute toujours à son propre nom', async () => {
    sous(MEMBRE)
    const c = capturer()
    const res = await appeler('heures/index', { method: 'POST', body: ligne({ user_name: 'Arnaud' }) })
    expect(res.statusCode).toBe(201)
    expect(c.insere()).toMatchObject({ user_name: 'Gabin', created_by: 'Gabin', source: 'saisie', activite: 8, debut: '09:00', fin: '11:30' })
  })

  it('l\'admin peut saisir pour un collègue', async () => {
    sous(ADMIN)
    const c = capturer()
    await appeler('heures/index', { method: 'POST', body: ligne({ user_name: 'Arnaud' }) })
    expect(c.insere()).toMatchObject({ user_name: 'Arnaud', created_by: 'Guillaume' })
  })

  it('n\'écrit aucun champ que la validation n\'a pas produit', async () => {
    sous(MEMBRE)
    const c = capturer()
    await appeler('heures/index', { method: 'POST', body: ligne({ source: 'scan', minutes: 9999, id: 77 }) })
    expect(Object.keys(c.insere()).sort()).toEqual(
      ['activite', 'created_by', 'date', 'debut', 'fin', 'note', 'project_id', 'source', 'user_name'])
    expect(c.insere().source).toBe('saisie')
  })

  it('accepte une heure sans projet', async () => {
    sous(MEMBRE)
    const c = capturer()
    const res = await appeler('heures/index', { method: 'POST', body: ligne({ project_id: '' }) })
    expect(res.statusCode).toBe(201)
    expect(c.insere().project_id).toBe(null)
  })

  it('refuse un recouvrement avec une heure déjà saisie', async () => {
    sous(MEMBRE)
    const c = capturer()
    const res = await appeler('heures/index', { method: 'POST', body: ligne({ date: '2026-09-01', debut: '10:00', fin: '12:00' }) })
    expect(res.statusCode).toBe(409)
    expect(res.body.error).toMatch(/09:00 à 11:00/)
    expect(c.insere()).toBeUndefined()
  })

  // Les heures d'Arnaud ce jour-là ne gênent pas Gabin.
  it('ne compare qu\'avec les heures de la même personne', async () => {
    sous(MEMBRE)
    const res = await appeler('heures/index', { method: 'POST', body: ligne({ date: '2026-09-01', debut: '11:00', fin: '12:00' }) })
    expect(res.statusCode).toBe(201)
  })

  it('refuse une activité inconnue, un projet inconnu, une date future', async () => {
    sous(MEMBRE)
    expect((await appeler('heures/index', { method: 'POST', body: ligne({ activite: 42 }) })).statusCode).toBe(400)
    sous(MEMBRE)
    expect((await appeler('heures/index', { method: 'POST', body: ligne({ project_id: 'inconnu' }) })).body.error).toBe('Projet introuvable')
    sous(MEMBRE)
    expect((await appeler('heures/index', { method: 'POST', body: ligne({ date: '2099-01-01' }) })).statusCode).toBe(400)
  })
})

describe('PUT / DELETE /api/heures/[id]', () => {
  // Un 403 confirmerait que la ligne existe.
  it('la ligne d\'un collègue est introuvable pour un membre', async () => {
    sous(MEMBRE)
    expect((await appeler('heures/[id]', { method: 'PUT', query: { id: '2' }, body: { note: 'x' } })).statusCode).toBe(404)
    sous(MEMBRE)
    const c = capturer()
    expect((await appeler('heures/[id]', { method: 'DELETE', query: { id: '2' } })).statusCode).toBe(404)
    expect(c.supprime()).toBe(false)
  })

  it('modifie sa propre ligne sans toucher à l\'auteur ni à la source', async () => {
    sous(MEMBRE)
    const c = capturer()
    const res = await appeler('heures/[id]', { method: 'PUT', query: { id: '1' }, body: { fin: '12:00', user_name: 'Arnaud', source: 'scan' } })
    expect(res.statusCode).toBe(200)
    expect(c.maj()).toMatchObject({ fin: '12:00', debut: '09:00', activite: 2 })
    expect(c.maj()).not.toHaveProperty('user_name')
    expect(c.maj()).not.toHaveProperty('source')
  })

  it('ne se compare pas à elle-même en cherchant les recouvrements', async () => {
    sous(MEMBRE)
    expect((await appeler('heures/[id]', { method: 'PUT', query: { id: '1' }, body: { debut: '09:30' } })).statusCode).toBe(200)
  })

  it('l\'admin corrige et supprime la ligne de n\'importe qui', async () => {
    sous(ADMIN)
    expect((await appeler('heures/[id]', { method: 'PUT', query: { id: '2' }, body: { note: 'corrigé' } })).statusCode).toBe(200)
    sous(ADMIN)
    const c = capturer()
    expect((await appeler('heures/[id]', { method: 'DELETE', query: { id: '2' } })).statusCode).toBe(200)
    expect(c.supprime()).toBe(true)
  })
})

describe('GET /api/heures/export', () => {
  it('est réservé à l\'admin', async () => {
    sous(MEMBRE)
    expect((await appeler('heures/export', { method: 'GET' })).statusCode).toBe(403)
  })

  it('rend un CSV téléchargeable', async () => {
    sous(ADMIN)
    const res = await appeler('heures/export', { method: 'GET', query: { from: '2026-09-01', to: '2026-09-30' } })
    expect(res.statusCode).toBe(200)
    expect(res.headers['Content-Type']).toMatch(/text\/csv/)
    expect(res.headers['Content-Disposition']).toMatch(/attachment/)
    expect(res.body.startsWith('﻿')).toBe(true)
    expect(res.body.split('\r\n')).toHaveLength(3)
  })

  it('rend les mêmes lignes en JSON pour un traitement automatisé', async () => {
    sous(ADMIN)
    const res = await appeler('heures/export', { method: 'GET', query: { format: 'json' } })
    expect(res.body).toHaveLength(2)
    expect(res.body[0]).toHaveProperty('activite_code')
  })

  it('refuse une date mal formée', async () => {
    sous(ADMIN)
    expect((await appeler('heures/export', { method: 'GET', query: { from: '1.9.2026' } })).statusCode).toBe(400)
  })
})

describe('/api/activites', () => {
  it('se lit par tout le monde', async () => {
    sous(MEMBRE)
    expect((await appeler('activites', { method: 'GET' })).body).toHaveLength(3)
  })

  it('ne se crée ni ne se modifie par un membre', async () => {
    sous(MEMBRE)
    expect((await appeler('activites', { method: 'POST', body: { code: 30, libelle: 'x', famille: 'atelier' } })).statusCode).toBe(403)
    sous(MEMBRE)
    expect((await appeler('activites', { method: 'PATCH', body: { code: 2, actif: false } })).statusCode).toBe(403)
  })

  it('ne réattribue jamais un code', async () => {
    sous(ADMIN)
    const res = await appeler('activites', { method: 'POST', body: { code: 9, libelle: 'Autre', famille: 'atelier' } })
    expect(res.statusCode).toBe(400)
  })

  it('se désactive plutôt que de se supprimer, et garde son code', async () => {
    sous(ADMIN)
    const c = capturer()
    await appeler('activites', { method: 'PATCH', body: { code: 2, actif: false, code_nouveau: 5 } })
    expect(c.maj()).toEqual({ actif: false })
  })
})
