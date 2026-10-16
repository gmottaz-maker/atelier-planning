#!/usr/bin/env node
// Ranger les scans de Maze dans la comptabilité de l'année.
//
//   node scripts/ranger-finance.mjs            → RAPPORT seulement, rien n'est touché
//   node scripts/ranger-finance.mjs --ecrire   → déplace, et tient un journal
//
// ── Ce qu'il répare ────────────────────────────────────────────────────────
//
// `lib/kdrive.js` visait deux dossiers par IDENTIFIANT EN DUR (37796, 37797).
// Ces ids appartenaient à l'ancien « 00. Admin », renommé « 20. Admin Backup »
// quand sa copie réorganisée a pris sa place. Le code a donc continué d'écrire
// dans le backup pendant que l'équipe travaillait dans l'autre arbre — sans
// qu'aucune erreur ne le signale, puisque l'id existait toujours.
//
// Résultat au 5 octobre 2026 : 234 pièces dans le backup (celles que la base
// référence) et 234 copies homonymes dans « 00. Admin / Claude Finance », que
// rien ne référence.
//
// ── Ce qu'il fait ──────────────────────────────────────────────────────────
//
// 1. Les ORIGINAUX (ceux que la base connaît) vont dans
//    « 00. Admin / Finances / Comptabilité / Comptabilité <année> / <Factures
//    fournisseurs | Justificatifs> / T<trimestre> ». L'année vient du chemin
//    d'origine, donc les deux pièces de 2025 se rangent dans 2025.
// 2. Les COPIES sans référence partent dans « 00. Admin / _A supprimer », et
//    PAS à la corbeille : c'est à un humain de vider, après avoir regardé.
//
// Un déplacement kDrive CONSERVE l'identifiant du fichier (vérifié) : les 235
// références de `expenses.kdrive_file_id` et `supplier_invoices.kdrive_file_id`
// continuent donc de fonctionner. C'est toute la raison pour laquelle on
// déplace au lieu de recopier.
//
// ── Ce qu'il refuse de faire ───────────────────────────────────────────────
//
// Écarter une « copie » dont la TAILLE diffère de l'original. Même nom ne veut
// pas dire même fichier, et la version la plus récente peut être celle qu'on
// s'apprêtait à jeter. Ces cas sont listés et laissés en place.
//
// IDEMPOTENT : il relit l'arbre à chaque passage. Ce qui est déjà rangé n'y
// est plus, donc ne se redéplace pas.
import { createClient } from '@supabase/supabase-js'
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

// ── Ancrages ────────────────────────────────────────────────────────────────
// Seuls deux ids en dur, et ce sont des RACINES qui ne bougent pas : tout le
// reste se résout par nom. C'est la leçon de la panne qu'on répare ici.
const ADMIN_ID  = 53682      // amazing files / 00. Admin  (le dossier vivant)
const BACKUP_CF = 22545      // 20. Admin Backup / Claude Finance (à vider)
const SOURCES = [
  { id: 37796, rubrique: 'Factures fournisseurs' },
  { id: 37797, rubrique: 'Justificatifs' },
]

const BASE = `https://api.infomaniak.com/2/drive/${E.KDRIVE_DRIVE_ID}`
const H = { Authorization: `Bearer ${E.KDRIVE_TOKEN}` }

async function kf(chemin, init = {}) {
  const r = await fetch(`${BASE}${chemin}`, { ...init, headers: { ...H, ...(init.headers || {}) } })
  const txt = await r.text()
  let d
  try { d = JSON.parse(txt) } catch { throw new Error(`kDrive: réponse non-JSON (HTTP ${r.status}) ${txt.slice(0, 120)}`) }
  if (d.result !== 'success') throw new Error(`kDrive: ${d.error?.description || JSON.stringify(d.error)}`)
  return d.data
}
const lister = id => kf(`/files/${id}/files?per_page=200`)

