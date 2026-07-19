// Confirme ou retire un match entre une transaction et une facture/dépense.
import { getSupabaseServer } from '../../../lib/supabase-server'
import { requireAdmin } from '../../../lib/requireAdmin'
import { paymentDateOf } from '../../../lib/bankReconcile'

const supabase = getSupabaseServer()

// Types autorisés (cf. schema-banking.sql) + table associée quand le match
// doit basculer un statut de facture.
const MATCH_TYPES = ['supplier_invoice', 'customer_invoice', 'expense', 'manual_note']
const INVOICE_TABLES = {
  supplier_invoice: 'supplier_invoices',
  customer_invoice: 'customer_invoices',
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const admin = await requireAdmin(req, res)
  if (!admin) return

  const { transaction_id, type, target_id, confidence, unmatch } = req.body || {}
  if (!transaction_id) return res.status(400).json({ error: 'transaction_id requis' })

  // La transaction doit exister (évite d'écrire un match orphelin)
  const { data: tx, error: txReadErr } = await supabase.from('bank_transactions')
    .select('id, amount, booking_date, value_date, matched_to_type, matched_to_id').eq('id', transaction_id).maybeSingle()
  if (txReadErr) return res.status(500).json({ error: txReadErr.message })
  if (!tx) return res.status(404).json({ error: 'Transaction introuvable' })

  // Désassocier
  if (unmatch) {
    // Libérer la facture liée. Un ordre déjà transmis à la banque retrouve son
    // statut « transmis » plutôt que de repartir à « à payer ».
    const invoiceTable = INVOICE_TABLES[tx.matched_to_type]
    if (invoiceTable && tx.matched_to_id) {
      let status = 'pending'
      if (tx.matched_to_type === 'supplier_invoice') {
        const { data: inv } = await supabase.from('supplier_invoices')
          .select('sent_to_bank_at').eq('id', tx.matched_to_id).maybeSingle()
        if (inv?.sent_to_bank_at) status = 'sent_to_bank'
      }
      await supabase.from(invoiceTable)
        .update({ status, paid_transaction_id: null, paid_at: null })
        .eq('id', tx.matched_to_id)
    }
    const { error } = await supabase.from('bank_transactions')
      .update({ matched_to_type: null, matched_to_id: null, matched_at: null, matched_by: null, match_confidence: null })
      .eq('id', transaction_id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ success: true, unmatched: true })
  }

  if (!type || !target_id) return res.status(400).json({ error: 'type et target_id requis' })
  if (!MATCH_TYPES.includes(type)) return res.status(400).json({ error: `type invalide : ${type}` })

  // La cible doit exister avant de la marquer payée
  const invoiceTable = INVOICE_TABLES[type]
  if (invoiceTable) {
    const { data: target } = await supabase.from(invoiceTable)
      .select('id, amount, status').eq('id', target_id).maybeSingle()
    if (!target) return res.status(404).json({ error: 'Facture cible introuvable' })
  } else if (type === 'expense') {
    const { data: target } = await supabase.from('expenses')
      .select('id').eq('id', target_id).maybeSingle()
    if (!target) return res.status(404).json({ error: 'Dépense cible introuvable' })
  }

  // Lier — matched_by vient de l'identité vérifiée, pas du body
  const { error: txErr } = await supabase.from('bank_transactions').update({
    matched_to_type: type,
    matched_to_id: target_id,
    matched_at: new Date().toISOString(),
    matched_by: admin.name,
    match_confidence: confidence || null,
  }).eq('id', transaction_id)
  if (txErr) return res.status(500).json({ error: txErr.message })

  // Mettre à jour le statut de la facture liée.
  // paid_at = date réelle du paiement au relevé, pas l'instant du rapprochement.
  if (invoiceTable) {
    await supabase.from(invoiceTable)
      .update({ status: 'paid', paid_transaction_id: transaction_id, paid_at: paymentDateOf(tx) })
      .eq('id', target_id)
  }

  return res.status(200).json({ success: true })
}
