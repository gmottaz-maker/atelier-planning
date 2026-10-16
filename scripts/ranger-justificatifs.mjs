#!/usr/bin/env node
// Verser les justificatifs comptables dans l'année de comptabilité qui leur
// correspond — pour qu'un contrôle fiscal n'ait qu'UN dossier à ouvrir.
//
//   node scripts/ranger-justificatifs.mjs            → RAPPORT seulement
//   node scripts/ranger-justificatifs.mjs --ecrire   → déplace, et tient un journal
//
// ── Ce qu'il déplace, et ce qu'il laisse ───────────────────────────────────
//
// `Justificatifs comptables` a été reclassé par année et par trimestre en
// septembre 2026. Ce script ne devine donc AUCUNE date : il reprend le
// classement existant et verse chaque trimestre dans
// « Comptabilité <année> / Justificatifs comptables / T<n> ».
//
// Trois choses restent délibérément sur place :
//
//   — `_Export bexio (classé par date de saisie)`. Son arborescence suit la
//     date de SAISIE, pas celle du document : le dossier « Saisie 2024 »
//     contient des pièces de 2023. Le verser dans des années de document
//     mélangerait les exercices — c'est le piège documenté dans les
//     conventions, rencontré quatre fois.
//   — `_Sans date`. Sans année, pas de destination.
//   — `LISEZ-MOI.md`, qui décrit le dossier et doit rester avec ce qu'il reste.
//
// ── Ce qu'il NE fusionne pas ───────────────────────────────────────────────
//
// `Comptabilité <année>` contient déjà, pour 2025 et 2026, un dossier
// `Justificatifs` : les tickets déposés par Maze. Les justificatifs
// historiques vont dans un dossier SÉPARÉ, `Justificatifs comptables`. Les
// confondre rendrait indistinguables deux pièces du même trimestre — et
// certaines sont peut-être le même ticket scanné deux fois.
//
// ── Réversibilité ──────────────────────────────────────────────────────────
//
// Toutes les opérations sont des DÉPLACEMENTS, journalisés dans le même format
// que `ranger-finance.mjs` : `annuler-ranger-finance.mjs` les rejoue à
// l'envers. Les dossiers d'année d'origine sont laissés en place, vides, pour
// que l'annulation reste possible — les supprimer est un geste séparé.
import { readFileSync, appendFileSync } from 'fs'

function env() {
  const out = { ...process.env }
  try {
    for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
      if (!l.includes('=') || l.startsWith('#')) continue
      const i = l.indexOf('=')
      out[l.slice(0, i).trim()] ||= l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    }
  } catch {}
  return out
}
const E = env()
const ECRIRE = process.argv.includes('--ecrire')
const JOURNAL = 'journal-ranger-finance.tsv'

const ADMIN_ID = 53682
const BASE = `https://api.infomaniak.com/2/drive/${E.KDRIVE_DRIVE_ID}`

async function kf(chemin, init = {}) {
  const r = await fetch(`${BASE}${chemin}`, {
    ...init, headers: { Authorization: `Bearer ${E.KDRIVE_TOKEN}`, ...(init.headers || {}) },
  })
  const txt = await r.text()
  let d
  try { d = JSON.parse(txt) } catch { throw new Error(`kDrive: réponse non-JSON (HTTP ${r.status})`) }
  if (d.result !== 'success') throw new Error(`kDrive: ${d.error?.description || JSON.stringify(d.error)}`)
  return d.data
}
const lister = id => kf(`/files/${id}/files?per_page=200`)
const sansAccent = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
async function enfant(parent, nom) {
  const cible = sansAccent(nom)
  return (await lister(parent)).find(f => sansAccent(f.name) === cible) || null
}
async function exige(parent, nom, chemin) {
  const t = await enfant(parent, nom)
  if (!t || t.type !== 'dir') throw new Error(`« ${chemin} » introuvable — renommé ou déplacé ?`)
  return t
}
async function creer(parent, nom) {
  const t = await enfant(parent, nom)
  if (t && t.type === 'dir') return t
  if (!ECRIRE) return { id: `(à créer)`, name: nom, _virtuel: true }
  return kf(`/files/${parent}/directory`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: nom }),
  })
}

