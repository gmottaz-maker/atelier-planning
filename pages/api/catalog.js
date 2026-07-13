import { getSupabaseServer } from '../../lib/supabase-server'
import { requireAdmin } from '../../lib/requireAdmin'

const supabase = getSupabaseServer()

const EDITABLE = ['type', 'name', 'unit', 'vat_rate', 'purchase_price',
  'margin', 'sale_price', 'vendor', 'notes', 'archived']

const NUM = new Set(['vat_rate', 'purchase_price', 'margin', 'sale_price'])

// Nettoie une valeur : '' → null ; champs numériques → number ou null.
function clean(k, v) {
  if (v === '' || v === undefined) return null
  if (NUM.has(k)) { const n = parseFloat(v); return isNaN(n) ? null : n }
  return v
}

function pickPayload(body) {
  const p = {}
  for (const k of EDITABLE) if (k in body) p[k] = clean(k, body[k])
  return p
}

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return

  // ── GET : liste complète ──
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('catalog_items').select('*').order('name', { ascending: true })
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  // ── POST : créer un article, ou import bulk (?bulk=1) ──
  if (req.method === 'POST') {
    if (req.query.bulk) {
      const items = Array.isArray(req.body?.items) ? req.body.items : null
      if (!items) return res.status(400).json({ error: 'items[] requis' })
      const toUpsert = []   // avec id → update
      const toInsert = []   // sans id → insert
      for (const it of items) {
        const payload = pickPayload(it)
        if (!payload.name) continue
        payload.updated_at = new Date().toISOString()
        if (it.id) toUpsert.push({ id: Number(it.id), ...payload })
        else toInsert.push(payload)
      }
      let updated = 0, inserted = 0
      if (toUpsert.length) {
        const { error } = await supabase.from('catalog_items').upsert(toUpsert, { onConflict: 'id' })
        if (error) return res.status(500).json({ error: error.message })
        updated = toUpsert.length
      }
      if (toInsert.length) {
        const { error } = await supabase.from('catalog_items').insert(toInsert)
        if (error) return res.status(500).json({ error: error.message })
        inserted = toInsert.length
      }
      return res.status(200).json({ ok: true, inserted, updated })
    }
    const payload = pickPayload(req.body)
    if (!payload.name) return res.status(400).json({ error: 'name requis' })
    const { data, error } = await supabase.from('catalog_items').insert(payload).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  }

  // ── PATCH ?id= : mise à jour partielle ──
  if (req.method === 'PATCH') {
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'id requis' })
    const payload = { ...pickPayload(req.body), updated_at: new Date().toISOString() }
    const { data, error } = await supabase.from('catalog_items').update(payload).eq('id', id).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  // ── DELETE ?id= ──
  if (req.method === 'DELETE') {
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'id requis' })
    const { error } = await supabase.from('catalog_items').delete().eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
