import { getSupabaseServer } from '../../../lib/supabase-server'

const DEFAULTS = {
  responsibles: ['Arnaud', 'Guillaume', 'Gabin', 'non défini'],
}

export default async function handler(req, res) {
  const { key } = req.query
  if (!key) return res.status(400).json({ error: 'key requis' })

  const supabase = getSupabaseServer()

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ value: data?.value ?? DEFAULTS[key] ?? null })
  }

  if (req.method === 'PUT') {
    const { value } = req.body || {}
    if (value === undefined) return res.status(400).json({ error: 'value requis' })

    const { data, error } = await supabase
      .from('app_settings')
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
      .select('value')
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ value: data.value })
  }

  return res.status(405).end()
}
