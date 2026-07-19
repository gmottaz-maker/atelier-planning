import { getSupabaseServer } from '../../../lib/supabase-server'
import { del as kdriveDel } from '../../../lib/kdrive'
import { requireAdmin } from '../../../lib/requireAdmin'

const supabase = getSupabaseServer()

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return
  const { id } = req.query

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('supplier_invoices').select('*').eq('id', id).single()
    if (error) return res.status(404).json({ error: error.message })
    return res.status(200).json(data)
  }

  if (req.method === 'PUT') {
    const allowed = ['supplier_name', 'invoice_number', 'amount', 'amount_net', 'vat_rate', 'vat_amount',
                     'vat_breakdown', 'currency', 'issue_date',
                     'due_date', 'payment_reference', 'iban', 'category', 'notes', 'status',
                     'scheduled_payment_date']
    const payload = { updated_at: new Date().toISOString() }
    for (const k of allowed) if (k in req.body) payload[k] = req.body[k] === '' ? null : req.body[k]
    for (const k of ['amount', 'amount_net', 'vat_rate', 'vat_amount']) {
      if (payload[k] != null) payload[k] = parseFloat(payload[k])
    }

    // Horodate la transmission à la banque, et efface la trace si on revient en arrière.
    if (payload.status === 'sent_to_bank') {
      const { data: prev } = await supabase.from('supplier_invoices').select('sent_to_bank_at').eq('id', id).maybeSingle()
      if (!prev?.sent_to_bank_at) payload.sent_to_bank_at = new Date().toISOString()
    } else if (payload.status === 'pending') {
      payload.sent_to_bank_at = null
      payload.scheduled_payment_date = null
    }

    const { data, error } = await supabase.from('supplier_invoices').update(payload).eq('id', id).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  if (req.method === 'DELETE') {
    const { data: row } = await supabase.from('supplier_invoices').select('kdrive_file_id').eq('id', id).single()
    if (row?.kdrive_file_id) {
      try { await kdriveDel(row.kdrive_file_id) } catch (e) { console.warn('kdrive delete failed', e.message) }
    }
    const { error } = await supabase.from('supplier_invoices').delete().eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ success: true })
  }

  return res.status(405).end()
}
