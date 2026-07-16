import { getSupabaseServer } from '../../../lib/supabase-server'
import { requireAdmin } from '../../../lib/requireAdmin'

const supabase = getSupabaseServer()

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return
  const { id } = req.query

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('customer_invoices').select('*, projects(name, client)').eq('id', id).single()
    if (error) return res.status(404).json({ error: error.message })
    return res.status(200).json(data)
  }

  if (req.method === 'PUT') {
    const allowed = ['client_name', 'client_address', 'amount', 'amount_net', 'vat_rate', 'vat_amount',
                     'currency', 'issue_date',
                     'due_date', 'iban_recipient', 'notes', 'status', 'quote_snapshot',
                     'detail_level', 'sent_at', 'object']
    const payload = { updated_at: new Date().toISOString() }
    for (const k of allowed) if (k in req.body) payload[k] = req.body[k] === '' ? null : req.body[k]
    for (const k of ['amount', 'amount_net', 'vat_rate', 'vat_amount']) {
      if (payload[k] != null) payload[k] = parseFloat(payload[k])
    }
    const { data, error } = await supabase.from('customer_invoices').update(payload).eq('id', id).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  if (req.method === 'DELETE') {
    const { error } = await supabase.from('customer_invoices').delete().eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ success: true })
  }

  return res.status(405).end()
}
