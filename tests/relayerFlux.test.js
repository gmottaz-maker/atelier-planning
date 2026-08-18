import { describe, it, expect } from 'vitest'
import { Writable } from 'stream'
import { relayerFlux } from '../lib/fileType'

// Réponse HTTP factice qui se comporte comme un flux inscriptible : c'est ce
// que reçoit une route API sous le Pages Router.
function faireRes() {
  const morceaux = []
  const res = new Writable({
    write(chunk, _enc, cb) { morceaux.push(Buffer.from(chunk)); cb() },
  })
  res.entetes = {}
  res.setHeader = (k, v) => { res.entetes[k] = v }
  res.corps = () => Buffer.concat(morceaux)
  return res
}

const fluxDepuis = (texte, morceaux = 1) => new ReadableStream({
  start(controller) {
    const enc = new TextEncoder()
    const taille = Math.ceil(texte.length / morceaux)
    for (let i = 0; i < texte.length; i += taille) controller.enqueue(enc.encode(texte.slice(i, i + taille)))
    controller.close()
  },
})

describe('relais en flux des téléchargements', () => {
  it('transmet le contenu sans le charger deux fois en mémoire', async () => {
    const res = faireRes()
    await relayerFlux({ body: fluxDepuis('contenu du fichier', 4), headers: { get: () => null } }, res)
    expect(res.corps().toString()).toBe('contenu du fichier')
  })

  it('reporte la taille annoncée par kDrive', async () => {
    const res = faireRes()
    await relayerFlux({ body: fluxDepuis('abc'), headers: { get: (k) => (k === 'content-length' ? '3' : null) } }, res)
    expect(res.entetes['Content-Length']).toBe('3')
  })

  it('retombe sur le tampon quand la réponse n\'a pas de flux', async () => {
    // Certains clients HTTP et les simulations de test ne fournissent pas `body`.
    const res = faireRes()
    await relayerFlux({
      headers: { get: () => null },
      arrayBuffer: async () => new TextEncoder().encode('replies').buffer,
    }, res)
    expect(res.corps().toString()).toBe('replies')
  })

  it('remonte une erreur de flux au lieu de rester bloqué', async () => {
    const res = faireRes()
    const cassee = new ReadableStream({ start(c) { c.error(new Error('coupure kDrive')) } })
    await expect(relayerFlux({ body: cassee, headers: { get: () => null } }, res)).rejects.toThrow()
  })
})
