import { getSupabaseServer } from '../../../lib/supabase-server'
import { requireAdmin } from '../../../lib/requireAdmin'
import { validerFacture } from '../../../lib/invoiceCheck'
import { erreurApi } from '../../../lib/apiError'

const supabase = getSupabaseServer()

export default async function handler(req, res) {
  const user = await requireAdmin(req, res)
  if (!user) return
  const { id } = req.query

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('customer_invoices').select('*, projects(name, client)').eq('id', id).single()
    if (error) return erreurApi(req, res, 'not_found', error, { route: 'customer-invoices/[id]' })
    return res.status(200).json(data)
  }

  // PATCH = PUT (mise à jour partielle : statut, dates d'envoi/paiement depuis
  // la liste). Sans ce cas, les requêtes PATCH tombaient en 405 sans rien faire.
  if (req.method === 'PUT' || req.method === 'PATCH') {
    const allowed = ['client_name', 'client_address', 'amount', 'amount_net', 'vat_rate', 'vat_amount',
                     'currency', 'issue_date',
                     'due_date', 'iban_recipient', 'notes', 'status', 'quote_snapshot',
                     'detail_level', 'sent_at', 'paid_at', 'object',
                     'discount_label', 'discount_rate', 'discount_amount']
    const payload = { updated_at: new Date().toISOString() }
    for (const k of allowed) if (k in req.body) payload[k] = req.body[k] === '' ? null : req.body[k]
    for (const k of ['amount', 'amount_net', 'vat_rate', 'vat_amount', 'discount_rate', 'discount_amount']) {
      if (payload[k] != null) payload[k] = parseFloat(payload[k])
    }

    // Mise à jour partielle : on ne peut valider les montants qu'en les
    // fusionnant avec la facture existante. Un PATCH de statut ne déclenche
    // donc aucun recalcul.
    const TOUCHE_MONTANTS = ['amount', 'amount_net', 'vat_rate', 'vat_amount',
                             'quote_snapshot', 'discount_rate', 'discount_amount', 'currency', 'status',
                             'issue_date', 'due_date']
    if (TOUCHE_MONTANTS.some(k => k in payload)) {
      const { data: actuelle } = await supabase
        .from('customer_invoices').select('*').eq('id', id).maybeSingle()
      if (!actuelle) return res.status(404).json({ error: 'Facture introuvable' })
      const check = validerFacture({ ...actuelle, ...payload })
      if (!check.ok) return res.status(400).json({ error: check.error })
      if ('amount' in payload || 'quote_snapshot' in payload ||
          'discount_rate' in payload || 'discount_amount' in payload || 'vat_rate' in payload) {
        Object.assign(payload, check.valeurs)
      }
    }

    const { data, error } = await supabase.from('customer_invoices').update(payload).eq('id', id).select().single()
    if (error) return erreurApi(req, res, 'internal', error, { route: 'customer-invoices/[id]' })
    return res.status(200).json(data)
  }

  if (req.method === 'DELETE') {
    // Une facture partie chez le client, ou déjà payée, ne se supprime pas :
    // elle s'annule. Effacer la ligne trouerait la numérotation et ferait
    // disparaître une pièce comptable.
    const { data: inv } = await supabase
      .from('customer_invoices').select('id, status, invoice_number').eq('id', id).maybeSingle()
    if (!inv) return res.status(404).json({ error: 'Facture introuvable' })

    if (['sent', 'pending', 'paid'].includes(inv.status)) {
      const { data, error } = await supabase.from('customer_invoices')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', id).select().single()
      if (error) return erreurApi(req, res, 'internal', error, { route: 'customer-invoices/[id]' })
      await supabase.from('activity_log').insert({
        actor: user.name, action: 'invoice_cancelled', entity_type: 'customer_invoice',
        entity_id: String(id), entity_name: inv.invoice_number,
        metadata: { previous_status: inv.status },
      }).then(() => {}, () => {})
      return res.status(200).json({ success: true, cancelled: true, invoice: data })
    }

    const { error } = await supabase.from('customer_invoices').delete().eq('id', id)
    if (error) return erreurApi(req, res, 'internal', error, { route: 'customer-invoices/[id]' })
    return res.status(200).json({ success: true })
  }

  return res.status(405).end()
}
