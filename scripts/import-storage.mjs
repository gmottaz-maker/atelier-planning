// Importe le stockage depuis /tmp/storage-data.json (extrait de database.numbers).
// Prérequis : schema-storage.sql exécuté.
//   node --env-file=.env.local scripts/import-storage.mjs            (dry-run)
//   node --env-file=.env.local scripts/import-storage.mjs --apply

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const APPLY = process.argv.includes('--apply')
const SRC = '/tmp/storage-data.json'
if (!existsSync(SRC)) { console.error('❌ /tmp/storage-data.json manquant.'); process.exit(1) }
const { groups, items } = JSON.parse(readFileSync(SRC, 'utf8'))

const gRows = groups.map(g => ({ client: g.client, brand: g.brand, pallets: g.pallets ?? 0 }))
const iRows = items.map(i => ({
  client: i.client, brand: i.brand || null, name: i.name || '(sans nom)',
  quantity: i.quantity ?? null, dim_l: i.dim_l ?? null, dim_w: i.dim_w ?? null, dim_h: i.dim_h ?? null,
  notes: i.notes || null,
}))

console.log(`Groupes de facturation : ${gRows.length}`)
console.log(`Articles inventaire    : ${iRows.length}`)

if (!APPLY) { console.log('\n🔒 Dry-run — rien écrit. Applique avec --apply.'); process.exit(0) }

const { count: gc } = await sb.from('storage_groups').select('*', { count: 'exact', head: true })
const { count: ic } = await sb.from('storage_items').select('*', { count: 'exact', head: true })
if (gc > 0 || ic > 0) { console.error(`❌ Tables non vides (groups=${gc}, items=${ic}). Import annulé pour éviter les doublons.`); process.exit(1) }

const { error: e1 } = await sb.from('storage_groups').insert(gRows)
if (e1) { console.error('groups:', e1.message); process.exit(1) }
const { error: e2 } = await sb.from('storage_items').insert(iRows)
if (e2) { console.error('items:', e2.message); process.exit(1) }
console.log(`\n💾 Importé : ${gRows.length} groupes, ${iRows.length} articles.`)
