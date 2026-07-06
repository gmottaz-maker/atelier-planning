import { getSupabaseServer } from '../../../lib/supabase-server'
import { requireUser } from '../../../lib/requireAdmin'

const FIELDS = {
  vendor:        { category: 'commande',       jsonKey: 'vendor' },
  subcontractor: { category: 'sous_traitance', jsonKey: 'subcontractor' },
  storage:       { category: 'commande',       jsonKey: 'storage_location' },
}

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return
  if (req.method !== 'GET') return res.status(405).end()

  const field = String(req.query.field || '')
  const config = FIELDS[field]
  if (!config) return res.status(400).json({ error: 'field invalide' })

  const supabase = getSupabaseServer()
  const { data, error } = await supabase
    .from('tasks')
    .select('category_data')
    .eq('category', config.category)
    .not('category_data', 'is', null)
    .limit(2000)

  if (error) return res.status(500).json({ error: error.message })

  const seen = new Map()
  for (const row of data || []) {
    const v = row.category_data?.[config.jsonKey]
    if (typeof v !== 'string') continue
    const trimmed = v.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (!seen.has(key)) seen.set(key, trimmed)
  }
  const values = [...seen.values()].sort((a, b) => a.localeCompare(b, 'fr'))
  return res.status(200).json({ values })
}
