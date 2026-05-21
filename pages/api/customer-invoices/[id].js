import { getSupabaseServer } from '../../../lib/supabase-server'

const supabase = getSupabaseServer()

export default async function handler(req, res) {
  const { id } = req.query

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('customer_invoices').select('*, projects(name, client)').eq('id', id).single()
    if (error) return res.status(404).json({ error: error.message })
    return res.status(200).json(data)
  }

  if (req.method === 'PUT') {
    const allowed = ['client_name', 'client_address', 'amount', 'currency', 'issue_date',
                     'due_date', 'iban_recipient', 'notes', 'status']
    const payload = { updated_at: new Date().toISOString() }
    for (const k of allowed) if (k in req.body) payload[k] = req.body[k] === '' ? null : req.body[k]
    if (payload.amount != null) payload.amount = parseFloat(payload.amount)
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
