import { getSupabaseServer } from '../../../lib/supabase-server'
import { requireAdmin } from '../../../lib/requireAdmin'
import { nextInvoiceNumber, qrReference } from '../../../lib/invoiceNumber'
import { validerFacture } from '../../../lib/invoiceCheck'
import { erreurApi } from '../../../lib/apiError'

const supabase = getSupabaseServer()

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return
  if (req.method === 'GET') {
    const { status, year } = req.query
    let q = supabase.from('customer_invoices').select('*, projects(name, client)').order('issue_date', { ascending: false })
    if (status) q = q.eq('status', status)
    if (year) q = q.gte('issue_date', `${year}-01-01`).lte('issue_date', `${year}-12-31`)
    const { data, error } = await q
    if (error) return erreurApi(req, res, 'internal', error, { route: 'customer-invoices/index' })
    return res.status(200).json(data)
  }

  if (req.method === 'POST') {
    const {
      project_id, client_name, client_address, amount, amount_net, vat_rate, vat_amount,
      currency, issue_date, due_date, iban_recipient, quote_snapshot, notes,
      detail_level, status, object,
      discount_label, discount_rate, discount_amount,
    } = req.body

    if (!client_name || amount == null) return res.status(400).json({ error: 'client_name et amount requis' })

    // Les montants sont recalculés depuis quote_snapshot : ceux du navigateur
    // ne sont qu'une proposition, refusée si elle s'écarte de plus d'un centime.
    const check = validerFacture(req.body)
    if (!check.ok) return res.status(400).json({ error: check.error })
    const { amount: amountNum, amount_net: netNum, vat_amount: vatNum, vat_rate: vatRateNum, currency: cur } = check.valeurs

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
        amount_net: netNum,
        vat_rate: vatRateNum,
        vat_amount: vatNum,
        currency: cur,
        issue_date: issue_date || new Date().toISOString().slice(0, 10),
        due_date: due_date || null,
        iban_recipient: iban_recipient || process.env.AMAZING_LAB_IBAN || null,
        qr_reference,
        quote_snapshot: quote_snapshot || null,
        detail_level: detail_level === 'summary' ? 'summary' : 'detailed',
        status: status || 'created',
        notes,
        object: object || null,
        discount_label:  discount_label || null,
        discount_rate:   discount_rate   != null && discount_rate   !== '' ? parseFloat(discount_rate)   : null,
        discount_amount: discount_amount != null && discount_amount !== '' ? parseFloat(discount_amount) : null,
      }).select().single())

      if (!error || error.code !== '23505') break
    }

    if (error) return erreurApi(req, res, 'internal', error, { route: 'customer-invoices/index' })
    return res.status(201).json(data)
  }

  return res.status(405).end()
}
