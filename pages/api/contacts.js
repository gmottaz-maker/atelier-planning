import { getSupabaseServer } from '../../lib/supabase-server'
import { requireAdmin } from '../../lib/requireAdmin'

const supabase = getSupabaseServer()

const EDITABLE = ['kind', 'name', 'parent_id', 'is_customer', 'is_supplier',
  'email', 'phone', 'street', 'city', 'state', 'country', 'vat_number', 'notes', 'tags', 'website', 'archived']

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return

  // ── GET : liste complète ──
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .order('name', { ascending: true })
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  // ── POST : créer un contact ──
  if (req.method === 'POST') {
    const payload = {}
    for (const k of EDITABLE) if (k in req.body) payload[k] = req.body[k]
    if (!payload.name) return res.status(400).json({ error: 'name requis' })
    const { data, error } = await supabase.from('contacts').insert(payload).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  }

  // ── PATCH ?id= : mise à jour partielle ──
  if (req.method === 'PATCH') {
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'id requis' })
    const payload = { updated_at: new Date().toISOString() }
    for (const k of EDITABLE) if (k in req.body) payload[k] = req.body[k] === '' ? null : req.body[k]
    const { data, error } = await supabase.from('contacts').update(payload).eq('id', id).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  // ── DELETE ?id= ──
  if (req.method === 'DELETE') {
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'id requis' })
    const { error } = await supabase.from('contacts').delete().eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
