// PDF de facture — rendu HTML→PDF (Chromium), design identique au devis,
// avec bulletin QR suisse (swissqrbill/svg) en pied de page.
import { getSupabaseServer } from '../../../../lib/supabase-server'
import { requireAdmin } from '../../../../lib/requireAdmin'
import { SwissQRBill } from 'swissqrbill/svg'
import { buildFactureHtml } from '../../../../lib/factureHtml'
import { htmlToPdf } from '../../../../lib/htmlToPdf'
import { pdfFilename } from '../../../../lib/pdfFilename'

export const config = { maxDuration: 30 }

const supabase = getSupabaseServer()

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return
  const { id } = req.query
  const mode = req.query.mode || 'detailed'

  const { data: inv, error } = await supabase
    .from('customer_invoices').select('*, projects(name, client)').eq('id', id).single()
  if (error || !inv) return res.status(404).end()

  const { data: settings } = await supabase
    .from('app_settings').select('value').eq('key', 'company_info').maybeSingle()
  const company = settings?.value || {
    name: 'Amazing Lab Sàrl', address: "Rue de l'Ecluse 30", zip: '1201', city: 'Genève',
    country: 'CH', iban: process.env.AMAZING_LAB_IBAN || '', email: 'hello@amazinglab.ch',
    website: 'amazinglab.ch', vat_number: '', payment_terms: 'Paiement à 30 jours net.',
  }
  const effectiveMode = req.query.mode || inv.detail_level || 'detailed'

  // ── QR-bill (SVG) ──
  let qrSvg = ''
  try {
    const qrData = {
      currency: inv.currency || 'CHF',
      amount: parseFloat(inv.amount),
      reference: inv.qr_reference || undefined,
      message: `Facture ${inv.invoice_number}${inv.projects?.name ? ' · ' + inv.projects.name : ''}`,
      creditor: {
        name: company.name, address: company.address,
        zip: parseInt(String(company.zip).replace(/\D/g, '') || '1201', 10),
        city: company.city, country: company.country || 'CH',
        account: inv.iban_recipient || company.iban || 'CH4431999123000889012',
      },
      debtor: inv.client_address ? {
        name: inv.client_name,
        address: inv.client_address.split('\n')[0] || '',
        zip: parseInt((inv.client_address.match(/(\d{4})/) || [])[1] || '0', 10),
        city: (inv.client_address.split('\n').pop() || '').replace(/\d{4}\s*/, ''),
        country: 'CH',
      } : undefined,
    }
    qrSvg = new SwissQRBill(qrData, { language: 'FR' }).toString()
  } catch (e) {
    console.error('QR-bill:', e.message)
  }

  try {
    const html = buildFactureHtml(inv, company, effectiveMode, qrSvg)
    const pdf = await htmlToPdf(html)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="${pdfFilename('facture', inv.projects?.name || inv.client_name)}"`)
    res.send(Buffer.from(pdf))
  } catch (e) {
    console.error('facture-pdf:', e)
    res.status(500).json({ error: 'Génération PDF impossible : ' + e.message })
  }
}
