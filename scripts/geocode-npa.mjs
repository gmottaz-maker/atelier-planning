// Remplit contacts.zip (NPA) en géocodant les adresses via Nominatim (OpenStreetMap).
// Envoie UNIQUEMENT « rue + ville + pays » à OSM (jamais le nom/e-mail du contact).
//
// Prérequis : colonne contacts.zip créée (schema-contacts-zip.sql).
//
// Usage :
//   node --env-file=.env.local scripts/geocode-npa.mjs            → propose (aucune écriture)
//        → écrit /tmp/npa-proposal.csv (à ouvrir/vérifier) + /tmp/npa-proposal.json
//   node --env-file=.env.local scripts/geocode-npa.mjs --apply    → écrit les NPA « ok » en base
//   node --env-file=.env.local scripts/geocode-npa.mjs --apply --include-verifier
//        → écrit aussi les cas « à vérifier » (ville divergente)

import { createClient } from '@supabase/supabase-js'
import { writeFileSync, readFileSync, existsSync } from 'fs'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
const UA = 'atelier-planning-npa/1.0 (hello@amazinglab.ch)'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const PROPOSAL = '/tmp/npa-proposal.json'
const APPLY = process.argv.includes('--apply')
const INCLUDE_VERIFIER = process.argv.includes('--include-verifier')

// ── Mode --apply : relit la proposition et écrit en base ──
if (APPLY) {
  if (!existsSync(PROPOSAL)) { console.error('❌ Lance d’abord le script sans --apply pour générer la proposition.'); process.exit(1) }
  const rows = JSON.parse(readFileSync(PROPOSAL, 'utf8'))
  const toWrite = rows.filter(r => r.zip && (r.conf === 'ok' || (INCLUDE_VERIFIER && r.conf === 'VERIFIER')))
  console.log(`Écriture de ${toWrite.length} NPA…`)
  let ok = 0
  for (const r of toWrite) {
    const { error } = await sb.from('contacts').update({ zip: r.zip, updated_at: new Date().toISOString() }).eq('id', r.id)
    if (error) console.error(`  ❌ ${r.name}: ${error.message}`)
    else ok++
  }
  console.log(`💾 ${ok}/${toWrite.length} contacts mis à jour.`)
  process.exit(0)
}

// ── Mode proposition (défaut) : géocode, n’écrit rien en base ──
const { data: contacts, error } = await sb.from('contacts').select('id, name, street, city, zip, country').order('name')
if (error) { console.error(error.message); process.exit(1) }
const todo = contacts.filter(c => (c.city || '').trim() && !(c.zip && String(c.zip).trim()))
console.log(`Contacts à géocoder (ville présente, zip vide) : ${todo.length}`)

async function geo(street, city) {
  const p = new URLSearchParams({ city, country: 'Switzerland', format: 'json', addressdetails: '1', limit: '1' })
  if (street) p.set('street', street)
  const r = await fetch(`https://nominatim.openstreetmap.org/search?${p}`, { headers: { 'User-Agent': UA } })
  if (!r.ok) return null
  const d = await r.json()
  if (!d.length) return null
  const a = d[0].address || {}
  return { zip: a.postcode || null, town: a.city || a.town || a.village || a.municipality || '' }
}

const results = []
let i = 0
for (const c of todo) {
  i++
  let g = await geo(c.street, c.city); await sleep(1100)
  if (!g?.zip && c.street) { g = await geo('', c.city); await sleep(1100) }
  const townOk = g?.town ? (norm(g.town).includes(norm(c.city)) || norm(c.city).includes(norm(g.town))) : false
  const conf = !g?.zip ? 'AUCUN' : townOk ? 'ok' : 'VERIFIER'
  results.push({ id: c.id, name: c.name, street: c.street || '', city: c.city, zip: g?.zip || '', town: g?.town || '', conf })
  if (i % 20 === 0) console.error(`… ${i}/${todo.length}`)
}

const by = k => results.filter(r => r.conf === k)
console.log(`\n✅ NPA trouvé (ville concordante) : ${by('ok').length}`)
console.log(`⚠️  À vérifier (ville divergente)  : ${by('VERIFIER').length}`)
console.log(`❌ Aucun résultat                 : ${by('AUCUN').length}`)

const esc = v => /[",\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? '')
const cols = ['id', 'name', 'street', 'city', 'zip', 'town', 'conf']
writeFileSync('/tmp/npa-proposal.csv', [cols.join(','), ...results.map(r => cols.map(k => esc(r[k])).join(','))].join('\n'))
writeFileSync(PROPOSAL, JSON.stringify(results))
console.log('\n📄 Proposition : /tmp/npa-proposal.csv (ouvre-la pour vérifier)')
console.log('   Puis applique :  node --env-file=.env.local scripts/geocode-npa.mjs --apply')
