// Création des factures de stockage d'un trimestre (idempotent).
import { buildStorageInvoices, quarterLabel } from './storageInvoice'
import { nextInvoiceNumber, qrReference } from './invoiceNumber'

const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10) }

export async function createStorageInvoices(supabase, year, quarter, { dry } = {}) {
  const { data: groups, error } = await supabase.from('storage_groups').select('*')
  if (error) throw new Error(error.message)

  const payloads = buildStorageInvoices(groups, year, quarter)
  const object = `Stockage — ${quarterLabel(year, quarter)}`
  const { data: existing } = await supabase.from('customer_invoices').select('client_name').eq('object', object)
  const done = new Set((existing || []).map(x => x.client_name))

  const created = [], skipped = []
  for (const p of payloads) {
    if (done.has(p.client)) { skipped.push(p.client); continue }
    if (dry) { created.push({ client: p.client, amount: p.amount, object: p.object }); continue }
    const invoice_number = await nextInvoiceNumber(supabase, year)
    const { data, error: e } = await supabase.from('customer_invoices').insert({
      project_id: null,
      invoice_number,
      client_name: p.client,
      object: p.object,
      amount: p.amount, amount_net: p.amount_net, vat_rate: p.vat_rate, vat_amount: p.vat_amount,
      currency: 'CHF',
      issue_date: p.issue_date,
      due_date: addDays(p.issue_date, 30),
      qr_reference: qrReference(invoice_number, ''),
      quote_snapshot: p.quote_snapshot,
      detail_level: 'detailed',
      status: 'created',
      iban_recipient: process.env.AMAZING_LAB_IBAN || null,
    }).select('invoice_number, client_name, amount').single()
    if (e) throw new Error(`${p.client} : ${e.message}`)
    created.push(data)
  }
  return { object, created, skipped }
}

// Si `date` est le dernier jour d'un trimestre, renvoie { year, quarter }, sinon null.
export function quarterEndOf(date) {
  const y = date.getUTCFullYear(), m = date.getUTCMonth() + 1, d = date.getUTCDate()
  const ends = { 3: 31, 6: 30, 9: 30, 12: 31 }
  return ends[m] === d ? { year: y, quarter: m / 3 } : null
}
