// Lecture des fichiers 3D (STL, 3MF) et analyse géométrique — dans le
// navigateur, aucun fichier n'est envoyé.
//
// Un fichier n'est pas une pièce. Un STL peut en contenir plusieurs
// (`top 5+6+7.stl`), et un 3MF Bambu peut porter, dans un même maillage,
// plusieurs copies superposées de la même pièce. On sépare donc chaque fichier
// en CORPS disjoints (composantes connexes), on écarte les corps parasites et
// les copies superposées, et chaque corps restant devient une référence.
//
// Rien ici ne dépend du DOM : le dézippage passe par DecompressionStream, que
// Node fournit aussi, ce qui garde ce module testable.
//
// Unités : millimètres en entrée et en sortie ; V en cm³ et A en cm² dans
// `analyser()`, parce que c'est ce que lib/impression3d.js attend.

export const VOLUME_MIN = 1000      // mm³ : sous 1 cm³, c'est un corps parasite
export const Z_SECTION = 0.3        // mm : hauteur de la section d'empreinte

// ── STL ──────────────────────────────────────────────────────────────────────

/** Triangles d'un STL binaire ou ASCII : Float32Array de 9 nombres par triangle. */
export function lireSTL(buffer) {
  const octets = new Uint8Array(buffer)
  if (octets.length >= 84) {
    const n = new DataView(buffer).getUint32(80, true)
    if (84 + n * 50 === octets.length) {
      const dv = new DataView(buffer)
      const t = new Float32Array(n * 9)
      for (let i = 0; i < n; i++) {
        const o = 84 + i * 50 + 12
        for (let k = 0; k < 9; k++) t[i * 9 + k] = dv.getFloat32(o + k * 4, true)
      }
      return t
    }
  }
  const texte = new TextDecoder().decode(octets)
  if (!/^\s*solid/.test(texte) || !/facet/.test(texte)) throw new Error('Fichier STL illisible')
  const nombres = []
  const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g
  let m
  while ((m = re.exec(texte))) nombres.push(+m[1], +m[2], +m[3])
  if (nombres.length % 9 !== 0) throw new Error('Fichier STL tronqué')
  return Float32Array.from(nombres)
}

// ── ZIP (le conteneur du 3MF) ────────────────────────────────────────────────

async function inflerBrut(octets) {
  const flux = new Blob([octets]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(flux).arrayBuffer())
}

/** Entrées d'une archive ZIP : Map nom → Uint8Array. Lit le répertoire central. */
export async function dezipper(buffer) {
  const dv = new DataView(buffer)
  const octets = new Uint8Array(buffer)
  let fin = -1
  for (let i = octets.length - 22; i >= Math.max(0, octets.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { fin = i; break }
  }
  if (fin < 0) throw new Error('Archive 3MF illisible')
  let total = dv.getUint16(fin + 10, true)
  let central = dv.getUint32(fin + 16, true)
  // ZIP64 : le répertoire central est décrit plus haut.
  if (central === 0xffffffff && fin >= 20 && dv.getUint32(fin - 20, true) === 0x07064b50) {
    const loc = Number(dv.getBigUint64(fin - 12, true))
    total = Number(dv.getBigUint64(loc + 32, true))
    central = Number(dv.getBigUint64(loc + 48, true))
  }
  const dec = new TextDecoder()
  const entrees = new Map()
  let p = central
  for (let i = 0; i < total; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Archive 3MF corrompue')
    const methode = dv.getUint16(p + 10, true)
    let taille = dv.getUint32(p + 20, true)
    const lNom = dv.getUint16(p + 28, true)
    const lExtra = dv.getUint16(p + 30, true)
    const lCom = dv.getUint16(p + 32, true)
    let local = dv.getUint32(p + 42, true)
    const nom = dec.decode(octets.subarray(p + 46, p + 46 + lNom))
    // Champ ZIP64 : seules les valeurs saturées y figurent, dans l'ordre.
    let e = p + 46 + lNom
    const finExtra = e + lExtra
    while (e + 4 <= finExtra) {
      const id = dv.getUint16(e, true), l = dv.getUint16(e + 2, true)
      if (id === 0x0001) {
        let q = e + 4
        if (dv.getUint32(p + 24, true) === 0xffffffff) q += 8
        if (taille === 0xffffffff) { taille = Number(dv.getBigUint64(q, true)); q += 8 }
        if (local === 0xffffffff) local = Number(dv.getBigUint64(q, true))
      }
      e += 4 + l
    }
    const debut = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true)
    const brut = octets.subarray(debut, debut + taille)
    if (!nom.endsWith('/')) {
      if (methode === 0) entrees.set(nom, brut)
      else if (methode === 8) entrees.set(nom, await inflerBrut(brut))
    }
    p += 46 + lNom + lExtra + lCom
  }
  return entrees
}

