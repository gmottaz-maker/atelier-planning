import { getSupabaseServer } from '../../lib/supabase-server'
import { requireAdmin } from '../../lib/requireAdmin'

const supabase = getSupabaseServer()
const EDITABLE = ['client', 'brand', 'pallets', 'archived', 'billing_mode', 'annual_billed_pallets', 'annual_year']
const NUM = new Set(['pallets', 'annual_billed_pallets', 'annual_year'])

function pick(body) {
  const p = {}
  for (const k of EDITABLE) if (k in body) {
    let v = body[k]
    if (v === '' || v === undefined) v = k === 'pallets' ? 0 : null
    else if (NUM.has(k)) { const n = parseFloat(v); v = isNaN(n) ? (k === 'pallets' ? 0 : null) : n }
    p[k] = v
  }
  return p
}

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('storage_groups').select('*').order('client').order('brand')
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }
  if (req.method === 'POST') {
    const payload = pick(req.body)
    if (!payload.client || !payload.brand) return res.status(400).json({ error: 'client et brand requis' })
    const { data, error } = await supabase.from('storage_groups').insert(payload).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  }
  if (req.method === 'PATCH') {
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'id requis' })
    const payload = { ...pick(req.body), updated_at: new Date().toISOString() }
    const { data, error } = await supabase.from('storage_groups').update(payload).eq('id', id).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }
  if (req.method === 'DELETE') {
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'id requis' })
    const { error } = await supabase.from('storage_groups').delete().eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }
  return res.status(405).json({ error: 'Method not allowed' })
}
