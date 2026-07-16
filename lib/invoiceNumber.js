// Numérotation séquentielle des factures + référence QR-bill (norme suisse modulo 10).

export async function nextInvoiceNumber(supabase, year) {
  const { data } = await supabase
    .from('customer_invoices')
    .select('invoice_number')
    .like('invoice_number', `${year}-%`)
  let maxSeq = 0
  for (const row of data || []) {
    const n = parseInt(row.invoice_number.split('-')[1] || '0', 10)
    if (Number.isFinite(n) && n > maxSeq) maxSeq = n
  }
  return `${year}-${String(maxSeq + 1).padStart(3, '0')}`
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