// ── 3MF ──────────────────────────────────────────────────────────────────────

const ECHELLES = { micron: 0.001, millimeter: 1, centimeter: 10, inch: 25.4, foot: 304.8, meter: 1000 }
const IDENTITE = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]

function attributs(s) {
  const a = {}
  const re = /([\w:]+)\s*=\s*"([^"]*)"/g
  let m
  while ((m = re.exec(s))) a[m[1]] = m[2]
  return a
}

const lireTransformation = s => {
  const n = (s || '').trim().split(/\s+/).map(Number)
  return n.length === 12 && n.every(Number.isFinite) ? n : IDENTITE
}

// Composition : appliquer `interne` puis `externe` (convention 3MF, vecteur ligne).
function composer(interne, externe) {
  const [a0, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11] = interne
  const [b0, b1, b2, b3, b4, b5, b6, b7, b8, b9, b10, b11] = externe
  return [
    a0 * b0 + a1 * b3 + a2 * b6, a0 * b1 + a1 * b4 + a2 * b7, a0 * b2 + a1 * b5 + a2 * b8,
    a3 * b0 + a4 * b3 + a5 * b6, a3 * b1 + a4 * b4 + a5 * b7, a3 * b2 + a4 * b5 + a5 * b8,
    a6 * b0 + a7 * b3 + a8 * b6, a6 * b1 + a7 * b4 + a8 * b7, a6 * b2 + a7 * b5 + a8 * b8,
    a9 * b0 + a10 * b3 + a11 * b6 + b9, a9 * b1 + a10 * b4 + a11 * b7 + b10, a9 * b2 + a10 * b5 + a11 * b8 + b11,
  ]
}

function lireModele(xml) {
  const unite = attributs((xml.match(/<model\b([^>]*)>/) || [])[1] || '').unit
  const echelle = ECHELLES[unite] ?? 1
  const objets = new Map()
  const reObjet = /<object\b([^>]*?)(?:\/>|>([\s\S]*?)<\/object>)/g
  let m
  while ((m = reObjet.exec(xml))) {
    const a = attributs(m[1])
    const corps = m[2] || ''
    const objet = { id: a.id, nom: a.name || '', type: a.type || 'model', echelle, maillage: null, composants: [] }
    const mesh = corps.match(/<mesh>([\s\S]*?)<\/mesh>/)
    if (mesh) {
      const v = []
      const reV = /<vertex\b([^>]*)\/>/g
      let mv
      while ((mv = reV.exec(mesh[1]))) { const t = attributs(mv[1]); v.push(+t.x, +t.y, +t.z) }
      const f = []
      const reT = /<triangle\b([^>]*)\/>/g
      let mt
      while ((mt = reT.exec(mesh[1]))) { const t = attributs(mt[1]); f.push(+t.v1, +t.v2, +t.v3) }
      objet.maillage = { sommets: v, faces: f }
    }
    const reC = /<component\b([^>]*)\/>/g
    let mc
    while ((mc = reC.exec(corps))) {
      const c = attributs(mc[1])
      objet.composants.push({ id: c.objectid, chemin: c['p:path'] || null, transformation: lireTransformation(c.transform) })
    }
    objets.set(a.id, objet)
  }
  const elements = []
  const reItem = /<item\b([^>]*)\/>/g
  while ((m = reItem.exec(xml))) {
    const a = attributs(m[1])
    if (a.printable === '0') continue
    elements.push({ id: a.objectid, chemin: a['p:path'] || null, transformation: lireTransformation(a.transform) })
  }
  return { objets, elements }
}

