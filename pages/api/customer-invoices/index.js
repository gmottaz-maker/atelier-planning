import { getSupabaseServer } from '../../../lib/supabase-server'
import { requireAdmin } from '../../../lib/requireAdmin'
import { nextInvoiceNumber, qrReference } from '../../../lib/invoiceNumber'
import { validerFacture } from '../../../lib/invoiceCheck'
import { acomptesDuProjet, totalAcomptesTTC, figerDeductions } from '../../../lib/acomptes'
import { erreurApi } from '../../../lib/apiError'

const supabase = getSupabaseServer()

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return
  if (req.method === 'GET') {
    const { status, year, project, type } = req.query
    let q = supabase.from('customer_invoices').select('*, projects(name, client)').order('issue_date', { ascending: false })
    if (status) q = q.eq('status', status)
    // `?project=` et `?type=acompte` : l'écran de facture a besoin des
    // acomptes déjà émis sur le chantier pour en montrer la déduction. Le
    // serveur recalcule la sienne de toute façon — ceci n'est qu'un aperçu.
    if (project) q = q.eq('project_id', project)
    if (type) q = q.eq('type', type)
    if (year) q = q.gte('issue_date', `${year}-01-01`).lte('issue_date', `${year}-12-31`)
    const { data, error } = await q
    if (error) return erreurApi(req, res, 'internal', error, { route: 'customer-invoices/index' })
    return res.status(200).json(data)
  }

  if (req.method === 'POST') {
    const {
      project_id, client_name, client_address, amount, amount_net, vat_rate, vat_amount,
      currency, issue_date, due_date, iban_recipient, quote_snapshot, notes,
      detail_level, status, object, reference,
      discount_label, discount_rate, discount_amount,
      type, acompte_base, acompte_valeur,
    } = req.body

    if (!client_name || amount == null) return res.status(400).json({ error: 'client_name et amount requis' })

    const estAcompte = (type || 'facture') === 'acompte'

    // Les acomptes à déduire se lisent EN BASE, jamais dans le corps de la
    // requête : un navigateur qui en annoncerait vingt mille se ferait une
    // facture à zéro. Même règle que l'identité, qui vient du JWT.
    let acomptesTTC = 0
    let acomptes_deduits = null
    if (project_id && !estAcompte) {
      const { data: deja, error: errAcc } = await supabase
        .from('customer_invoices')
        .select('id, invoice_number, issue_date, amount, status, type, project_id')
        .eq('project_id', project_id).eq('type', 'acompte')
      if (errAcc) return erreurApi(req, res, 'internal', errAcc, { route: 'customer-invoices' })
      const liste = acomptesDuProjet(deja || [], { projectId: project_id })
      acomptesTTC = totalAcomptesTTC(liste)
      // Figé à l'émission : annuler un acompte plus tard ne réécrira pas ce
      // que le client a reçu.
      acomptes_deduits = liste.length ? figerDeductions(liste) : null
    }

    // Les montants sont recalculés depuis quote_snapshot : ceux du navigateur
    // ne sont qu'une proposition, refusée si elle s'écarte de plus d'un centime.
    const check = validerFacture(req.body, { acomptesTTC })
    if (!check.ok) return res.status(400).json({ error: check.error })
    const { amount: amountNum, amount_net: netNum, vat_amount: vatNum, vat_rate: vatRateNum, currency: cur } = check.valeurs

    const year = (issue_date || new Date().toISOString().slice(0, 10)).slice(0, 4)

    // Deux tentatives : si un POST concurrent a pris le même numéro
    // (violation UNIQUE 23505), on recalcule et on réessaie une fois.
    let data = null
    let error = null
    for (let attempt = 0; attempt < 2; attempt++) {
      const invoice_number = await nextInvoiceNumber(supabase, year)
      const qr_reference = qrReference(invoice_number, project_id)

      ;({ data, error } = await supabase.from('customer_invoices').insert({
        project_id: project_id || null,
        invoice_number,
        client_name,
        client_address,
        amount: amountNum,
        amount_net: netNum,
        vat_rate: vatRateNum,
        vat_amount: vatNum,
        currency: cur,
        issue_date: issue_date || new Date().toISOString().slice(0, 10),
        due_date: due_date || null,
        iban_recipient: iban_recipient || process.env.AMAZING_LAB_IBAN || null,
        qr_reference,
        quote_snapshot: quote_snapshot || null,
        detail_level: detail_level === 'summary' ? 'summary' : 'detailed',
        status: status || 'created',
        notes,
        object: object || null,
        reference: reference || null,
        discount_label:  discount_label || null,
        discount_rate:   discount_rate   != null && discount_rate   !== '' ? parseFloat(discount_rate)   : null,
        discount_amount: discount_amount != null && discount_amount !== '' ? parseFloat(discount_amount) : null,
        type: estAcompte ? 'acompte' : 'facture',
        // La contrainte en base exige ces deux champs sur un acompte, et les
        // refuse sur une facture ordinaire.
        acompte_base:   estAcompte ? acompte_base : null,
        acompte_valeur: estAcompte ? parseFloat(acompte_valeur) : null,
        acomptes_deduits,
      }).select().single())

      if (!error || error.code !== '23505') break
    }

    if (error) return erreurApi(req, res, 'internal', error, { route: 'customer-invoices/index' })
    return res.status(201).json(data)
  }

  return res.status(405).end()
}
