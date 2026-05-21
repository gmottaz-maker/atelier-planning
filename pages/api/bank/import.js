import { getSupabaseServer } from '../../../lib/supabase-server'
import { parseCamt053 } from '../../../lib/camt053'
import { requireAdmin } from '../../../lib/requireAdmin'

const supabase = getSupabaseServer()

export const config = { api: { bodyParser: { sizeLimit: '20mb' } } }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!requireAdmin(req, res)) return

  const { xml, csv, format } = req.body || {}
  if (!xml && !csv) return res.status(400).json({ error: 'xml ou csv requis' })

  let parsed
  try {
    if (xml) parsed = parseCamt053(xml)
    else return res.status(400).json({ error: 'Format CSV non implémenté' })
  } catch (e) {
    return res.status(400).json({ error: 'Parsing: ' + e.message })
  }

  const importId = `imp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  // Insert avec conflict ignore sur la clé unique (account + date + amount + end_to_end_id)
  const rows = parsed.map(t => ({
    account_iban:      t.account_iban,
    booking_date:      t.booking_date,
    value_date:        t.value_date,
    amount:            t.amount,
    currency:          t.currency,
    description:       t.description,
    reference:         t.reference,
    counterparty_name: t.counterparty_name,
    counterparty_iban: t.counterparty_iban,
    end_to_end_id:     t.end_to_end_id,
    raw:               t.raw,
    import_id:         importId,
  }))

  let inserted = 0
  let duplicates = 0
  // Insertion ligne par ligne pour ne pas tout perdre sur un duplicate
  for (const row of rows) {
    const { error } = await supabase.from('bank_transactions').insert(row)
    if (!error) inserted++
    else if (error.code === '23505') duplicates++
    else console.error('Insert error:', error.message)
  }

  return res.status(200).json({ inserted, duplicates, total: rows.length, import_id: importId })
}
