// Export du journal comptable en partie double (plan comptable suisse PME).
// ?from=YYYY-MM-DD&to=YYYY-MM-DD[&format=csv|json]
import { getSupabaseServer } from '../../../lib/supabase-server'
import { requireAdmin } from '../../../lib/requireAdmin'
import { buildJournal, vatSummary } from '../../../lib/comptaJournal'

const supabase = getSupabaseServer()

const esc = s => {
  if (s == null) return ''
  const str = String(s)
  return /[";\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return
  const { from, to, format } = req.query
  if (!from || !to) return res.status(400).json({ error: 'from et to (YYYY-MM-DD) requis' })

  const [c, s, e, b, m] = await Promise.all([
    supabase.from('customer_invoices').select('*, projects(name)').gte('issue_date', from).lte('issue_date', to),
    supabase.from('supplier_invoices').select('*').gte('issue_date', from).lte('issue_date', to),
    supabase.from('expenses').select('*').gte('date', from).lte('date', to),
    supabase.from('bank_transactions').select('*').gte('booking_date', from).lte('booking_date', to).not('matched_to_type', 'is', null),
    supabase.from('account_mappings').select('*'),
  ])
  const err = [c, s, e, b, m].find(x => x.error)
  if (err) return res.status(500).json({ error: err.error.message })

  const { lines, totalDebit } = buildJournal({
    customerInvoices: c.data || [], supplierInvoices: s.data || [],
    expenses: e.data || [], bankTx: b.data || [], mappings: m.data || [],
  })
  const tva = vatSummary(lines)

  if (format === 'json') return res.status(200).json({ lines, totalDebit, tva })

  const cols = ['Date', 'Pièce', 'Libellé', 'Tiers', 'Débit', 'Crédit', 'Montant', 'Taux TVA', 'Type']
  const rows = lines.map(l => [l.date, l.piece, l.libelle, l.tiers, l.debit, l.credit, l.montant.toFixed(2), l.taux ?? '', l.type].map(esc).join(';'))
  const csv = [cols.join(';'), ...rows].join('\r\n')

  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="journal-${from}_${to}.csv"`)
  return res.send('﻿' + csv)   // BOM pour Excel
}