const sansAccent = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
async function enfant(parent, nom) {
  const cible = sansAccent(nom)
  const items = await lister(parent)
  return items.find(f => sansAccent(f.name) === cible) || null
}
async function enfantOuCreer(parent, nom) {
  const t = await enfant(parent, nom)
  if (t && t.type === 'dir') return t
  if (!ECRIRE) return { id: `(à créer: ${nom})`, name: nom, _virtuel: true }
  return kf(`/files/${parent}/directory`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: nom }),
  })
}

const JOURNAL = 'journal-ranger-finance.tsv'
function noter(...champs) {
  if (!ECRIRE) return
  appendFileSync(JOURNAL, champs.join('\t') + '\n')
}

async function main() {
  if (!E.KDRIVE_TOKEN || !E.KDRIVE_DRIVE_ID) throw new Error('KDRIVE_TOKEN / KDRIVE_DRIVE_ID manquants')

  // ── Ce que la base référence : c'est ÇA qu'il ne faut pas casser ─────────
  const sb = createClient(E.NEXT_PUBLIC_SUPABASE_URL, E.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const references = new Set()
  for (const table of ['expenses', 'supplier_invoices']) {
    const r = await sb.from(table).select('kdrive_file_id').not('kdrive_file_id', 'is', null)
    if (r.error) throw new Error(`${table}: ${r.error.message}`)
    for (const x of r.data) references.add(Number(x.kdrive_file_id))
  }
  console.log(`Base : ${references.size} fichiers référencés.\n`)

  // ── Inventaire des originaux (arbre backup) ──────────────────────────────
  //
  // Les dossiers source ont vocation à DISPARAÎTRE : une fois la reprise faite,
  // ils ont été vidés puis supprimés. Un script de migration qui plante parce
  // que son travail est terminé est un piège pour le prochain qui le lit.
  const originaux = []
  let sourcesVues = 0
  for (const { id, rubrique } of SOURCES) {
    let annees
    try { annees = await lister(id) } catch { continue }
    sourcesVues++
    for (const an of annees) {
      if (an.type !== 'dir') continue
      for (const tri of await lister(an.id)) {
        if (tri.type !== 'dir') continue
        for (const f of await lister(tri.id)) {
          if (f.type === 'dir') continue
          originaux.push({ ...f, rubrique, annee: an.name, trimestre: tri.name, source: tri.id })
        }
      }
    }
  }
  if (sourcesVues === 0) {
    console.log('Les dossiers source n\'existent plus : la reprise a déjà été faite.')
    console.log('Rien à ranger. (Historique : journal-ranger-finance.tsv)')
    return
  }

  const orphelins = originaux.filter(f => !references.has(f.id))
  console.log(`Originaux à ranger : ${originaux.length}`)
  console.log(`  dont référencés par la base : ${originaux.length - orphelins.length}`)
  console.log(`  dont sans référence (scan déposé hors Maze ?) : ${orphelins.length}`)

  // ── Inventaire des copies (00. Admin / Claude Finance) ───────────────────
  const cfLive = await enfant(ADMIN_ID, 'Claude Finance')
  const copies = []
  if (cfLive) {
    for (const rub of await lister(cfLive.id)) {
      if (rub.type !== 'dir') continue
      for (const an of await lister(rub.id)) {
        if (an.type !== 'dir') continue
        for (const tri of await lister(an.id)) {
          if (tri.type !== 'dir') continue
          for (const f of await lister(tri.id)) {
            if (f.type === 'dir') continue
            copies.push({ ...f, rubrique: rub.name, annee: an.name, trimestre: tri.name, source: tri.id })
          }
        }
      }
    }
  }
  console.log(`Copies dans 00. Admin / Claude Finance : ${copies.length}`)

  // ── Appariement : même rubrique, même année, même trimestre, même nom ────
  const cle = f => `${sansAccent(f.rubrique)}|${f.annee}|${f.trimestre}|${sansAccent(f.name)}`
  const parCle = new Map(originaux.map(f => [cle(f), f]))
  const doublons = [], suspects = [], solitaires = []
  for (const c of copies) {
    const o = parCle.get(cle(c))
    if (!o) { solitaires.push(c); continue }
    // Même nom ne veut pas dire même fichier. La taille est le garde-fou le
    // moins cher, et il suffit à écarter une version différente.
    if (Number(o.size) !== Number(c.size)) { suspects.push({ c, o }); continue }
    doublons.push(c)
  }
  console.log(`  doublons confirmés (nom + taille) : ${doublons.length}`)
  console.log(`  tailles différentes — LAISSÉS EN PLACE : ${suspects.length}`)
  console.log(`  sans original correspondant — LAISSÉS EN PLACE : ${solitaires.length}`)
  for (const { c, o } of suspects) console.log(`    ! ${c.rubrique}/${c.annee}/${c.trimestre}/${c.name} — copie ${c.size} o, original ${o.size} o`)
  for (const c of solitaires) console.log(`    ? ${c.rubrique}/${c.annee}/${c.trimestre}/${c.name}`)

  // ── Destinations ─────────────────────────────────────────────────────────
  // `Finances` et `Comptabilité` doivent EXISTER. Les créer au passage est ce
  // qui a produit la panne d'origine : un dossier de structure recréé à côté
  // de l'original renommé, et les pièces s'empilent dans un arbre fantôme.
  const finances = await enfant(ADMIN_ID, 'Finances')
  if (!finances) throw new Error('00. Admin / Finances introuvable — renommé ou déplacé ?')
  const compta = await enfant(finances.id, 'Comptabilité')
  if (!compta) throw new Error('00. Admin / Finances / Comptabilité introuvable — renommé ou déplacé ?')
  const destinations = new Map()
  for (const f of originaux) {
    const k = `${f.annee}|${f.rubrique}|${f.trimestre}`
    if (destinations.has(k)) continue
    const an  = await enfantOuCreer(compta.id, `Comptabilité ${f.annee}`)
    const rub = an._virtuel ? an : await enfantOuCreer(an.id, f.rubrique)
    const tri = rub._virtuel ? rub : await enfantOuCreer(rub.id, f.trimestre)
    destinations.set(k, tri)
  }
  console.log(`\nDossiers de destination : ${destinations.size}`)
  for (const [k, d] of destinations) console.log(`  ${k.replace(/\|/g, ' / ')} → ${d.id}`)

  if (!ECRIRE) {
    console.log(`\n${originaux.length} déplacement(s) et ${doublons.length} mise(s) à l'écart en attente.`)
    console.log('Rien n\'a été touché. Relance avec --ecrire pour appliquer.')
    return
  }

  // ── Application ──────────────────────────────────────────────────────────
  noter('# horodatage', 'action', 'fichier', 'nom', 'depuis', 'vers')
  const horo = new Date().toISOString()
  let faits = 0
  for (const f of originaux) {
    const dest = destinations.get(`${f.annee}|${f.rubrique}|${f.trimestre}`)
    await kf(`/files/${f.id}/move/${dest.id}`, { method: 'POST' })
    noter(horo, 'ranger', f.id, f.name, f.source, dest.id)
    faits++
    if (faits % 25 === 0) console.log(`  ${faits}/${originaux.length}…`)
  }
  console.log(`${faits} fichier(s) rangé(s).`)

  const poubelle = await enfantOuCreer(ADMIN_ID, '_A supprimer')
  const bac = await enfantOuCreer(poubelle.id, 'Claude Finance (doublons)')
  let ecartes = 0
  for (const c of doublons) {
    await kf(`/files/${c.id}/move/${bac.id}`, { method: 'POST' })
    noter(horo, 'ecarter', c.id, c.name, c.source, bac.id)
    ecartes++
  }
  console.log(`${ecartes} doublon(s) mis à l'écart dans _A supprimer / Claude Finance (doublons).`)
  console.log(`\nJournal : ${JOURNAL}`)
  console.log(`Arbre backup à vider à la main quand tu auras regardé : ${BACKUP_CF}`)
}

main().catch(e => { console.error('✗', e.message); process.exit(1) })
