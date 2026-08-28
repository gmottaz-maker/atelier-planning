// Classe un mouvement bancaire SANS pièce : salaire, virement interne, frais
// bancaires, impôts. Le retirer se fait avec `clear: true`.
//
// Distinct de bank/match : là on rattache une pièce, ici on donne une nature.
// Une transaction ne peut pas avoir les deux — la base le refuse aussi
// (contrainte bank_tx_piece_ou_nature), pour qu'un mouvement n'entre jamais
// deux fois au journal.
import { getSupabaseServer } from '../../../lib/supabase-server'
import { requireAdmin } from '../../../lib/requireAdmin'
import { estNatureValide, CLES_NATURE } from '../../../lib/bankClassification'
import { erreurApi } from '../../../lib/apiError'

const supabase = getSupabaseServer()

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const admin = await requireAdmin(req, res)
  if (!admin) return

  const { transaction_id, classification, clear } = req.body || {}
  if (!transaction_id) return res.status(400).json({ error: 'transaction_id requis' })

  const { data: tx, error: lecture } = await supabase.from('bank_transactions')
    .select('id, matched_to_type').eq('id', transaction_id).maybeSingle()
  if (lecture) return erreurApi(req, res, 'internal', lecture, { route: 'bank/classify' })
  if (!tx) return res.status(404).json({ error: 'Transaction introuvable' })

  if (clear) {
    const { error } = await supabase.from('bank_transactions')
      .update({ classification: null, classified_at: null, classified_by: null })
      .eq('id', transaction_id)
    if (error) return erreurApi(req, res, 'internal', error, { route: 'bank/classify' })
    return res.status(200).json({ ok: true, classification: null })
  }

  if (!estNatureValide(classification)) {
    return res.status(400).json({ error: `Nature inconnue. Attendu : ${CLES_NATURE.join(', ')}` })
  }
  // Une pièce déjà rattachée prime : on ne la remplace pas en silence.
  if (tx.matched_to_type) {
    return res.status(400).json({ error: 'Cette transaction est déjà rapprochée à une pièce. Annule le rapprochement d’abord.' })
  }

  // L'auteur vient du JWT, jamais du corps de la requête.
  const { error } = await supabase.from('bank_transactions').update({
    classification,
    classified_at: new Date().toISOString(),
    classified_by: admin.name,
  }).eq('id', transaction_id)
  if (error) return erreurApi(req, res, 'internal', error, { route: 'bank/classify' })

  return res.status(200).json({ ok: true, classification })
}
