import { describe, it, expect } from 'vitest'
import { lireSTL, lire3MF, dezipper, separerCorps, mesurer, empreinte, analyser, lireFichier } from '../lib/maillage3d'

// Un pavé fermé, normales vers l'extérieur : 12 triangles.
function pave([x0, y0, z0], [dx, dy, dz]) {
  const p = (i, j, k) => [x0 + i * dx, y0 + j * dy, z0 + k * dz]
  const quads = [
    [p(0, 0, 0), p(0, 1, 0), p(1, 1, 0), p(1, 0, 0)], // dessous
    [p(0, 0, 1), p(1, 0, 1), p(1, 1, 1), p(0, 1, 1)], // dessus
    [p(0, 0, 0), p(1, 0, 0), p(1, 0, 1), p(0, 0, 1)],
    [p(1, 0, 0), p(1, 1, 0), p(1, 1, 1), p(1, 0, 1)],
    [p(1, 1, 0), p(0, 1, 0), p(0, 1, 1), p(1, 1, 1)],
    [p(0, 1, 0), p(0, 0, 0), p(0, 0, 1), p(0, 1, 1)],
  ]
  return quads.flatMap(([a, b, c, d]) => [...a, ...b, ...c, ...a, ...c, ...d])
}

function stlBinaire(nombres) {
  const n = nombres.length / 9
  const buf = new ArrayBuffer(84 + n * 50)
  const dv = new DataView(buf)
  dv.setUint32(80, n, true)
  for (let i = 0; i < n; i++) for (let k = 0; k < 9; k++) dv.setFloat32(84 + i * 50 + 12 + k * 4, nombres[i * 9 + k], true)
  return buf
}

function stlAscii(nombres) {
  let s = 'solid test\n'
  for (let i = 0; i < nombres.length; i += 9) {
    s += ' facet normal 0 0 0\n  outer loop\n'
    for (let k = 0; k < 3; k++) s += `   vertex ${nombres[i + k * 3]} ${nombres[i + k * 3 + 1]} ${nombres[i + k * 3 + 2]}\n`
    s += '  endloop\n endfacet\n'
  }
  return new TextEncoder().encode(s + 'endsolid test\n').buffer
}

// Archive ZIP sans compression (méthode 0) — suffisant pour tester la lecture.
function zip(fichiers) {
  const enc = new TextEncoder()
  const parts = [], central = []
  let offset = 0
  for (const [nom, contenu] of Object.entries(fichiers)) {
    const n = enc.encode(nom), d = enc.encode(contenu)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint32(18, d.length, true); local.setUint32(22, d.length, true)
    local.setUint16(26, n.length, true)
    parts.push(new Uint8Array(local.buffer), n, d)
    const c = new DataView(new ArrayBuffer(46))
    c.setUint32(0, 0x02014b50, true)
    c.setUint32(20, d.length, true); c.setUint32(24, d.length, true)
    c.setUint16(28, n.length, true)
    c.setUint32(42, offset, true)
    central.push(new Uint8Array(c.buffer), n)
    offset += 30 + n.length + d.length
  }
  const tailleCentral = central.reduce((s, x) => s + x.length, 0)
  const fin = new DataView(new ArrayBuffer(22))
  fin.setUint32(0, 0x06054b50, true)
  fin.setUint16(8, Object.keys(fichiers).length, true); fin.setUint16(10, Object.keys(fichiers).length, true)
  fin.setUint32(12, tailleCentral, true); fin.setUint32(16, offset, true)
  const tout = [...parts, ...central, new Uint8Array(fin.buffer)]
  const out = new Uint8Array(tout.reduce((s, x) => s + x.length, 0))
  let p = 0
  for (const x of tout) { out.set(x, p); p += x.length }
  return out.buffer
}

function maillageXml(nombres) {
  const v = [], f = []
  for (let i = 0; i < nombres.length; i += 3) v.push(`<vertex x="${nombres[i]}" y="${nombres[i + 1]}" z="${nombres[i + 2]}"/>`)
  for (let t = 0; t < nombres.length / 9; t++) f.push(`<triangle v1="${t * 3}" v2="${t * 3 + 1}" v3="${t * 3 + 2}"/>`)
  return `<mesh><vertices>${v.join('')}</vertices><triangles>${f.join('')}</triangles></mesh>`
}

