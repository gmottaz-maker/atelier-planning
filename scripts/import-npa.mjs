// Remplit contacts.zip depuis l'export Odoo (/tmp/odoo-export.json).
// Correspondance par e-mail, sinon par nom (gère « SOCIÉTÉ, Personne »).
// Prérequis : colonne contacts.zip (schema-contacts-zip.sql).
//
//   node --env-file=.env.local scripts/import-npa.mjs           → propose (aucune écriture)
//   node --env-file=.env.local scripts/import-npa.mjs --apply   → écrit les NPA en base

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const APPLY = process.argv.includes('--apply')
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
const EXPORT = '/tmp/odoo-export.json'

if (!existsSync(EXPORT)) { console.error('❌ /tmp/odoo-export.json manquant (relance l’extraction du xlsx).'); process.exit(1) }
const rows = JSON.parse(readFileSync(EXPORT, 'utf8')).filter(r => r.zip)

const byEmail = new Map(), byName = new Map()
for (const r of rows) {
  if (r.email) byEmail.set(String(r.email).toLowerCase().trim(), r)
  if (r.name) {
    byName.set(norm(r.name), r)
    const parts = r.name.split(',')            // « SOCIÉTÉ, Personne » → indexe aussi la personne
    if (parts.length > 1) byName.set(norm(parts.slice(1).join(' ')), r)
  }
}

const { data: contacts, error } = await sb.from('contacts').select('id, name, email, city').order('name')
if (error) { console.error(error.message); process.exit(1) }

const matches = []
for (const c of contacts) {
  const r = (c.email && byEmail.get(String(c.email).toLowerCase().trim())) || byName.get(norm(c.name))
  if (r?.zip) matches.push({ id: c.id, name: c.name, city: c.city, zip: r.zip, via: (c.email && byEmail.get(String(c.email).toLowerCase().trim())) ? 'email' : 'nom' })
}

console.log(`Export : ${rows.length} contacts avec NPA`)
console.log(`Base   : ${contacts.length} contacts`)
console.log(`✅ Correspondances à remplir : ${matches.length}  (email=${matches.filter(m => m.via === 'email').length}, nom=${matches.filter(m => m.via === 'nom').length})`)
console.log('\n— Aperçu —')
for (const m of matches.slice(0, 30)) console.log(`  ${(m.name || '').slice(0, 28).padEnd(28)} → ${m.zip} ${m.city || ''}  [${m.via}]`)

if (!APPLY) {
  console.log(`\n🔒 Dry-run — rien écrit. Applique avec --apply.`)
  process.exit(0)
}
let ok = 0
for (const m of matches) {
  const { error } = await sb.from('contacts').update({ zip: m.zip, updated_at: new Date().toISOString() }).eq('id', m.id)
  if (error) console.error(`  ❌ ${m.name}: ${error.message}`); else ok++
}
console.log(`\n💾 ${ok}/${matches.length} contacts mis à jour.`)