/**
 * Objets d'un 3MF : [{ nom, triangles, quantite }]. Les éléments posés qui
 * renvoient au même objet sont comptés en quantité, pas en références.
 */
export async function lire3MF(buffer) {
  const entrees = await dezipper(buffer)
  const dec = new TextDecoder()
  const modeles = new Map()
  const modele = chemin => {
    const cle = chemin.replace(/^\//, '')
    if (!modeles.has(cle)) {
      const brut = entrees.get(cle)
      modeles.set(cle, brut ? lireModele(dec.decode(brut)) : null)
    }
    return modeles.get(cle)
  }
  const racine = [...entrees.keys()].find(n => /^3D\/3dmodel\.model$/i.test(n))
    || [...entrees.keys()].find(n => /\.model$/i.test(n))
  if (!racine) throw new Error('Aucun modèle dans ce 3MF')
  const principal = modele(racine)

  // Aplatit un objet en triangles, transformations comprises.
  const aplatir = (chemin, id, transformation, sortie, profondeur = 0) => {
    const m = modele(chemin)
    const o = m?.objets.get(id)
    if (!o || profondeur > 16) return
    if (o.maillage) {
      const { sommets: v, faces: f } = o.maillage
      const [t0, t1, t2, t3, t4, t5, t6, t7, t8, t9, t10, t11] = transformation
      const s = o.echelle
      for (let i = 0; i < f.length; i++) {
        const k = f[i] * 3
        const x = v[k] * s, y = v[k + 1] * s, z = v[k + 2] * s
        sortie.push(x * t0 + y * t3 + z * t6 + t9, x * t1 + y * t4 + z * t7 + t10, x * t2 + y * t5 + z * t8 + t11)
      }
    }
    for (const c of o.composants) aplatir(c.chemin || chemin, c.id, composer(c.transformation, transformation), sortie, profondeur + 1)
  }

  const parObjet = new Map()
  for (const el of principal.elements) {
    const chemin = el.chemin || racine
    const cle = `${chemin}#${el.id}`
    if (parObjet.has(cle)) { parObjet.get(cle).quantite++; continue }
    const o = modele(chemin)?.objets.get(el.id)
    if (!o || (o.type !== 'model' && o.type !== 'solidsupport' && o.type !== '')) continue
    const sortie = []
    aplatir(chemin, el.id, el.transformation, sortie)
    if (sortie.length) parObjet.set(cle, { nom: o.nom || `objet ${el.id}`, triangles: Float32Array.from(sortie), quantite: 1 })
  }
  return [...parObjet.values()]
}

// ── Corps et mesures ─────────────────────────────────────────────────────────

/**
 * Sépare des triangles en corps disjoints (composantes connexes, sommets
 * soudés au micron). Rend une liste de Float32Array, et `doublons` : le
 * nombre de triangles retirés parce qu'ils existaient déjà.
 *
 * Les doublons sont retirés AVANT la séparation. Deux copies superposées
 * partagent tous leurs sommets : sans ça, elles se souderaient en un seul
 * corps de volume double, et la pièce serait facturée deux fois sa matière.
 */
export function separerCorps(triangles) {
  const nTri = triangles.length / 9
  const index = new Map()
  const sommet = new Int32Array(nTri * 3)
  let n = 0
  for (let i = 0; i < nTri * 3; i++) {
    const cle = `${Math.round(triangles[i * 3] * 1000)},${Math.round(triangles[i * 3 + 1] * 1000)},${Math.round(triangles[i * 3 + 2] * 1000)}`
    let id = index.get(cle)
    if (id === undefined) { id = n++; index.set(cle, id) }
    sommet[i] = id
  }
  const gardes = []
  const deja = new Set()
  for (let t = 0; t < nTri; t++) {
    const a = sommet[t * 3], b = sommet[t * 3 + 1], c = sommet[t * 3 + 2]
    if (a === b || b === c || a === c) continue          // triangle dégénéré
    const cle = [a, b, c].sort((x, y) => x - y).join(',')
    if (deja.has(cle)) continue
    deja.add(cle)
    gardes.push(t)
  }
  const parent = new Int32Array(n)
  for (let i = 0; i < n; i++) parent[i] = i
  const trouver = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x] } return x }
  for (const t of gardes) {
    const a = trouver(sommet[t * 3])
    for (let k = 1; k < 3; k++) { const b = trouver(sommet[t * 3 + k]); if (a !== b) parent[b] = a }
  }
  const groupes = new Map()
  for (const t of gardes) {
    const r = trouver(sommet[t * 3])
    if (!groupes.has(r)) groupes.set(r, [])
    groupes.get(r).push(t)
  }
  const corps = [...groupes.values()].map(liste => {
    const out = new Float32Array(liste.length * 9)
    liste.forEach((t, j) => out.set(triangles.subarray(t * 9, t * 9 + 9), j * 9))
    return out
  })
  corps.doublons = nTri - gardes.length
  return corps
}

