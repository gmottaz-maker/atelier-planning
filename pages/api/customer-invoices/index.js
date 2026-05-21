import { getSupabaseServer } from '../../../lib/supabase-server'
import { requireAdmin } from '../../../lib/requireAdmin'

const supabase = getSupabaseServer()

// Génère un n° de facture séquentiel par année (ex: 2026-001)
async function nextInvoiceNumber(year) {
  const { data } = await supabase
    .from('customer_invoices')
    .select('invoice_number')
    .like('invoice_number', `${year}-%`)
    .order('invoice_number', { ascending: false })
    .limit(1)
  if (!data || data.length === 0) return `${year}-001`
  const last = data[0].invoice_number
  const seq  = parseInt(last.split('-')[1] || '0', 10) + 1
  return `${year}-${String(seq).padStart(3, '0')}`
}

// Génère une référence QR-bill (26 chiffres + 1 chiffre checksum = 27 chiffres)
// Format simple : YYMMDD + invoice id padded
function qrReference(invoiceNumber, projectId) {
  const digits = (invoiceNumber + (projectId || '')).replace(/\D/g, '').padStart(26, '0').slice(-26)
  // Modulo 10 recursif (norme suisse)
  const table = [[0,9,4,6,8,2,7,1,3,5],[9,4,6,8,2,7,1,3,5,0],[4,6,8,2,7,1,3,5,0,9],
                 [6,8,2,7,1,3,5,0,9,4],[8,2,7,1,3,5,0,9,4,6],[2,7,1,3,5,0,9,4,6,8],
                 [7,1,3,5,0,9,4,6,8,2],[1,3,5,0,9,4,6,8,2,7],[3,5,0,9,4,6,8,2,7,1],
                 [5,0,9,4,6,8,2,7,1,3]]
  let carry = 0
  for (const ch of digits) carry = table[carry][parseInt(ch, 10)]
  const check = (10 - carry) % 10
  return digits + String(check)
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return
  if (req.method === 'GET') {
    const { status, year } = req.query
    let q = supabase.from('customer_invoices').select('*, projects(name, client)').order('issue_date', { ascending: false })
    if (status) q = q.eq('status', status)
    if (year) q = q.gte('issue_date', `${year}-01-01`).lte('issue_date', `${year}-12-31`)
    const { data, error } = await q
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  if (req.method === 'POST') {
    const {
      project_id, client_name, client_address, amount, currency,
      issue_date, due_date, iban_recipient, quote_snapshot, notes,
    } = req.body

    if (!client_name || amount == null) return res.status(400).json({ error: 'client_name et amount requis' })

    const year = (issue_date || new Date().toISOString().slice(0, 10)).slice(0, 4)
    const invoice_number = await nextInvoiceNumber(year)
    const qr_reference = qrReference(invoice_number, project_id)

    const { data, error } = await supabase.from('customer_invoices').insert({
      project_id: project_id || null,
      invoice_number,
      client_name,
      client_address,
      amount: parseFloat(amount),
      currency: currency || 'CHF',
      issue_date: issue_date || new Date().toISOString().slice(0, 10),
      due_date: due_date || null,
      iban_recipient: iban_recipient || process.env.AMAZING_LAB_IBAN || null,
      qr_reference,
      quote_snapshot: quote_snapshot || null,
      notes,
    }).select().single()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  }

  return res.status(405).end()
}
