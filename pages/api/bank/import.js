import { getSupabaseServer } from '../../../lib/supabase-server'
import { parseCamt053 } from '../../../lib/camt053'
import { requireAdmin } from '../../../lib/requireAdmin'
import { reconcileTransactions } from '../../../lib/reconcileRun'

const supabase = getSupabaseServer()

export const config = { api: { bodyParser: { sizeLimit: '20mb' } } }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const admin = await requireAdmin(req, res)
  if (!admin) return

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

  // Insertion par lots. C'était une ligne à la fois pour ne pas tout perdre sur
  // un doublon : un relevé de 200 écritures faisait donc 200 allers-retours.
  // `ignoreDuplicates` laisse la base écarter les doublons, et le repli ligne
  // par ligne ne sert plus qu'au lot qui échoue pour une autre raison.
  const TAILLE_LOT = 100
  let inserted = 0, duplicates = 0, errors = 0

  for (let i = 0; i < rows.length; i += TAILLE_LOT) {
    const lot = rows.slice(i, i + TAILLE_LOT)
    const { data, error } = await supabase
      .from('bank_transactions')
      // Clé unique de schema-banking.sql : (account_iban, booking_date, amount, end_to_end_id)
      .upsert(lot, { onConflict: 'account_iban,booking_date,amount,end_to_end_id', ignoreDuplicates: true })
      .select('id')

    if (!error) {
      inserted += data?.length || 0
      duplicates += lot.length - (data?.length || 0)
      continue
    }

    // Le lot entier a échoué : on reprend ligne par ligne pour isoler la cause
    // et sauver le reste. Une importation partielle doit rester visible.
    logErreur(requestId(req), 'bank/import (lot)', error, { taille: lot.length })
    for (const row of lot) {
      const { error: e } = await supabase.from('bank_transactions').insert(row)
      if (!e) inserted++
      else if (e.code === '23505') duplicates++
      else { errors++; logErreur(requestId(req), 'bank/import (ligne)', e) }
    }
  }

  const reconciliation = await reconcileTransactions(supabase, admin?.name)

  return res.status(200).json({
    inserted, duplicates, errors, total: rows.length,
    partiel: errors > 0,
    import_id: importId, ...reconciliation,
  })
}
