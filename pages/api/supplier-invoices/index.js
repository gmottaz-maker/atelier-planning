import { getSupabaseServer } from '../../../lib/supabase-server'
import { ensureSupplierInvoiceFolder, upload } from '../../../lib/kdrive'
import { requireAdmin } from '../../../lib/requireAdmin'

const supabase = getSupabaseServer()

export const config = { api: { bodyParser: { sizeLimit: '15mb' } } }

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return
  // ── GET : liste ────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { status, year } = req.query
    let query = supabase.from('supplier_invoices').select('*').order('issue_date', { ascending: false })
    if (status) query = query.eq('status', status)
    if (year) {
      query = query.gte('issue_date', `${year}-01-01`).lte('issue_date', `${year}-12-31`)
    }
    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  // ── POST : créer ───────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const {
      supplier_name, invoice_number, amount, amount_net, vat_rate, vat_amount,
      currency, issue_date, due_date,
      payment_reference, iban, category, notes,
      file_base64, file_filename, file_mime_type,
      created_by,
    } = req.body

    if (!supplier_name || amount == null) {
      return res.status(400).json({ error: 'supplier_name et amount requis' })
    }

    let kdrive_file_id = null
    let kdrive_filename = null
    if (file_base64 && file_filename) {
      try {
        const year = (issue_date || new Date().toISOString().slice(0, 10)).slice(0, 4)
        const folderId = await ensureSupplierInvoiceFolder(year)
        const buffer = Buffer.from(file_base64, 'base64')
        const safeName = `${(supplier_name || 'facture').replace(/[^a-zA-Z0-9-_ ]/g, '_')}_${Date.now()}_${file_filename}`.slice(0, 200)
        const kf = await upload(folderId, safeName, buffer, file_mime_type || 'application/pdf')
        kdrive_file_id = kf.id
        kdrive_filename = kf.name
      } catch (e) {
        return res.status(500).json({ error: 'kDrive upload: ' + e.message })
      }
    }

    const { data, error } = await supabase.from('supplier_invoices').insert({
      supplier_name, invoice_number, amount: parseFloat(amount),
      amount_net:  amount_net  != null && amount_net  !== '' ? parseFloat(amount_net)  : null,
      vat_rate:    vat_rate    != null && vat_rate    !== '' ? parseFloat(vat_rate)    : null,
      vat_amount:  vat_amount  != null && vat_amount  !== '' ? parseFloat(vat_amount)  : null,
      currency: currency || 'CHF',
      issue_date: issue_date || null,
      due_date: due_date || null,
      payment_reference, iban, category, notes,
      kdrive_file_id, kdrive_filename,
      created_by,
    }).select().single()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  }

  return res.status(405).end()
}
