// Confirme ou retire un match entre une transaction et une facture/dépense.
import { getSupabaseServer } from '../../../lib/supabase-server'
import { requireAdmin } from '../../../lib/requireAdmin'

const supabase = getSupabaseServer()

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!requireAdmin(req, res)) return

  const { transaction_id, type, target_id, confidence, actor, unmatch } = req.body || {}
  if (!transaction_id) return res.status(400).json({ error: 'transaction_id requis' })

  // Désassocier
  if (unmatch) {
    // Récupérer l'état actuel pour libérer la facture liée
    const { data: tx } = await supabase.from('bank_transactions')
      .select('matched_to_type, matched_to_id').eq('id', transaction_id).single()
    if (tx?.matched_to_type && tx?.matched_to_id) {
      if (tx.matched_to_type === 'supplier_invoice') {
        await supabase.from('supplier_invoices')
          .update({ status: 'pending', paid_transaction_id: null, paid_at: null })
          .eq('id', tx.matched_to_id)
      }
      if (tx.matched_to_type === 'customer_invoice') {
        await supabase.from('customer_invoices')
          .update({ status: 'pending', paid_transaction_id: null, paid_at: null })
          .eq('id', tx.matched_to_id)
      }
    }
    const { error } = await supabase.from('bank_transactions')
      .update({ matched_to_type: null, matched_to_id: null, matched_at: null, matched_by: null, match_confidence: null })
      .eq('id', transaction_id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ success: true, unmatched: true })
  }

  if (!type || !target_id) return res.status(400).json({ error: 'type et target_id requis' })

  // Lier
  const { error: txErr } = await supabase.from('bank_transactions').update({
    matched_to_type: type,
    matched_to_id: target_id,
    matched_at: new Date().toISOString(),
    matched_by: actor || null,
    match_confidence: confidence || null,
  }).eq('id', transaction_id)
  if (txErr) return res.status(500).json({ error: txErr.message })

  // Mettre à jour le statut de la facture liée
  if (type === 'supplier_invoice') {
    await supabase.from('supplier_invoices')
      .update({ status: 'paid', paid_transaction_id: transaction_id, paid_at: new Date().toISOString() })
      .eq('id', target_id)
  }
  if (type === 'customer_invoice') {
    await supabase.from('customer_invoices')
      .update({ status: 'paid', paid_transaction_id: transaction_id, paid_at: new Date().toISOString() })
      .eq('id', target_id)
  }

  return res.status(200).json({ success: true })
}
