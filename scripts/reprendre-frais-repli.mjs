#!/usr/bin/env node
// Remonter dans kDrive les justificatifs tombés dans le repli Supabase.
//
//   node scripts/reprendre-frais-repli.mjs            → RAPPORT seulement
//   node scripts/reprendre-frais-repli.mjs --ecrire   → dépose et met la base à jour
//
// ── Pourquoi ce script existe ──────────────────────────────────────────────
//
// `/api/expenses` dépose sur kDrive et, SI ça échoue, retombe sur le bucket
// Supabase `receipts` pour ne jamais perdre une pièce. Le repli a fonctionné —
// et c'est bien le problème : il a fonctionné en silence.
//
// Le 5 octobre 2026, les dossiers visés par les ids en dur ont été supprimés
// pendant que la correction qui les remplace dormait encore en local, non
// déployée. La production a donc continué de viser des dossiers à la
// corbeille, a échoué à chaque dépôt, et a tout rangé dans le repli sans que
// rien ne remonte à l'écran. Trente justificatifs du 16 octobre.
//
// Ce script les reprend un par un : il télécharge depuis le bucket, dépose au
// bon endroit avec le nommage normal (`receiptFilename`, `quarterOf`), puis
// inscrit `kdrive_file_id` en base.
//
// ── Ce qu'il ne fait pas ───────────────────────────────────────────────────
//
// Il n'EFFACE PAS la copie du bucket. Tant que personne n'a vérifié les pièces
// dans la comptabilité, le repli reste le filet. Le vider est un geste séparé.
//
// IDEMPOTENT : il ne prend que les frais ayant un `receipt_path` et PAS de
// `kdrive_file_id`. Rejoué, il ne trouve plus rien.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { receiptFilename, quarterOf } from '../lib/receiptFile.js'

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

async function kf(chemin, init = {}) {
  const r = await fetch(`${BASE}${chemin}`, { ...init, headers: { ...H, ...(init.headers || {}) } })
  const d = await r.json()
  if (d.result !== 'success') throw new Error(d.error?.description || JSON.stringify(d.error))
  return d.data
}
const lister = id => kf(`/files/${id}/files?per_page=200`)
const sansAccent = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const enfant = async (p, n) => (await lister(p)).find(f => sansAccent(f.name) === sansAccent(n)) || null
async function exige(parent, nom, chemin) {
  const t = await enfant(parent, nom)
  if (!t || t.type !== 'dir') throw new Error(`« ${chemin} » introuvable — renommé ou déplacé ?`)
  return t
}
async function creer(parent, nom) {
  const t = await enfant(parent, nom)
  if (t && t.type === 'dir') return t
  if (!ECRIRE) return { id: '(à créer)', name: nom, _virtuel: true }
  return kf(`/files/${parent}/directory`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: nom }),
  })
}
// Même chemin que `lib/kdrive.js` : structure exigée, classement créé.
async function dossier(annee, trimestre) {
  const finances = await exige(ADMIN_ID, 'Finances', '00. Admin / Finances')
  const compta   = await exige(finances.id, 'Comptabilité', '00. Admin / Finances / Comptabilité')
  const an  = await creer(compta.id, `Comptabilité ${annee}`)
  if (an._virtuel) return an
  const rub = await creer(an.id, 'Justificatifs')
  if (rub._virtuel) return rub
  return creer(rub.id, `T${trimestre}`)
}

async function main() {
  const sb = createClient(E.NEXT_PUBLIC_SUPABASE_URL, E.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const { data, error } = await sb.from('expenses')
    .select('id, user_name, date, merchant, amount, receipt_path, kdrive_file_id')
    .is('kdrive_file_id', null).not('receipt_path', 'is', null).order('date')
  if (error) throw new Error(error.message)
  console.log(`${data.length} justificatif(s) dans le repli, sans fichier kDrive.\n`)
  if (!data.length) return

  let faits = 0, rates = []
  for (const f of data) {
    const { year, quarter } = quarterOf(f.date)
    const nom = receiptFilename({ merchant: f.merchant, amount: f.amount, date: f.date }, f.receipt_path, 'application/pdf')
    const cible = await dossier(year, quarter)
    console.log(`  ${f.date} · ${String(f.merchant || '?').slice(0, 26).padEnd(26)} → Comptabilité ${year} / Justificatifs / T${quarter} / ${nom}`)
    if (!ECRIRE) continue

    try {
      const dl = await sb.storage.from('receipts').download(f.receipt_path)
      if (dl.error) throw new Error(`bucket : ${dl.error.message}`)
      const buffer = Buffer.from(await dl.data.arrayBuffer())

      const up = await fetch(
        `https://api.infomaniak.com/3/drive/${E.KDRIVE_DRIVE_ID}/upload` +
        `?directory_id=${cible.id}&file_name=${encodeURIComponent(nom)}&total_size=${buffer.length}&conflict=rename`,
        { method: 'POST', headers: { ...H, 'Content-Type': 'application/octet-stream' }, body: buffer })
      const uj = await up.json()
      if (uj.result !== 'success') throw new Error(`kDrive : ${uj.error?.description || 'dépôt refusé'}`)

      // La copie du bucket RESTE : tant que personne n'a vérifié, le repli est
      // le filet. On note seulement où la pièce vit désormais.
      const maj = await sb.from('expenses')
        .update({ kdrive_file_id: uj.data.id, kdrive_filename: uj.data.name }).eq('id', f.id)
      if (maj.error) throw new Error(`base : ${maj.error.message}`)
      faits++
    } catch (e) {
      rates.push(`#${f.id} ${f.merchant} : ${e.message}`)
    }
  }

  if (!ECRIRE) {
    console.log(`\n${data.length} reprise(s) en attente. Rien n'a été touché.`)
    console.log('Relance avec --ecrire pour appliquer.')
    return
  }
  console.log(`\n${faits} justificatif(s) remontés dans la comptabilité.`)
  if (rates.length) {
    console.log(`${rates.length} échec(s) :`)
    for (const r of rates) console.log('   ', r)
  }
  console.log('Les copies du bucket « receipts » sont CONSERVÉES — les vider est un geste séparé.')
}

main().catch(e => { console.error('✗', e.message); process.exit(1) })
