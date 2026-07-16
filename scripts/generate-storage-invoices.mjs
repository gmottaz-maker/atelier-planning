// Génère les factures de stockage d'un trimestre.
//   node --env-file=.env.local scripts/generate-storage-invoices.mjs 2026 2         (dry-run)
//   node --env-file=.env.local scripts/generate-storage-invoices.mjs 2026 2 --apply
import { createClient } from '@supabase/supabase-js'
import { buildStorageInvoices, quarterLabel } from '../lib/storageInvoice.js'
import { nextInvoiceNumber, qrReference } from '../lib/invoiceNumber.js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} })
const year = parseInt(process.argv[2],10), q = parseInt(process.argv[3],10)
const APPLY = process.argv.includes('--apply')
const addDays = (d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x.toISOString().slice(0,10)}
const fmt = n => new Intl.NumberFormat('fr-CH',{minimumFractionDigits:2}).format(n)

const { data: groups } = await sb.from('storage_groups').select('*')
const payloads = buildStorageInvoices(groups, year, q)
const object = `Stockage — ${quarterLabel(year,q)}`
const { data: existing } = await sb.from('customer_invoices').select('client_name').eq('object', object)
const done = new Set((existing||[]).map(x=>x.client_name))

console.log(`\n${object} — ${payloads.length} client(s) facturable(s):`)
for (const p of payloads) console.log(`  ${p.client.padEnd(16)} net ${fmt(p.amount_net)}  TTC ${fmt(p.amount)}  ${done.has(p.client)?'(déjà facturé, ignoré)':''}`)

if (!APPLY) { console.log('\n🔒 Dry-run. Ajoute --apply pour créer.'); process.exit(0) }
let n=0
for (const p of payloads) {
  if (done.has(p.client)) continue
  const invoice_number = await nextInvoiceNumber(sb, year)
  const { data, error } = await sb.from('customer_invoices').insert({
    project_id:null, invoice_number, client_name:p.client, object:p.object,
    amount:p.amount, amount_net:p.amount_net, vat_rate:p.vat_rate, vat_amount:p.vat_amount,
    currency:'CHF', issue_date:p.issue_date, due_date:addDays(p.issue_date,30),
    qr_reference:qrReference(invoice_number,''), quote_snapshot:p.quote_snapshot,
    detail_level:'detailed', status:'created',
  }).select('invoice_number, client_name, amount').single()
  if (error) { console.error('  ❌', p.client, error.message); process.exit(1) }
  console.log(`  ✅ ${data.invoice_number}  ${data.client_name}  ${fmt(data.amount)} CHF`); n++
}
console.log(`\n💾 ${n} facture(s) créée(s).`)
