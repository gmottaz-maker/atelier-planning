#!/usr/bin/env node
// Repointer vers l'exemplaire CONSERVÉ les pièces dont Maze référence un
// doublon parqué.
//
//   node scripts/repointer-doublons.mjs            → RAPPORT seulement
//   node scripts/repointer-doublons.mjs --ecrire   → met à jour kdrive_file_id
//
// ── Pourquoi ──────────────────────────────────────────────────────────────
//
// Le reclassement d'octobre 2026 a dédoublonné à la main : quand la même pièce
// avait été déposée deux fois — une fois en facture fournisseur, une fois en
// justificatif, avec deux scans différents — un exemplaire a été gardé, renommé
// au format des consignes, et l'autre rangé dans `_Gestion/Doublons/`.
//
// Mais c'est l'exemplaire PARQUÉ que la base référence. Résultat : dix-sept
// pièces s'ouvraient encore depuis Maze, mais sur un fichier rangé dans une
// corbeille — et le jour où elle se vide, ces pièces deviennent inatteignables.
// Tout doit rester accessible depuis Maze.
//
// ── L'appariement se fait sur des PREUVES, jamais sur une ressemblance ────
//
// Le nom conservé suit `AAAA-MM-JJ_FOURNISSEUR-description_montant.pdf` : il ne
// ressemble donc pas au nom parqué, qui n'avait pas de description. On apparie
// sur ce qui est vérifiable :
//
//   — la DATE du document, identique de part et d'autre (préfixe du nom) ;
//   — le MONTANT, ou le NUMÉRO DE FACTURE, retrouvé dans le nom conservé ;
//   — à défaut, le début du nom de fournisseur, et seulement en appui.
//
// Un rapprochement sans montant ni numéro n'est PAS appliqué : il est listé
// pour décision humaine. Deux candidats à égalité non plus. Repointer une
// dépense sur la facture d'un autre achat du même jour serait pire que de la
// laisser dans la corbeille.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

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
const ADMIN_ID = 53682
const BASE = `https://api.infomaniak.com/2/drive/${E.KDRIVE_DRIVE_ID}`
const H = { Authorization: `Bearer ${E.KDRIVE_TOKEN}` }

const kf = async (p) => (await (await fetch(`${BASE}${p}`, { headers: H })).json())
const ls = async (id) => (await kf(`/files/${id}/files?per_page=500`)).data || []
const sansAccent = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const enfant = async (p, n) => (await ls(p)).find(f => sansAccent(f.name) === sansAccent(n))

const slug = (s, max = 40) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
  .replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '')

const dateDe = (nom) => (/^(\d{4}-\d{2}-\d{2})/.exec(nom || '') || [])[1] || null
// Le fournisseur : ce qui suit la date, jusqu'au montant ou à la description.
const fournisseurDe = (nom) => {
  const m = /^\d{4}-\d{2}-\d{2}_([A-Z0-9-]+)/i.exec(nom || '')
  return m ? m[1].toUpperCase().replace(/-+$/, '') : ''
}
const prefixeCommun = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i }