/** Volume signé (mm³), surface (mm²) et boîte englobante d'un corps. */
export function mesurer(tri) {
  let vol = 0, aire = 0
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < tri.length; i += 9) {
    const ax = tri[i], ay = tri[i + 1], az = tri[i + 2]
    const bx = tri[i + 3], by = tri[i + 4], bz = tri[i + 5]
    const cx = tri[i + 6], cy = tri[i + 7], cz = tri[i + 8]
    vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az
    aire += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2
    for (let k = 0; k < 9; k++) {
      const a = k % 3
      if (tri[i + k] < min[a]) min[a] = tri[i + k]
      if (tri[i + k] > max[a]) max[a] = tri[i + k]
    }
  }
  return { volume: vol, aire, min, max }
}

/** Inverse l'orientation des triangles (normales retournées). */
export function inverser(tri) {
  for (let i = 0; i < tri.length; i += 9) {
    for (let k = 0; k < 3; k++) { const t = tri[i + 3 + k]; tri[i + 3 + k] = tri[i + 6 + k]; tri[i + 6 + k] = t }
  }
  return tri
}

/** Pose à plat : Z min = 0. X et Y ne bougent pas. */
export function poser(tri, zMin) {
  for (let i = 2; i < tri.length; i += 3) tri[i] -= zMin
  return tri
}

/**
 * Empreinte au sol : plus grande dimension de la section à `z` (mm). Une
 * pièce posée sur un anneau de 11 mm a 11 mm d'empreinte, quelle que soit sa
 * largeur plus haut.
 */
export function empreinte(tri, z = Z_SECTION) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  const prendre = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  for (let i = 0; i < tri.length; i += 9) {
    for (let k = 0; k < 3; k++) {
      const a = i + k * 3, b = i + ((k + 1) % 3) * 3
      const za = tri[a + 2], zb = tri[b + 2]
      if ((za - z) * (zb - z) > 0 || za === zb) continue
      const s = (z - za) / (zb - za)
      prendre(tri[a] + s * (tri[b] - tri[a]), tri[a + 1] + s * (tri[b + 1] - tri[a + 1]))
    }
  }
  return x1 >= x0 ? Math.max(x1 - x0, y1 - y0) : 0
}

