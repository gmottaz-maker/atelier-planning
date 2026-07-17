import { getSupabaseServer } from '../../../lib/supabase-server'
import { ensureSupplierInvoiceFolder, upload } from '../../../lib/kdrive'
import { requireAdmin } from '../../../lib/requireAdmin'
import { extractPages } from '../../../lib/pdfSplit'
import { quarterOf, supplierInvoiceFilename } from '../../../lib/supplierFile'

const supabase = getSupabaseServer()

export const config = { api: { bodyParser: { sizeLimit: '15mb' } } }

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return
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
      supplier_name, invoice_number, amount, amount_net, vat_rate, vat_amount, vat_breakdown,
      currency, issue_date, due_date,
      payment_reference, iban, category, notes,
      file_base64, file_filename, file_mime_type,
      page_from, page_to,
      created_by, force,
    } = req.body

    if (!supplier_name || amount == null) {
      return res.status(400).json({ error: 'supplier_name et amount requis' })
    }

    // ── Détection de doublon ─────────────────────────────────────────────────
    // Critère 1: même n° de facture chez le même fournisseur (très fiable)
    // Critère 2: même montant + même fournisseur sur ±3 jours (heuristique)
    if (!force) {
      if (invoice_number && supplier_name) {
        const { data: byNumber } = await supabase
          .from('supplier_invoices')
          .select('id, supplier_name, invoice_number, amount, issue_date')
          .ilike('supplier_name', supplier_name)
          .eq('invoice_number', invoice_number)
          .limit(1)
        if (byNumber && byNumber.length > 0) {
          return res.status(409).json({ error: 'duplicate', duplicate_of: byNumber[0], match_on: 'invoice_number' })
        }
      }
      if (issue_date && supplier_name) {
        const amt = parseFloat(amount)
        const d = new Date(issue_date)
        const start = new Date(d); start.setDate(d.getDate() - 3)
        const end   = new Date(d); end.setDate(d.getDate() + 3)
        const dStr = (x) => x.toISOString().slice(0, 10)
        const { data: byAmount } = await supabase
          .from('supplier_invoices')
          .select('id, supplier_name, invoice_number, amount, issue_date')
          .ilike('supplier_name', supplier_name)
          .eq('amount', amt)
          .gte('issue_date', dStr(start))
          .lte('issue_date', dStr(end))
          .limit(1)
        if (byAmount && byAmount.length > 0) {
          return res.status(409).json({ error: 'duplicate', duplicate_of: byAmount[0], match_on: 'amount_date' })
        }
      }
    }

    let kdrive_file_id = null
    let kdrive_filename = null
    if (file_base64 && file_filename) {
      try {
        const { year, quarter } = quarterOf(issue_date)
        const folderId = await ensureSupplierInvoiceFolder(year, quarter)
        let buffer = Buffer.from(file_base64, 'base64')
        // Scan groupé : ne garder que les pages de cette facture. Si le découpage
        // échoue (PDF illisible), on archive le document entier plutôt que rien.
        if ((file_mime_type || '').includes('pdf') && (page_from || page_to)) {
          try { buffer = await extractPages(buffer, page_from, page_to) } catch {}
        }
        const safeName = supplierInvoiceFilename({ supplier_name, invoice_number, issue_date }, file_filename)
        const kf = await upload(folderId, safeName, buffer, file_mime_type || 'application/pdf')
        kdrive_file_id = kf.id
        kdrive_filename = kf.name
      } catch (e) {
        return res.status(500).json({ error: 'kDrive upload: ' + e.message })
      }
    }

    const { data, error } = await supabase.from('supplier_invoices').insert({
      supplier_name, invoice_number, amount: parseFloat(amount),
      amount_net:    amount_net    != null && amount_net    !== '' ? parseFloat(amount_net)  : null,
      vat_rate:      vat_rate      != null && vat_rate      !== '' ? parseFloat(vat_rate)    : null,
      vat_amount:    vat_amount    != null && vat_amount    !== '' ? parseFloat(vat_amount)  : null,
      vat_breakdown: Array.isArray(vat_breakdown) && vat_breakdown.length > 0 ? vat_breakdown : null,
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
