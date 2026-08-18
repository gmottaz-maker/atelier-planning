// Numérotation séquentielle des factures + référence QR-bill (norme suisse modulo 10).

/** Plus haut numéro déjà émis pour l'année, + 1. Non concurrent — repli seul. */
export function seqSuivante(numeros, year) {
  let max = 0
  for (const n of numeros || []) {
    if (!String(n).startsWith(`${year}-`)) continue
    const v = parseInt(String(n).split('-')[1] || '0', 10)
    if (Number.isFinite(v) && v > max) max = v
  }
  return max + 1
}

export const formatNumero = (year, seq) => `${year}-${String(seq).padStart(3, '0')}`

/**
 * Numéro de facture suivant, attribué par la base (compteur verrouillé).
 *
 * L'ancien calcul — SELECT max + 1 côté application — donnait le même numéro à
 * deux créations simultanées. Le repli ci-dessous le reproduit, et n'est là que
 * tant que schema-integrite-financiere.sql n'a pas été joué ; la contrainte
 * UNIQUE sur invoice_number transforme alors une collision en erreur plutôt
 * qu'en doublon silencieux.
 */
export async function nextInvoiceNumber(supabase, year) {
  const { data, error } = await supabase.rpc('next_invoice_number', { p_year: Number(year) })
  if (!error && data) return data
  if (error && !/(does not exist|schema cache|not find the function)/i.test(error.message || '')) {
    throw new Error(`Numérotation impossible : ${error.message}`)
  }
  console.warn('next_invoice_number absente — repli non concurrent. Jouer schema-integrite-financiere.sql.')

  const { data: rows } = await supabase
    .from('customer_invoices')
    .select('invoice_number')
    .like('invoice_number', `${year}-%`)
  return formatNumero(year, seqSuivante((rows || []).map(r => r.invoice_number), year))
}

export function qrReference(invoiceNumber, projectId) {
  const digits = (invoiceNumber + (projectId || '')).replace(/\D/g, '').padStart(26, '0').slice(-26)
  const table = [[0,9,4,6,8,2,7,1,3,5],[9,4,6,8,2,7,1,3,5,0],[4,6,8,2,7,1,3,5,0,9],
                 [6,8,2,7,1,3,5,0,9,4],[8,2,7,1,3,5,0,9,4,6],[2,7,1,3,5,0,9,4,6,8],
                 [7,1,3,5,0,9,4,6,8,2],[1,3,5,0,9,4,6,8,2,7],[3,5,0,9,4,6,8,2,7,1],
                 [5,0,9,4,6,8,2,7,1,3]]
  let carry = 0
  for (const ch of digits) carry = table[carry][parseInt(ch, 10)]
  const check = (10 - carry) % 10
  return digits + String(check)
}
