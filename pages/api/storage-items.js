import { getSupabaseServer } from '../../lib/supabase-server'
import { requireAdmin } from '../../lib/requireAdmin'

const supabase = getSupabaseServer()
const BUCKET = 'storage-photos'
const EDITABLE = ['client', 'brand', 'name', 'quantity', 'dim_l', 'dim_w', 'dim_h', 'weight', 'photo_path', 'notes', 'tags', 'archived']
const NUM = new Set(['quantity', 'dim_l', 'dim_w', 'dim_h', 'weight'])

const publicUrl = path => path
  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`
  : null

function pick(body) {
  const p = {}
  for (const k of EDITABLE) if (k in body) {
    let v = body[k]
    if (k === 'tags') v = Array.isArray(v) ? v : []
    else if (v === '' || v === undefined) v = null
    else if (NUM.has(k)) { const n = parseFloat(v); v = isNaN(n) ? null : n }
    p[k] = v
  }
  return p
}

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('storage_items').select('*').order('client').order('brand').order('name')
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json((data || []).map(r => ({ ...r, photo_url: publicUrl(r.photo_path) })))
  }
  if (req.method === 'POST') {
    const payload = pick(req.body)
    if (!payload.name || !payload.client) return res.status(400).json({ error: 'client et name requis' })
    const { data, error } = await supabase.from('storage_items').insert(payload).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json({ ...data, photo_url: publicUrl(data.photo_path) })
  }
  if (req.method === 'PATCH') {
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'id requis' })
    const payload = { ...pick(req.body), updated_at: new Date().toISOString() }
    const { data, error } = await supabase.from('storage_items').update(payload).eq('id', id).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ...data, photo_url: publicUrl(data.photo_path) })
  }
  if (req.method === 'DELETE') {
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'id requis' })
    const { error } = await supabase.from('storage_items').delete().eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }
  return res.status(405).json({ error: 'Method not allowed' })
}
