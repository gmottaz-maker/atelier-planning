import { getSupabaseServer } from '../../../lib/supabase-server'
import { requireAdmin } from '../../../lib/requireAdmin'
import { nextInvoiceNumber, qrReference } from '../../../lib/invoiceNumber'

const supabase = getSupabaseServer()

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return
  if (req.method === 'GET') {
    const { status, year } = req.query
    let q = supabase.from('customer_invoices').select('*, projects(name, client)').order('issue_date', { ascending: false })
    if (status) q = q.eq('status', status)
    if (year) q = q.gte('issue_date', `${year}-01-01`).lte('issue_date', `${year}-12-31`)
    const { data, error } = await q
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  if (req.method === 'POST') {
    const {
      project_id, client_name, client_address, amount, amount_net, vat_rate, vat_amount,
      currency, issue_date, due_date, iban_recipient, quote_snapshot, notes,
      detail_level, status, object,
    } = req.body

    if (!client_name || amount == null) return res.status(400).json({ error: 'client_name et amount requis' })
    const amountNum = parseFloat(amount)
    if (!Number.isFinite(amountNum) || amountNum < 0) {
      return res.status(400).json({ error: 'Montant invalide' })
    }

    const year = (issue_date || new Date().toISOString().slice(0, 10)).slice(0, 4)

    // Deux tentatives : si un POST concurrent a pris le même numéro
    // (violation UNIQUE 23505), on recalcule et on réessaie une fois.
    let data = null
    let error = null
    for (let attempt = 0; attempt < 2; attempt++) {
      const invoice_number = await nextInvoiceNumber(supabase, year)
      const qr_reference = qrReference(invoice_number, project_id)

      ;({ data, error } = await supabase.from('customer_invoices').insert({
        project_id: project_id || null,
        invoice_number,
        client_name,
        client_address,
        amount: amountNum,
        amount_net: amount_net != null && amount_net !== '' ? parseFloat(amount_net) : null,
        vat_rate:   vat_rate   != null && vat_rate   !== '' ? parseFloat(vat_rate)   : null,
        vat_amount: vat_amount != null && vat_amount !== '' ? parseFloat(vat_amount) : null,
        currency: currency || 'CHF',
        issue_date: issue_date || new Date().toISOString().slice(0, 10),
        due_date: due_date || null,
        iban_recipient: iban_recipient || process.env.AMAZING_LAB_IBAN || null,
        qr_reference,
        quote_snapshot: quote_snapshot || null,
        detail_level: detail_level === 'summary' ? 'summary' : 'detailed',
        status: status || 'created',
        notes,
        object: object || null,
      }).select().single())

      if (!error || error.code !== '23505') break
    }

    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  }

  return res.status(405).end()
}
