import { getSupabaseServer } from '../../../lib/supabase-server'
import { parseCamt053 } from '../../../lib/camt053'
import { requireAdmin } from '../../../lib/requireAdmin'
import { planAutoReconcile, paymentDateOf } from '../../../lib/bankReconcile'

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

  let inserted = 0
  let duplicates = 0
  // Insertion ligne par ligne pour ne pas tout perdre sur un duplicate
  for (const row of rows) {
    const { error } = await supabase.from('bank_transactions').insert(row)
    if (!error) inserted++
    else if (error.code === '23505') duplicates++
    else console.error('Insert error:', error.message)
  }

  const reconciliation = await reconcileSupplierPayments(admin?.name)

  return res.status(200).json({ inserted, duplicates, total: rows.length, import_id: importId, ...reconciliation })
}

// Vérifie quels ordres transmis à la banque sont réellement passés, et solde les
// factures correspondantes avec la date réelle du débit.
// Balaie tous les débits non rapprochés, pas seulement ceux de cet import : une
// facture saisie après coup se rapproche ainsi au CAMT suivant.
async function reconcileSupplierPayments(adminName) {
  const [{ data: txs, error: txErr }, { data: invoices, error: invErr }] = await Promise.all([
    supabase.from('bank_transactions').select('*').is('matched_to_type', null).lt('amount', 0),
    supabase.from('supplier_invoices').select('*').in('status', ['sent_to_bank', 'pending']),
  ])
  if (txErr || invErr) {
    console.error('Reconcile read error:', (txErr || invErr).message)
    return { reconciled: [], ambiguous: 0 }
  }

  const { matched, ambiguous } = planAutoReconcile(txs || [], invoices || [])
  const reconciled = []
  for (const m of matched) {
    const paidAt = paymentDateOf(m.tx)
    const { error: e1 } = await supabase.from('bank_transactions').update({
      matched_to_type: 'supplier_invoice',
      matched_to_id: m.invoice.id,
      matched_at: new Date().toISOString(),
      matched_by: adminName ? `${adminName} (auto CAMT)` : 'auto CAMT',
      match_confidence: m.score,
    }).eq('id', m.tx.id)
    if (e1) { console.error('Reconcile match error:', e1.message); continue }

    const { error: e2 } = await supabase.from('supplier_invoices').update({
      status: 'paid',
      paid_transaction_id: m.tx.id,
      paid_at: paidAt,
    }).eq('id', m.invoice.id)
    if (e2) { console.error('Reconcile status error:', e2.message); continue }

    reconciled.push({
      invoice_id: m.invoice.id,
      supplier_name: m.invoice.supplier_name,
      invoice_number: m.invoice.invoice_number,
      amount: m.invoice.amount,
      paid_at: paidAt,
      score: m.score,
      reasons: m.reasons,
    })
  }
  return { reconciled, ambiguous: ambiguous.length }
}
