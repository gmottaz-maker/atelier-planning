// Plan comptable + correspondance catégorie → compte.
//   GET                     → { accounts, mappings }
//   PUT  { scope, category, account }  → upsert d'une correspondance
//   DELETE ?id=             → supprime une correspondance
import { getSupabaseServer } from '../../lib/supabase-server'
import { requireAdmin } from '../../lib/requireAdmin'

const supabase = getSupabaseServer()

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return

  if (req.method === 'GET') {
    const [{ data: accounts, error: e1 }, { data: mappings, error: e2 }] = await Promise.all([
      supabase.from('accounts').select('*').eq('archived', false).order('sort'),
      supabase.from('account_mappings').select('*').order('scope').order('category'),
    ])
    if (e1 || e2) return res.status(500).json({ error: (e1 || e2).message })
    return res.status(200).json({ accounts, mappings })
  }

  if (req.method === 'PUT') {
    const { scope, category, account } = req.body || {}
    if (!scope || account == null) return res.status(400).json({ error: 'scope et account requis' })
    const { data, error } = await supabase.from('account_mappings')
      .upsert({ scope, category: category || '', account, updated_at: new Date().toISOString() }, { onConflict: 'scope,category' })
      .select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  if (req.method === 'DELETE') {
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'id requis' })
    const { error } = await supabase.from('account_mappings').delete().eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
