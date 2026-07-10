// PDF de facture A4 (thème Amazing Lab) + QR-bill suisse au pied de page.
// Auth requise : téléchargé via fetch authentifié, ouvert en blob.
import { getSupabaseServer } from '../../../../lib/supabase-server'
import { requireAdmin } from '../../../../lib/requireAdmin'
import PDFDocument from 'pdfkit'
import { SwissQRBill } from 'swissqrbill/pdf'
import { header, rule, parties, categoryTable, totals, notesBlocks, T, num } from '../../../../lib/pdfTemplate'

const supabase = getSupabaseServer()

function fmtDate(s) {
  if (!s) return ''
  const [y, m, d] = s.split('-')
  return `${d}.${m}.${y}`
}

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return
  const { id } = req.query

  const { data: inv, error } = await supabase
    .from('customer_invoices').select('*, projects(name, client)').eq('id', id).single()
  if (error || !inv) return res.status(404).end()

  const mode = req.query.mode || inv.detail_level || 'detailed'

  const { data: settings } = await supabase
    .from('app_settings').select('value').eq('key', 'company_info').maybeSingle()
  const company = settings?.value || {
    name: process.env.AMAZING_LAB_NAME || 'Amazing Lab Sàrl',
    address: process.env.AMAZING_LAB_ADDRESS || "Rue de l'Ecluse 30",
    zip: process.env.AMAZING_LAB_ZIP || '1201',
    city: process.env.AMAZING_LAB_CITY || 'Genève',
    country: 'CH', iban: process.env.AMAZING_LAB_IBAN || '',
    email: 'hello@amazinglab.ch', website: 'amazinglab.ch', phone: '', vat_number: '',
    payment_terms: 'Paiement à 30 jours net.',
  }

  // Émetteur (swissqrbill)
  const creditor = {
    name: company.name, address: company.address,
    zip: parseInt(String(company.zip).replace(/\D/g, '') || '1201', 10),
    city: company.city, country: company.country || 'CH',
    account: inv.iban_recipient || company.iban || 'CH4431999123000889012',
  }
  const qrData = {
    currency: inv.currency || 'CHF',
    amount: parseFloat(inv.amount),
    reference: inv.qr_reference || undefined,
    message: `Facture ${inv.invoice_number}${inv.projects?.name ? ' · ' + inv.projects.name : ''}`,
    creditor,
    debtor: inv.client_address ? {
      name: inv.client_name,
      address: inv.client_address.split('\n')[0] || '',
      zip: parseInt((inv.client_address.match(/(\d{4})/) || [])[1] || '0', 10),
      city: (inv.client_address.split('\n').pop() || '').replace(/\d{4}\s*/, ''),
      country: 'CH',
    } : undefined,
  }

  const doc = new PDFDocument({ size: 'A4', margin: Math.round(18 * 2.83465) })
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename="facture-${inv.invoice_number}.pdf"`)
  doc.pipe(res)

  // ── En-tête ──
  header(doc, {
    company,
    title: 'FACTURE',
    meta: [
      { t: `N° ${inv.invoice_number}`, color: T.ink2 },
      { t: `ÉMISE LE ${fmtDate(inv.issue_date)}` },
      ...(inv.due_date ? [{ t: `ÉCHÉANCE ${fmtDate(inv.due_date)}` }] : []),
    ],
  })
  rule(doc, T.border, 1)

  // ── Destinataire / objet ──
  const addrLines = (inv.client_address || '').split('\n').filter(Boolean).map(t => ({ t, size: 11, color: T.ink3 }))
  parties(doc,
    { label: 'FACTURÉ À', lines: [{ t: inv.client_name, bold: true, size: 12.5 }, ...addrLines] },
    { label: 'OBJET', lines: [{ t: inv.projects?.name || '—', bold: true, size: 12.5 }] },
  )

  // ── Détail condensé par catégorie (mode détaillé) ──
  if (mode !== 'summary') {
    const q = inv.quote_snapshot || {}
    const purchases = q.purchases || [], labor = q.labor || [], logistics = q.logistics || []
    const pSum = purchases.reduce((s, r) => s + num(r.unit_price) * num(r.quantity) * (1 + num(r.margin) / 100), 0)
    const lSum = labor.reduce((s, r) => s + num(r.rate) * num(r.quantity), 0)
    const gSum = logistics.reduce((s, r) => s + num(r.rate) * num(r.quantity) * (1 + num(r.margin || 0) / 100), 0)
    const sub = arr => arr.slice(0, 3).map(r => r.item || r.trajet || r.description).filter(Boolean).join(', ')
    const rows = []
    if (purchases.length) rows.push({ cat: 'Achats / matériel', sub: sub(purchases), amount: pSum })
    if (labor.length) rows.push({ cat: "Main d'œuvre", sub: sub(labor), amount: lSum })
    if (logistics.length) rows.push({ cat: 'Logistique', sub: sub(logistics), amount: gSum })
    categoryTable(doc, rows, inv.currency || 'CHF')
  }

  // ── Totaux ──
  const hasVat = inv.amount_net != null && inv.vat_amount != null
  totals(doc, {
    net: hasVat ? inv.amount_net : null,
    vatRate: inv.vat_rate,
    vat: hasVat ? inv.vat_amount : null,
    gross: inv.amount,
    currency: inv.currency || 'CHF',
  })

  // ── Notes / conditions ──
  notesBlocks(doc, [
    { label: 'Notes', text: inv.notes },
    { label: 'Conditions de paiement', text: company.payment_terms },
  ])

  // ── QR-bill (zone réservée en pied de page) ──
  try { new SwissQRBill(qrData).attachTo(doc) }
  catch (e) { doc.moveDown(2).fontSize(9).fillColor('#c03d2e').text('⚠ QR-bill : ' + e.message) }

  doc.end()
}
