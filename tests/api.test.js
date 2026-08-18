import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { apiFetch, apiPost, ApiError, surErreurApi } from '../lib/api'

const origine = globalThis.fetch
afterEach(() => { globalThis.fetch = origine })

const reponse = (statut, corps, type = 'application/json') => ({
  ok: statut >= 200 && statut < 300,
  status: statut,
  headers: { get: () => type },
  json: async () => corps,
  clone() { return this },
})

let recues = []
let desabonner = null
beforeEach(() => {
  recues = []
  desabonner?.()
  desabonner = surErreurApi(e => recues.push(e))
})
afterEach(() => { desabonner?.(); desabonner = null })

describe('client API', () => {
  it('renvoie le corps quand tout va bien', async () => {
    globalThis.fetch = async () => reponse(200, { id: 1 })
    await expect(apiFetch('/api/x')).resolves.toEqual({ id: 1 })
    expect(recues).toHaveLength(0)
  })

  it('lève une ApiError portant statut, code et identifiant de requête', async () => {
    globalThis.fetch = async () => reponse(403, { error: 'Accès refusé', code: 'forbidden', request_id: 'abc123' })
    const e = await apiFetch('/api/x', { method: 'PUT' }).catch(x => x)
    expect(e).toBeInstanceOf(ApiError)
    expect(e.status).toBe(403)
    expect(e.code).toBe('forbidden')
    expect(e.requestId).toBe('abc123')
    expect(e.message).toBe('Accès refusé')
  })

  it('signale une mutation échouée — c\'est le bug du bouton muet', async () => {
    globalThis.fetch = async () => reponse(405, { error: 'Méthode non autorisée' })
    await apiPost('/api/facture', { statut: 'sent' }).catch(() => {})
    expect(recues).toHaveLength(1)
    expect(recues[0].message).toBe('Méthode non autorisée')
  })

  it('ne signale pas une lecture échouée — l\'écran s\'en charge', async () => {
    globalThis.fetch = async () => reponse(500, { error: 'Erreur interne' })
    await apiFetch('/api/liste').catch(() => {})
    expect(recues).toHaveLength(0)
  })

  it('respecte `silencieux` quand l\'appelant affiche l\'erreur lui-même', async () => {
    globalThis.fetch = async () => reponse(500, { error: 'boum' })
    await apiFetch('/api/x', { method: 'POST', silencieux: true }).catch(() => {})
    expect(recues).toHaveLength(0)
  })

  it('ne transforme pas une annulation en panne', async () => {
    globalThis.fetch = async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e }
    const e = await apiFetch('/api/x', { method: 'POST' }).catch(x => x)
    expect(e.name).toBe('AbortError')
    expect(recues).toHaveLength(0)   // changer de page ne doit pas alerter
  })

  it('signale une coupure réseau avec un message compréhensible', async () => {
    globalThis.fetch = async () => { throw new TypeError('Failed to fetch') }
    const e = await apiPost('/api/x', {}).catch(x => x)
    expect(e).toBeInstanceOf(ApiError)
    expect(e.message).toMatch(/réseau/i)
    expect(recues).toHaveLength(1)
  })

  it('sérialise `json` et pose l\'en-tête', async () => {
    let vu = null
    globalThis.fetch = async (url, init) => { vu = init; return reponse(200, {}) }
    await apiPost('/api/x', { a: 1 })
    expect(vu.method).toBe('POST')
    expect(vu.body).toBe('{"a":1}')
    expect(vu.headers['Content-Type']).toBe('application/json')
  })

  it('marque ses appels, pour que l\'intercepteur global ne double pas l\'alerte', async () => {
    let vu = null
    globalThis.fetch = async (url, init) => { vu = init; return reponse(200, {}) }
    await apiFetch('/api/x')
    expect(vu.__mazeApi).toBe(true)
  })

  it('abandonne au-delà du délai demandé', async () => {
    globalThis.fetch = (url, init) => new Promise((_, rejeter) => {
      init.signal.addEventListener('abort', () => {
        const e = new Error('aborted'); e.name = 'AbortError'; rejeter(e)
      })
    })
    await expect(apiFetch('/api/lent', { timeoutMs: 10 })).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('supporte une réponse sans corps JSON', async () => {
    globalThis.fetch = async () => reponse(200, null, 'text/plain')
    await expect(apiFetch('/api/x')).resolves.toBeNull()
  })

  it('retombe sur le statut quand le corps d\'erreur est illisible', async () => {
    globalThis.fetch = async () => ({
      ok: false, status: 502, headers: { get: () => 'text/html' }, json: async () => { throw new Error('x') },
    })
    const e = await apiFetch('/api/x', { method: 'DELETE' }).catch(x => x)
    expect(e.message).toBe('Erreur 502')
    expect(e.status).toBe(502)
  })
})
