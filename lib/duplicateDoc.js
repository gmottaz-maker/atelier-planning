// Duplication d'une facture émise ou d'une offre.
//
// L'essentiel est ce qu'on NE recopie PAS : numéro, dates d'envoi et de
// paiement, statut, référence QR, lien vers la transaction bancaire. Une copie
// repart toujours d'un document neuf, sinon on se retrouverait avec deux
// factures portant le même numéro, ou une copie déjà marquée payée.

const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// Corps du POST /api/customer-invoices pour dupliquer une facture.
export function invoiceCopyBody(inv, today = new Date().toISOString().slice(0, 10)) {
  return {
    // Contenu repris tel quel
    project_id:      inv.project_id || null,
    client_name:     inv.client_name || '',
    client_address:  inv.client_address || null,
    object:          inv.object || null,
    amount:          inv.amount,
    amount_net:      inv.amount_net,
    vat_rate:        inv.vat_rate,
    vat_amount:      inv.vat_amount,
    currency:        inv.currency || 'CHF',
    iban_recipient:  inv.iban_recipient || null,
    notes:           inv.notes || null,
    quote_snapshot:  inv.quote_snapshot || null,
    detail_level:    inv.detail_level || 'detailed',
    discount_label:  inv.discount_label || null,
    discount_rate:   inv.discount_rate ?? null,
    discount_amount: inv.discount_amount ?? null,
    // Remis à neuf : le numéro et la référence QR sont regénérés côté serveur
    issue_date: today,
    due_date:   addDays(today, 30),
    status:     'created',
  }
}

// Copie du devis d'un projet vers un autre : on garde les positions, on repart
// en brouillon sans numéro ni date d'envoi.
export function offerCopy(quote) {
  const q = quote || {}
  return {
    management:     q.management     || [],
    items:          q.items          || [],
    subcontracting: q.subcontracting || [],
    logistics:      q.logistics      || [],
    general_margin: q.general_margin ?? '',
    status: 'brouillon',
    number: '',
  }
}