/**
 * D'un fichier à des références. `objets` : [{ nom, triangles, quantite }].
 * Rend { references, ecartes } — `ecartes` liste ce qui a été retiré et pourquoi.
 */
export function analyser(objets) {
  const references = []
  const ecartes = []
  for (const objet of objets) {
    const separes = separerCorps(objet.triangles)
    if (separes.doublons > 0) {
      ecartes.push({ nom: objet.nom, raison: `${separes.doublons} triangles en double (copie superposée ou triangles dégénérés)` })
    }
    const corps = separes.map(tri => {
      const m = mesurer(tri)
      return { tri, ...m }
    })
    // Corps parasites : volume nul (maillage ouvert) ou sous 1 cm³.
    const valables = []
    for (const c of corps) {
      if (Math.abs(c.volume) < VOLUME_MIN) {
        ecartes.push({ nom: objet.nom, raison: Math.abs(c.volume) < 1 ? 'maillage ouvert, volume nul' : `corps de ${(Math.abs(c.volume) / 1000).toFixed(2)} cm³` })
        continue
      }
      if (c.volume < 0) { inverser(c.tri); c.volume = -c.volume; c.inverse = true }
      valables.push(c)
    }
    // Copies superposées : même forme au même endroit, au centième de mm.
    const vus = new Set()
    const uniques = []
    for (const c of valables) {
      const cle = [c.tri.length, Math.round(c.volume), Math.round(c.aire), ...c.min, ...c.max].map(v => Math.round(v * 100)).join('|')
      if (vus.has(cle)) { ecartes.push({ nom: objet.nom, raison: 'copie superposée d’un autre corps' }); continue }
      vus.add(cle)
      uniques.push(c)
    }
    uniques.sort((p, q) => p.min[0] - q.min[0])
    uniques.forEach((c, k) => {
      poser(c.tri, c.min[2])
      const dx = c.max[0] - c.min[0], dy = c.max[1] - c.min[1], dz = c.max[2] - c.min[2]
      references.push({
        nom: uniques.length > 1 ? `${objet.nom} #${k + 1}` : objet.nom,
        quantite: objet.quantite || 1,
        dimensions: [dx, dy, dz],
        largeurXY: Math.max(dx, dy),
        hauteur: dz,
        V: c.volume / 1000,
        A: c.aire / 100,
        empreinte: empreinte(c.tri),
        normalesInversees: !!c.inverse,
        triangles: c.tri,
      })
    })
  }
  return { references, ecartes }
}

/**
 * Dans un 3MF, une pièce dupliquée sur le plateau devient souvent un objet à
 * part entière (Bambu Studio en crée un par copie). Même forme = même
 * référence : on additionne les quantités. Pas pour un STL, où chaque corps
 * est une référence par définition.
 */
export function regrouperIdentiques({ references, ecartes }) {
  const parForme = new Map()
  for (const r of references) {
    const cle = [r.triangles.length, r.V, r.A, ...r.dimensions].map(v => Math.round(v * 100)).join('|')
    const deja = parForme.get(cle)
    if (deja) deja.quantite += r.quantite
    else parForme.set(cle, r)
  }
  return { references: [...parForme.values()], ecartes }
}

/** Lit un fichier déposé, quel que soit son format. */
export async function lireFichier(nom, buffer) {
  const base = nom.replace(/\.(stl|3mf)$/i, '')
  if (/\.stl$/i.test(nom)) return analyser([{ nom: base, triangles: lireSTL(buffer), quantite: 1 }])
  if (/\.3mf$/i.test(nom)) {
    const objets = await lire3MF(buffer)
    // Un seul objet : il prend le nom du fichier, plus parlant que « objet 1 ».
    if (objets.length === 1 && /^objet \d+$/.test(objets[0].nom)) objets[0].nom = base
    return regrouperIdentiques(analyser(objets))
  }
  throw new Error('Format non pris en charge (STL ou 3MF)')
}
