import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

// Régression : après la migration des écrans vers les jetons de lib/theme.js,
// quatre fichiers utilisaient `AL.white` ou `C.border` SANS les importer —
// dont le tableau de bord, le catalogue, et ApiErrorBanner qui est monté sur
// toutes les pages.
//
// Ni `next build` ni les tests unitaires ne voient ce genre d'erreur : un
// identifiant libre est parfaitement valide à la compilation, et n'explose
// qu'au rendu, en écran blanc. Seule une lecture des sources l'attrape.
//
// C'est le même raisonnement que tests/relayerFlux.test.js : quand l'outillage
// ne peut pas voir le défaut, on interdit sa forme à la source.

const racine = new URL('..', import.meta.url).pathname
const EXPORTS_THEME = ['AL', 'C', 'R', 'SP', 'FONT', 'MONO', 'PERSON', 'CAL_CAT', 'personChip', 'initials']

const sources = []
const parcourir = (dossier) => {
  for (const e of readdirSync(dossier, { withFileTypes: true })) {
    const chemin = join(dossier, e.name)
    if (e.isDirectory()) {
      if (['node_modules', '.next', '.git'].includes(e.name)) continue
      parcourir(chemin)
    } else if (e.name.endsWith('.js')) sources.push(chemin)
  }
}
for (const d of ['pages', 'components']) parcourir(join(racine, d))

/** Ce qu'un fichier tire de lib/theme, plus ce qu'il déclare lui-même. */
function disponibles(code) {
  const m = code.match(/^import \{([^}]*)\} from '[^']*lib\/theme'$/m)
  const importes = m ? m[1].split(',').map(x => x.trim()).filter(Boolean) : []
  const locaux = [...code.matchAll(/^(?:const|let|var|function)\s+(\w+)/gm)].map(x => x[1])
  return new Set([...importes, ...locaux])
}

describe('les jetons de thème sont importés là où ils servent', () => {
  it('aucun fichier n’utilise un jeton qu’il n’a pas', () => {
    const coupables = []
    for (const fichier of sources) {
      const code = readFileSync(fichier, 'utf8')
      const dispo = disponibles(code)
      for (const jeton of EXPORTS_THEME) {
        if (dispo.has(jeton)) continue
        const membre = new RegExp(`\\b${jeton}\\.[A-Za-z]`)
        const nu = ['FONT', 'MONO'].includes(jeton) && new RegExp(`\\b${jeton}\\b(?!\\s*[:=])`).test(code)
        if (membre.test(code) || nu) coupables.push(`${fichier.slice(racine.length)} → ${jeton}`)
      }
    }
    expect(coupables).toEqual([])
  })
})
