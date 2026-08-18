import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchTimeout, TimeoutError, DELAI_DEFAUT, DELAI_IA } from '../lib/fetchTimeout'

const origine = globalThis.fetch
afterEach(() => { globalThis.fetch = origine })

// fetch simulé : résout après `ms`, ou rejette en AbortError si on l'annule
// avant — y compris quand le signal est DÉJÀ annulé à l'appel, comme le vrai
// fetch.
function fetchLent(ms) {
  return (url, options) => new Promise((resolve, reject) => {
    const abandon = () => {
      const e = new Error('aborted'); e.name = 'AbortError'; reject(e)
    }
    if (options?.signal?.aborted) return abandon()
    const t = setTimeout(() => resolve({ ok: true, url }), ms)
    options?.signal?.addEventListener('abort', () => { clearTimeout(t); abandon() })
  })
}

describe('fetch avec délai', () => {
  it('renvoie la réponse quand elle arrive à temps', async () => {
    globalThis.fetch = fetchLent(5)
    await expect(fetchTimeout('https://exemple.test/x', {}, 200)).resolves.toMatchObject({ ok: true })
  })

  it('abandonne au-delà du délai, avec une erreur lisible', async () => {
    globalThis.fetch = fetchLent(500)
    await expect(fetchTimeout('https://kdrive.infomaniak.com/x', {}, 20))
      .rejects.toThrow(TimeoutError)
  })

  it('nomme l\'hôte dans le message — sinon on ne sait pas qui a lâché', async () => {
    globalThis.fetch = fetchLent(500)
    await expect(fetchTimeout('https://api.resend.com/emails', {}, 20))
      .rejects.toThrow(/api\.resend\.com/)
  })

  it('respecte une annulation venue de l\'appelant sans la requalifier', async () => {
    globalThis.fetch = fetchLent(500)
    const ctrl = new AbortController()
    const p = fetchTimeout('https://exemple.test/x', { signal: ctrl.signal }, 5000)
    ctrl.abort()
    await expect(p).rejects.toSatisfy(e => e.name === 'AbortError' && !e.timeout)
  })

  it('part déjà annulé si le signal l\'est', async () => {
    globalThis.fetch = fetchLent(500)
    await expect(fetchTimeout('https://exemple.test/x', { signal: AbortSignal.abort() }, 5000))
      .rejects.toThrow()
  })

  it('laisse passer les erreurs réseau telles quelles', async () => {
    globalThis.fetch = () => Promise.reject(new Error('ECONNREFUSED'))
    await expect(fetchTimeout('https://exemple.test/x', {}, 100)).rejects.toThrow('ECONNREFUSED')
  })

  it('laisse à l\'IA un délai bien plus long qu\'aux autres appels', () => {
    // Un OCR de facture prend couramment 30 à 60 s.
    expect(DELAI_IA).toBeGreaterThan(DELAI_DEFAUT * 2)
  })
})
