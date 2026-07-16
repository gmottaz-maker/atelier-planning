// Génère les factures de stockage d'un trimestre (une par client), déposées
// dans customer_invoices (statut « Créée », échéance +30j). Idempotent : ne
// recrée pas une facture déjà émise pour le même client + trimestre.
import { getSupabaseServer } from '../../../lib/supabase-server'
import { requireAdmin } from '../../../lib/requireAdmin'
import { nextInvoiceNumber, qrReference } from '../../../lib/invoiceNumber'
import { buildStorageInvoices, quarterLabel } from '../../../lib/storageInvoice'

const supabase = getSupabaseServer()
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10) }

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const year = parseInt(req.body?.year, 10)
  const q = parseInt(req.body?.quarter, 10)
  const dry = !!req.body?.dry
  if (!year || ![1, 2, 3, 4].includes(q)) return res.status(400).json({ error: 'year et quarter (1-4) requis' })

  const { data: groups, error } = await supabase.from('storage_groups').select('*')
  if (error) return res.status(500).json({ error: error.message })

  const payloads = buildStorageInvoices(groups, year, q)
  const object = `Stockage — ${quarterLabel(year, q)}`

  // Factures déjà émises pour ce trimestre
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
    if (e) return res.status(500).json({ error: `${p.client} : ${e.message}`, created })
    created.push(data)
  }

  return res.status(200).json({ object, created, skipped })
}
