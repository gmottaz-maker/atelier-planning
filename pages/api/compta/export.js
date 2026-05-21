// Export CSV des écritures pour la fiduciaire.
// Une ligne par : facture émise, facture fournisseur, frais.
import { getSupabaseServer } from '../../../lib/supabase-server'
import { requireAdmin } from '../../../lib/requireAdmin'

const supabase = getSupabaseServer()

function esc(s) {
  if (s == null) return ''
  const str = String(s)
  if (/[",;\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`
  return str
}

function fmt(n) {
  if (n == null) return ''
  return parseFloat(n).toFixed(2)
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return
  const { from, to, mode } = req.query
  if (!from || !to) return res.status(400).json({ error: 'from et to (YYYY-MM-DD) requis' })

  const paidOnly = mode === 'paid'

  // Recettes (factures émises)
  const cQuery = supabase.from('customer_invoices')
    .select('*, projects(name)')
    .gte('issue_date', from).lte('issue_date', to)
  if (paidOnly) cQuery.eq('status', 'paid')
  const { data: customerInvoices } = await cQuery

  // Dépenses fournisseurs
  const sQuery = supabase.from('supplier_invoices').select('*')
    .gte('issue_date', from).lte('issue_date', to)
  if (paidOnly) sQuery.eq('status', 'paid')
  const { data: supplierInvoices } = await sQuery

  // Frais employés
  const { data: expenses } = await supabase.from('expenses').select('*')
    .gte('date', from).lte('date', to)

  const rows = []
  for (const inv of customerInvoices || []) {
    rows.push({
      date:     inv.status === 'paid' && inv.paid_at ? inv.paid_at.slice(0, 10) : inv.issue_date,
      type:     'Recette',
      tiers:    inv.client_name,
      description: `Facture ${inv.invoice_number}`,
      reference: inv.invoice_number,
      amount:   inv.amount,
      currency: inv.currency,
      project:  inv.projects?.name || '',
      status:   inv.status,
    })
  }
  for (const inv of supplierInvoices || []) {
    rows.push({
      date:     inv.status === 'paid' && inv.paid_at ? inv.paid_at.slice(0, 10) : inv.issue_date,
      type:     'Dépense',
      tiers:    inv.supplier_name,
      description: inv.notes || inv.category || (inv.invoice_number ? `Facture ${inv.invoice_number}` : ''),
      reference: inv.invoice_number || '',
      amount:   -Math.abs(inv.amount),
      currency: inv.currency,
      project:  '',
      status:   inv.status,
    })
  }
  for (const e of expenses || []) {
    rows.push({
      date:     e.date,
      type:     'Frais',
      tiers:    e.merchant || e.user_name,
      description: e.description || e.category || '',
      reference: '',
      amount:   -Math.abs(e.amount || 0),
      currency: e.currency || 'CHF',
      project:  '',
      status:   '',
    })
  }

  rows.sort((a, b) => (a.date || '').localeCompare(b.date || ''))

  // CSV (séparateur ; pour Excel suisse)
  const header = ['Date', 'Type', 'Tiers', 'Description', 'Référence', 'Montant', 'Devise', 'Projet', 'Statut']
  const lines = [header.join(';')]
  for (const r of rows) {
    lines.push([
      r.date, r.type, esc(r.tiers), esc(r.description), esc(r.reference),
      fmt(r.amount), r.currency, esc(r.project), r.status,
    ].join(';'))
  }

  // Totaux
  const totalIn  = rows.filter(r => r.amount > 0).reduce((s, r) => s + parseFloat(r.amount), 0)
  const totalOut = rows.filter(r => r.amount < 0).reduce((s, r) => s + parseFloat(r.amount), 0)
  lines.push(';;;;TOTAL;' + (totalIn + totalOut).toFixed(2) + ';CHF;;')
  lines.push(';;;;Recettes;' + totalIn.toFixed(2) + ';CHF;;')
  lines.push(';;;;Dépenses;' + totalOut.toFixed(2) + ';CHF;;')

  const csv = '﻿' + lines.join('\n')  // BOM UTF-8 pour Excel
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="compta_${from}_${to}.csv"`)
  res.send(csv)
}
