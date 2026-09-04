// Lecture d'un .xlsx sans dépendance : c'est un zip de XML, et ajouter
// `openpyxl` ou `xlsx` au projet pour un import ponctuel serait disproportionné.
//
// Couvre ce dont l'import a besoin : chaînes partagées, valeurs, `inlineStr`.
// Pas les formules ni les dates sérialisées — le classeur de prospection n'en a
// pas, et une lecture qui échoue bruyamment vaut mieux qu'une qui devine.
import { execFileSync } from 'child_process'

const decoder = new TextDecoder('utf-8')

function lireEntree(zip, nom) {
  try {
    return decoder.decode(execFileSync('unzip', ['-p', zip, nom],
      { maxBuffer: 64 * 1024 * 1024, encoding: 'buffer', stdio: ['ignore', 'pipe', 'ignore'] }))
  } catch { return null }
}

const balises = (xml, nom) => [...xml.matchAll(new RegExp(`<${nom}\\b[^>]*/>|<${nom}\\b[^>]*>[\\s\\S]*?</${nom}>`, 'g'))].map(m => m[0])
const attr = (t, nom) => (t.match(new RegExp(`${nom}="([^"]*)"`)) || [])[1]
const dechappe = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&')
const textes = t => [...t.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(m => dechappe(m[1])).join('')

function indiceColonne(ref) {
  const lettres = (ref.match(/^([A-Z]+)/) || ['', ''])[1]
  let n = 0
  for (const c of lettres) n = n * 26 + (c.charCodeAt(0) - 64)
  return n - 1
}

export function lireXlsx(chemin) {
  // Table des chaînes partagées : absente des classeurs qui écrivent tout en
  // `inlineStr`, ce qui est le cas de celui de la prospection. Son absence
  // n'est donc pas une anomalie.
  const partagees = []
  const ss = lireEntree(chemin, 'xl/sharedStrings.xml')
  if (ss) for (const si of balises(ss, 'si')) partagees.push(textes(si))

  const wb = lireEntree(chemin, 'xl/workbook.xml')
  const rels = lireEntree(chemin, 'xl/_rels/workbook.xml.rels') || ''
  const cibles = Object.fromEntries(balises(rels, 'Relationship')
    .map(r => [attr(r, 'Id'), attr(r, 'Target')]))

  const out = []
  for (const sh of balises(wb || '', 'sheet')) {
    const nom = dechappe(attr(sh, 'name') || '')
    // La cible d'une relation est soit ABSOLUE dans l'archive
    // (« /xl/worksheets/sheet1.xml »), soit relative au dossier du classeur
    // (« worksheets/sheet1.xml »). Les deux formes existent selon le
    // producteur du fichier ; ne traiter que la seconde donnait « xl/xl/… ».
    const cible = cibles[attr(sh, 'r:id')] || ''
    const chemin_f = cible.startsWith('/') ? cible.slice(1)
      : cible.startsWith('xl/') ? cible : 'xl/' + cible
    const xml = lireEntree(chemin, chemin_f)
    if (!xml) continue

    const lignes = []
    for (const row of balises(xml, 'row')) {
      const cellules = {}
      for (const c of balises(row, 'c')) {
        const i = indiceColonne(attr(c, 'r') || 'A1')
        const t = attr(c, 't')
        if (t === 'inlineStr') { cellules[i] = textes(c); continue }
        const v = (c.match(/<v>([\s\S]*?)<\/v>/) || [])[1]
        if (v == null) { cellules[i] = null; continue }
        cellules[i] = t === 's' ? partagees[+v] : dechappe(v)
      }
      const largeur = Object.keys(cellules).length ? Math.max(...Object.keys(cellules).map(Number)) + 1 : 0
      lignes.push(Array.from({ length: largeur }, (_, i) => cellules[i] ?? null))
    }
    out.push([nom, lignes])
  }
  return out
}