async function main() {
  const finances = await exige(ADMIN_ID, 'Finances', '00. Admin / Finances')
  const compta   = await exige(finances.id, 'Comptabilité', '00. Admin / Finances / Comptabilité')

  // Le dossier source a été RENOMMÉ « Export bexio 2018-2026 » le jour même,
  // une fois les 929 pièces versées : son ancien nom ne décrivait plus son
  // contenu. On accepte les deux, et son absence signifie simplement que la
  // reprise est faite — un script de migration qui plante parce que son
  // travail est terminé est un piège pour le prochain qui le lit.
  const source = await enfant(finances.id, 'Justificatifs comptables')
    || (await lister(finances.id)).find(f => f.type === 'dir' && /^export bexio/i.test(f.name))
  if (!source) {
    console.log('Ni « Justificatifs comptables » ni « Export bexio … » dans Finances : rien à verser.')
    return
  }

  const annees = (await lister(source.id))
    .filter(f => f.type === 'dir' && /^\d{4}$/.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name))

  const horo = new Date().toISOString()
  let deplacements = 0, aCreer = 0, pieces = 0

  for (const an of annees) {
    const trimestres = (await lister(an.id)).filter(f => f.type === 'dir')
    const vrac = (await lister(an.id)).filter(f => f.type !== 'dir')
    if (vrac.length) {
      // Un fichier posé directement dans l'année n'a pas de trimestre : on le
      // signale plutôt que de lui en inventer un.
      console.log(`  ! ${an.name} : ${vrac.length} fichier(s) hors trimestre — LAISSÉS EN PLACE`)
      for (const f of vrac) console.log(`      ${f.name}`)
    }

    const cibleAnnee = await creer(compta.id, `Comptabilité ${an.name}`)
    if (cibleAnnee._virtuel) aCreer++
    const dest = cibleAnnee._virtuel ? cibleAnnee : await creer(cibleAnnee.id, 'Justificatifs comptables')
    if (dest._virtuel && !cibleAnnee._virtuel) aCreer++

    let n = 0
    for (const t of trimestres) {
      n += (await lister(t.id)).filter(f => f.type !== 'dir').length
      if (ECRIRE) {
        await kf(`/files/${t.id}/move/${dest.id}`, { method: 'POST' })
        appendFileSync(JOURNAL, [horo, 'verser-trimestre', t.id, `${an.name}/${t.name}`, an.id, dest.id].join('\t') + '\n')
      }
      deplacements++
    }
    pieces += n
    console.log(`  ${an.name} → Comptabilité ${an.name} / Justificatifs comptables : ${trimestres.length} trimestre(s), ${n} pièce(s)${cibleAnnee._virtuel ? '  [année à créer]' : ''}`)
  }

  const restants = (await lister(source.id)).filter(f => !/^\d{4}$/.test(f.name))
  console.log(`\nLaissés dans ${source.name} :`)
  for (const f of restants) console.log(`   ${f.type === 'dir' ? '[D]' : '   '} ${f.name}`)

  console.log(`\n${deplacements} déplacement(s) de trimestre · ${pieces} pièces concernées · ${aCreer} dossier(s) à créer`)
  if (!ECRIRE) {
    console.log('Rien n\'a été touché. Relance avec --ecrire pour appliquer.')
  } else {
    console.log(`Journal : ${JOURNAL}`)
    console.log('Les dossiers d\'année d\'origine restent en place, VIDES : c\'est ce qui garde l\'annulation possible.')
  }
}

main().catch(e => { console.error('✗', e.message); process.exit(1) })
