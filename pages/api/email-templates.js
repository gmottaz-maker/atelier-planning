import { getSupabaseServer } from '../../lib/supabase-server'
import { requireAdmin } from '../../lib/requireAdmin'

const supabase = getSupabaseServer()
const EDITABLE = ['name', 'scope', 'subject', 'body']

function pick(body) {
  const p = {}
  for (const k of EDITABLE) if (k in body) p[k] = body[k] === '' ? null : body[k]
  return p
}

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('email_templates').select('*').order('name', { ascending: true })
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  if (req.method === 'POST') {
    const payload = pick(req.body)
    if (!payload.name) return res.status(400).json({ error: 'name requis' })
    const { data, error } = await supabase.from('email_templates').insert(payload).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  }

  if (req.method === 'PATCH') {
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'id requis' })
    const payload = { ...pick(req.body), updated_at: new Date().toISOString() }
    const { data, error } = await supabase.from('email_templates').update(payload).eq('id', id).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  if (req.method === 'DELETE') {
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'id requis' })
    const { error } = await supabase.from('email_templates').delete().eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