describe('STL', () => {
  it('lit un STL binaire et un STL ASCII', () => {
    const c = pave([0, 0, 0], [10, 20, 30])
    expect(lireSTL(stlBinaire(c))).toHaveLength(c.length)
    expect(Array.from(lireSTL(stlAscii(c)))).toEqual(c)
  })

  it('mesure volume, surface et boîte', () => {
    const m = mesurer(Float32Array.from(pave([0, 0, 0], [10, 20, 30])))
    expect(m.volume).toBeCloseTo(6000, 3)
    expect(m.aire).toBeCloseTo(2 * (200 + 300 + 600), 3)
    expect(m.max).toEqual([10, 20, 30])
  })

  it('sépare un fichier en corps, triés de gauche à droite', async () => {
    const nombres = [...pave([100, 0, 5], [20, 20, 20]), ...pave([0, 0, 5], [30, 30, 30])]
    const { references } = await lireFichier('top 5+6.stl', stlBinaire(nombres))
    expect(references.map(r => r.nom)).toEqual(['top 5+6 #1', 'top 5+6 #2'])
    expect(references[0].V).toBeCloseTo(27, 3)       // 30 mm de côté, à gauche
    expect(references[1].V).toBeCloseTo(8, 3)
  })

  it('pose à plat et retourne les normales inversées', () => {
    const c = pave([0, 0, 12], [20, 20, 20])
    // Inverse l'orientation de chaque triangle.
    const inverse = []
    for (let i = 0; i < c.length; i += 9) inverse.push(...c.slice(i, i + 3), ...c.slice(i + 6, i + 9), ...c.slice(i + 3, i + 6))
    const { references } = analyser([{ nom: 'p', triangles: Float32Array.from(inverse), quantite: 1 }])
    expect(references[0].V).toBeCloseTo(8, 3)
    expect(references[0].normalesInversees).toBe(true)
    expect(mesurer(references[0].triangles).min[2]).toBeCloseTo(0, 6)
    expect(mesurer(references[0].triangles).volume).toBeGreaterThan(0)
  })

  it('écarte les corps parasites et les copies superposées', () => {
    const nombres = [
      ...pave([0, 0, 0], [20, 20, 20]),
      ...pave([0, 0, 0], [20, 20, 20]),   // copie exacte au même endroit
      ...pave([50, 0, 0], [5, 5, 5]),     // 0,125 cm³
      90, 0, 0, 91, 0, 0, 90, 1, 0,       // triangle isolé, volume nul
    ]
    const { references, ecartes } = analyser([{ nom: 'f', triangles: Float32Array.from(nombres), quantite: 1 }])
    expect(references).toHaveLength(1)
    // La copie superposée ne double pas la matière.
    expect(references[0].V).toBeCloseTo(8, 3)
    expect(ecartes.map(e => e.raison)).toEqual([
      '12 triangles en double (copie superposée ou triangles dégénérés)',
      'corps de 0.13 cm³',
      'maillage ouvert, volume nul',
    ])
  })

  it('mesure l’empreinte sur la section à 0,3 mm', () => {
    // Pied de 10 × 10 sous un plateau de 60 × 60.
    const nombres = [...pave([25, 25, 0], [10, 10, 50]), ...pave([0, 0, 50], [60, 60, 5])]
    expect(separerCorps(Float32Array.from(nombres))).toHaveLength(2)
    expect(empreinte(Float32Array.from(pave([25, 25, 0], [10, 10, 50])))).toBeCloseTo(10, 4)
  })
})

describe('3MF', () => {
  it('dézippe une archive', async () => {
    const e = await dezipper(zip({ 'a.txt': 'bonjour' }))
    expect(new TextDecoder().decode(e.get('a.txt'))).toBe('bonjour')
  })

  it('compte les instances d’un même objet en quantité', async () => {
    const xml = `<?xml version="1.0"?><model unit="millimeter"><resources>
      <object id="1" name="Base4" type="model">${maillageXml(pave([0, 0, 0], [20, 20, 20]))}</object>
      </resources><build>
      <item objectid="1" transform="1 0 0 0 1 0 0 0 1 10 10 0"/>
      <item objectid="1" transform="1 0 0 0 1 0 0 0 1 60 10 0"/>
      </build></model>`
    const objets = await lire3MF(zip({ '3D/3dmodel.model': xml }))
    expect(objets).toHaveLength(1)
    expect(objets[0].quantite).toBe(2)
    expect(objets[0].nom).toBe('Base4')
  })

  it('suit les composants d’un projet Bambu et leurs transformations', async () => {
    const principal = `<model unit="millimeter"><resources>
      <object id="2" name="Top 16" type="model"><components>
        <component p:path="/3D/Objects/object_1.model" objectid="1" transform="2 0 0 0 1 0 0 0 1 0 0 0"/>
      </components></object></resources>
      <build><item objectid="2" transform="1 0 0 0 1 0 0 0 1 100 100 5"/></build></model>`
    const objet = `<model unit="millimeter"><resources>
      <object id="1" type="model">${maillageXml(pave([0, 0, 0], [10, 10, 10]))}</object></resources></model>`
    const { references } = await lireFichier('job.3mf', zip({ '3D/3dmodel.model': principal, '3D/Objects/object_1.model': objet }))
    expect(references).toHaveLength(1)
    expect(references[0].nom).toBe('Top 16')
    expect(references[0].dimensions.map(d => Math.round(d))).toEqual([20, 10, 10])
  })

  it('regroupe les copies d’une même pièce posées comme objets distincts', async () => {
    const m = maillageXml(pave([0, 0, 0], [20, 20, 20]))
    const xml = `<model unit="millimeter"><resources>
      <object id="1" name="A" type="model">${m}</object>
      <object id="2" name="A" type="model">${m}</object></resources>
      <build><item objectid="1"/><item objectid="2" transform="1 0 0 0 1 0 0 0 1 50 0 0"/></build></model>`
    const { references } = await lireFichier('x.3mf', zip({ '3D/3dmodel.model': xml }))
    expect(references).toHaveLength(1)
    expect(references[0].quantite).toBe(2)
  })

  it('convertit les unités', async () => {
    const xml = `<model unit="centimeter"><resources>
      <object id="1" type="model">${maillageXml(pave([0, 0, 0], [2, 2, 2]))}</object></resources>
      <build><item objectid="1"/></build></model>`
    const { references } = await lireFichier('cm.3mf', zip({ '3D/3dmodel.model': xml }))
    expect(references[0].V).toBeCloseTo(8, 3)
    expect(references[0].nom).toBe('cm')
  })
})