async function main() {
  const sb = createClient(E.NEXT_PUBLIC_SUPABASE_URL, E.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

  // L'inventaire de la branche classée, toutes années.
  const finances = await enfant(ADMIN_ID, 'Finances')
  const compta = finances && await enfant(finances.id, 'Comptabilité')
  if (!compta) throw new Error('00. Admin / Finances / Comptabilité introuvable')
  const classees = []
  for (const an of await ls(compta.id)) {
    if (an.type !== 'dir') continue
    const br = await enfant(an.id, 'Justificatifs comptables')
    if (!br) continue
    for (const t of await ls(br.id)) {
      if (t.type !== 'dir') continue
      for (const f of await ls(t.id)) if (f.type !== 'dir') classees.push({ ...f, chemin: `${an.name}/${t.name}` })
    }
  }
  console.log(`Branche classée : ${classees.length} fichiers.\n`)

  // Les corbeilles à doublons, énumérées UNE fois. Interroger le drive pour
  // chacune des 265 lignes de la base demandait huit cents appels et une
  // poignée de minutes ; le parcours inverse en demande cinq.
  const gestion = await enfant(ADMIN_ID, '_Gestion')
  const parques = new Map()
  async function ramasser(id, chemin) {
    for (const f of await ls(id)) {
      if (f.type === 'dir') await ramasser(f.id, `${chemin}/${f.name}`)
      else parques.set(f.id, { ...f, chemin })
    }
  }
  if (gestion) {
    for (const d of await ls(gestion.id)) {
      if (d.type === 'dir' && /doublon/i.test(d.name)) await ramasser(d.id, d.name)
    }
  }
  console.log(`Corbeilles à doublons : ${parques.size} fichiers.\n`)

  const propositions = [], douteux = []
  for (const [table, champDate, champNum] of [['expenses', 'date', null], ['supplier_invoices', 'issue_date', 'invoice_number']]) {
    const cols = ['id', champDate, 'amount', 'kdrive_file_id', 'kdrive_filename', champNum].filter(Boolean).join(', ')
    const r = await sb.from(table).select(cols).not('kdrive_file_id', 'is', null)
    if (r.error) throw new Error(`${table}: ${r.error.message}`)

    for (const x of r.data) {
      const parque = parques.get(Number(x.kdrive_file_id))
      if (!parque) continue
      const nomParque = parque.name
      const date = dateDe(nomParque) || x[champDate]
      const montant = Number.isFinite(parseFloat(x.amount)) ? parseFloat(x.amount).toFixed(2) : null
      const num = champNum ? slug(x[champNum], 30) : null
      const fourn = fournisseurDe(nomParque)

      const notes = []
      let meilleur = null, meilleurScore = 0, exAequo = false
      for (const c of classees.filter(c => dateDe(c.name) === date)) {
        const haut = c.name.toUpperCase()
        let score = 0, preuves = []
        if (montant && haut.includes(montant)) { score += 3; preuves.push(`montant ${montant}`) }
        if (num && haut.includes(num)) { score += 3; preuves.push(`n° ${num}`) }
        const pc = prefixeCommun(fourn, fournisseurDe(c.name))
        if (pc >= 5) { score += 2; preuves.push(`fournisseur (${pc} car.)`) }
        if (score === 0) continue
        if (score > meilleurScore) { meilleur = { c, preuves }; meilleurScore = score; exAequo = false }
        else if (score === meilleurScore) exAequo = true
      }

      const ligne = { table, id: x.id, nomParque, date, cible: meilleur?.c, preuves: meilleur?.preuves || [], score: meilleurScore }
      // Un rapprochement appuyé SEULEMENT sur le nom du fournisseur ne suffit
      // pas : deux achats du même jour chez le même marchand existent.
      if (!meilleur || exAequo || meilleurScore < 3) douteux.push({ ...ligne, raison: !meilleur ? 'aucun candidat' : exAequo ? 'deux candidats à égalité' : 'ni montant ni numéro retrouvé' })
      else propositions.push(ligne)
    }
  }

  console.log(`${propositions.length} repointage(s) sûr(s) :`)
  for (const p of propositions) {
    console.log(`  ${p.table.slice(0, 4)}#${String(p.id).padEnd(4)} ${p.nomParque.slice(0, 44).padEnd(46)}`)
    console.log(`      → ${p.cible.chemin}/${p.cible.name}`)
    console.log(`        preuves : ${p.preuves.join(', ')}`)
  }
  if (douteux.length) {
    console.log(`\n${douteux.length} cas LAISSÉ(S) EN PLACE, à trancher à la main :`)
    for (const d of douteux) {
      console.log(`  ${d.table.slice(0, 4)}#${String(d.id).padEnd(4)} ${d.nomParque.slice(0, 44).padEnd(46)} ${d.raison}`)
      if (d.cible) console.log(`      candidat écarté : ${d.cible.chemin}/${d.cible.name} (${d.preuves.join(', ')})`)
    }
  }

  if (!ECRIRE) {
    console.log('\nRien n\'a été touché. Relance avec --ecrire pour appliquer.')
    return
  }
  let faits = 0
  for (const p of propositions) {
    const maj = await sb.from(p.table)
      .update({ kdrive_file_id: p.cible.id, kdrive_filename: p.cible.name }).eq('id', p.id)
    if (maj.error) { console.log(`  ✗ ${p.table}#${p.id} : ${maj.error.message}`); continue }
    faits++
  }
  console.log(`\n${faits} pièce(s) repointée(s) sur l'exemplaire conservé.`)
  console.log('Les fichiers parqués ne sont pas touchés : plus rien ne les référence.')
}

main().catch(e => { console.error('✗', e.message); process.exit(1) })
