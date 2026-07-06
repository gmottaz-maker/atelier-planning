import { getSupabaseServer } from '../../../lib/supabase-server'
import { requireUser } from '../../../lib/requireAdmin'

const DEFAULTS = {
  responsibles: ['Arnaud', 'Guillaume', 'Gabin', 'non défini'],
  company_info: {
    name:    process.env.AMAZING_LAB_NAME    || 'Amazing Lab Sàrl',
    address: process.env.AMAZING_LAB_ADDRESS || "Rue de l'Ecluse 30",
    zip:     process.env.AMAZING_LAB_ZIP    || '1201',
    city:    process.env.AMAZING_LAB_CITY    || 'Genève',
    country: process.env.AMAZING_LAB_COUNTRY || 'CH',
    iban:    process.env.AMAZING_LAB_IBAN    || '',
    email:   process.env.AMAZING_LAB_EMAIL   || 'hello@amazinglab.ch',
    website: process.env.AMAZING_LAB_WEBSITE || 'amazinglab.ch',
    phone:   process.env.AMAZING_LAB_PHONE   || '',
    vat_number: process.env.AMAZING_LAB_VAT  || '',
    payment_terms: 'Paiement à 30 jours net.',
  },
}

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return
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
