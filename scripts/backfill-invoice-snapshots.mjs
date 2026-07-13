// Re-fige le quote_snapshot des factures existantes depuis le devis groupé de
// leur projet, pour que le PDF affiche le découpage par item (au lieu d'un
// « Général » unique issu de l'ancien snapshot à plat).
//
// Sécurité : ne réécrit une facture QUE si le total HT recalculé depuis le
// projet correspond (≤ 0,05 CHF) au montant HT stocké. Les factures éditées à
// la main, ou dont le total diverge (ancien calcul de marge logistique), sont
// listées et laissées intactes.
//
// Usage :
//   node --env-file=.env.local scripts/backfill-invoice-snapshots.mjs          (dry-run)
//   node --env-file=.env.local scripts/backfill-invoice-snapshots.mjs --apply  (écrit)

import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant (charge .env.local avec --env-file).')
  process.exit(1)
}
const APPLY = process.argv.includes('--apply')
const sb = createClient(URL, KEY, { auth: { persistSession: false } })

const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n }
const isGrouped = q => !!q && (Array.isArray(q.items) || Array.isArray(q.management))
const effMargin = (r, gm) => (r?.margin !== '' && r?.margin != null) ? num(r.margin) : num(gm)
const marginLog = r => (r?.margin !== '' && r?.margin != null) ? num(r.margin) : 0

// Total HT — identique à buildQuoteSections (lib/devisHtml.js) :
// management & labor sans marge, achats & sous-traitance à la marge (ligne
// sinon générale), logistique à la marge de ligne sinon 0.
function groupedNet(q) {
  const gm = q.general_margin ?? ''
  const mgmt = (q.management || []).reduce((s, r) => s + num(r.rate) * num(r.quantity), 0)
  const items = (q.items || []).reduce((s, it) =>
    s + (it.purchases || []).reduce((a, r) => a + num(r.unit_price) * num(r.quantity) * (1 + effMargin(r, gm) / 100), 0)
      + (it.labor || []).reduce((a, r) => a + num(r.rate) * num(r.quantity), 0), 0)
  const sub = (q.subcontracting || []).reduce((s, r) => s + num(r.rate) * num(r.quantity) * (1 + effMargin(r, gm) / 100), 0)
  const log = (q.logistics || []).reduce((s, r) => s + num(r.rate) * num(r.quantity) * (1 + marginLog(r) / 100), 0)
  return mgmt + items + sub + log
}

function storedNet(inv) {
  if (inv.amount_net != null) return num(inv.amount_net)
  const gross = num(inv.amount)
  const v = num(inv.vat_rate)
  return v > 0 ? gross / (1 + v / 100) : gross
}

const { data: invoices, error: e1 } = await sb
  .from('customer_invoices')
  .select('id, invoice_number, project_id, quote_snapshot, amount, amount_net, vat_rate')
  .order('invoice_number')
if (e1) { console.error('❌ lecture factures :', e1.message); process.exit(1) }

const { data: projects, error: e2 } = await sb.from('projects').select('id, quote_data')
if (e2) { console.error('❌ lecture projets :', e2.message); process.exit(1) }
const quoteById = new Map(projects.map(p => [p.id, p.quote_data]))

const toUpdate = []
const skipped = { alreadyGrouped: 0, noProject: 0, projectFlat: 0 }
const mismatches = []

for (const inv of invoices) {
  if (isGrouped(inv.quote_snapshot)) { skipped.alreadyGrouped++; continue }
  if (!inv.project_id) { skipped.noProject++; continue }
  const pq = quoteById.get(inv.project_id)
  if (!isGrouped(pq)) { skipped.projectFlat++; continue }

  const net = groupedNet(pq)
  const sNet = storedNet(inv)
  const diff = Math.abs(net - sNet)
  if (diff <= 0.05) {
    toUpdate.push({ inv, pq, net, sNet })
  } else {
    mismatches.push({ inv, net, sNet, diff })
  }
}

console.log(`\n📄 ${invoices.length} factures examinées`)
console.log(`   déjà groupées         : ${skipped.alreadyGrouped}`)
console.log(`   sans projet lié       : ${skipped.noProject}`)
console.log(`   projet en ancien fmt  : ${skipped.projectFlat}`)
console.log(`   ✅ à re-figer (total OK): ${toUpdate.length}`)
console.log(`   ⚠️  écart de total     : ${mismatches.length}`)

if (mismatches.length) {
  console.log('\n⚠️  Non touchées (le total recalculé diffère — édition manuelle ou ancien calcul de marge) :')
  for (const m of mismatches)
    console.log(`   ${m.inv.invoice_number}  stocké HT ${m.sNet.toFixed(2)}  vs recalc ${m.net.toFixed(2)}  (Δ ${m.diff.toFixed(2)})`)
}

if (toUpdate.length) {
  console.log('\n✅ À re-figer :')
  for (const u of toUpdate) console.log(`   ${u.inv.invoice_number}  HT ${u.net.toFixed(2)}`)
}

if (!APPLY) {
  console.log('\n🔒 Dry-run — rien écrit. Relance avec --apply pour appliquer.')
  process.exit(0)
}

let ok = 0
for (const u of toUpdate) {
  const { error } = await sb
    .from('customer_invoices')
    .update({ quote_snapshot: u.pq })
    .eq('id', u.inv.id)
  if (error) console.error(`   ❌ ${u.inv.invoice_number} : ${error.message}`)
  else ok++
}
console.log(`\n💾 ${ok}/${toUpdate.length} factures re-figées.`)
