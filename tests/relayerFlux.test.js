import { describe, it, expect } from 'vitest'
import { Writable } from 'stream'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
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

// Régression : `const { Readable } = await import('stream')` marchait sous
// vitest et sous Node, mais pas dans le bundle serveur de Next. Webpack range
// les exports d'un builtin CJS chargé dynamiquement sous `.default`, donc
// `Readable` valait `undefined` et `Readable.fromWeb` faisait tomber en 500
// TOUTES les routes qui servent un fichier — téléchargement kDrive, vignettes,
// pièces jointes. Les tests unitaires ne peuvent pas voir la différence : on
// interdit donc la forme fautive à la source.
describe('les builtins Node ne sont pas chargés dynamiquement', () => {
  const racine = new URL('..', import.meta.url).pathname
  const BUILTINS = 'assert|buffer|child_process|crypto|events|fs|http|https|net|os|path|stream|string_decoder|timers|tls|url|util|zlib'
  const FAUTIF = new RegExp(`import\\s*\\(\\s*['"\`](node:)?(${BUILTINS})(/[\\w/]+)?['"\`]\\s*\\)`)

  const sources = []
  const parcourir = (dossier) => {
    for (const entree of readdirSync(dossier, { withFileTypes: true })) {
      const chemin = join(dossier, entree.name)
      if (entree.isDirectory()) {
        if (['node_modules', '.next', '.git'].includes(entree.name)) continue
        parcourir(chemin)
      } else if (entree.name.endsWith('.js')) sources.push(chemin)
    }
  }
  for (const d of ['lib', 'pages', 'components']) parcourir(join(racine, d))

  // Les commentaires sont retirés : ce fichier-ci comme lib/fileType.js citent
  // la forme fautive pour l'expliquer, et une prose ne casse pas un bundle.
  const sansCommentaires = (code) => code
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

  it('aucun fichier de lib/, pages/ ou components/ ne le fait', () => {
    const coupables = sources.filter((f) => FAUTIF.test(sansCommentaires(readFileSync(f, 'utf8'))))
    expect(coupables.map((f) => f.slice(racine.length))).toEqual([])
  })

  it('le relais de flux importe bien Readable statiquement', () => {
    const source = readFileSync(join(racine, 'lib/fileType.js'), 'utf8')
    expect(source).toMatch(/^import \{ Readable \} from 'node:stream'$/m)
  })
})
