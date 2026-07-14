// Envoi d'un devis ou d'une facture par e-mail (PDF en pièce jointe) via Resend.
import { getSupabaseServer } from '../../lib/supabase-server'
import { requireAdmin } from '../../lib/requireAdmin'
import { buildDevisHtml } from '../../lib/devisHtml'
import { buildFactureHtml } from '../../lib/factureHtml'
import { htmlToPdf } from '../../lib/htmlToPdf'
import { pdfFilename } from '../../lib/pdfFilename'
import { SwissQRBill } from 'swissqrbill/svg'

export const config = { maxDuration: 30 }

const supabase = getSupabaseServer()
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function cleanEmails(v) {
  return (Array.isArray(v) ? v : [v])
    .flatMap(s => String(s || '').split(/[,;]/))
    .map(s => s.trim())
    .filter(s => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s))
}

async function getCompany() {
  const { data } = await supabase.from('app_settings').select('value').eq('key', 'company_info').maybeSingle()
  return data?.value || { name: 'Amazing Lab', email: 'hello@amazinglab.ch' }
}

// Construit le QR-bill SVG d'une facture (identique à /api/customer-invoices/[id]/pdf).
function invoiceQrSvg(inv, company) {
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
    return new SwissQRBill(qrData, { language: 'FR' }).toString()
  } catch (e) { console.error('QR-bill:', e.message); return '' }
}

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!process.env.RESEND_API_KEY) return res.status(500).json({ error: 'RESEND_API_KEY manquant (config serveur).' })

  const { type, id, mode, subject, message, to, cc } = req.body || {}
  if (!['devis', 'facture'].includes(type)) return res.status(400).json({ error: 'type invalide' })
  if (!id) return res.status(400).json({ error: 'id requis' })
  const toList = cleanEmails(to)
  const ccList = cleanEmails(cc)
  if (!toList.length) return res.status(400).json({ error: 'Au moins un destinataire valide requis.' })
  if (!subject) return res.status(400).json({ error: 'Objet requis.' })

  const company = await getCompany()
  const fromAddr = process.env.MAIL_FROM || company.email || 'hello@amazinglab.ch'
  const fromName = company.name || 'Amazing Lab'
  const bcc = cleanEmails(process.env.MAIL_BCC || fromAddr)

  // ── Génère le PDF + prépare la mise à jour post-envoi ──
  let filename, pdf, afterSend
  try {
    if (type === 'devis') {
      const { data: project, error } = await supabase.from('projects').select('*').eq('id', id).single()
      if (error || !project) return res.status(404).json({ error: 'Projet introuvable' })
      const level = mode === 'summary' ? 'summary' : 'detail'
      pdf = await htmlToPdf(buildDevisHtml(project, company, level))
      filename = pdfFilename('devis', project.name)
      afterSend = async () => {
        const today = new Date().toISOString().slice(0, 10)
        const q = project.quote_data || {}
        const quote_data = { ...q, sent_date: today, status: q.status === 'brouillon' || !q.status ? 'envoye' : q.status }
        await supabase.from('projects').update({ quote_data, updated_at: new Date().toISOString() }).eq('id', id)
      }
    } else {
      const { data: inv, error } = await supabase.from('customer_invoices').select('*, projects(name, client, reference)').eq('id', id).single()
      if (error || !inv) return res.status(404).json({ error: 'Facture introuvable' })
      const effectiveMode = mode || inv.detail_level || 'detailed'
      pdf = await htmlToPdf(buildFactureHtml(inv, company, effectiveMode, invoiceQrSvg(inv, company)))
      filename = pdfFilename('facture', inv.projects?.name || inv.client_name)
      afterSend = async () => {
        const patch = { sent_at: inv.sent_at || new Date().toISOString() }
        if (inv.status === 'created') patch.status = 'sent'
        await supabase.from('customer_invoices').update(patch).eq('id', id)
      }
    }
  } catch (e) {
    console.error('send-document PDF:', e)
    return res.status(500).json({ error: 'Génération du PDF impossible : ' + e.message })
  }

  // ── Corps HTML (texte libre, sauts de ligne conservés) ──
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:#111827;line-height:1.6">${
    esc(message || '').replace(/\n/g, '<br>')
  }</div>`

  // ── Envoi Resend ──
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${fromName} <${fromAddr}>`,
        to: toList,
        cc: ccList.length ? ccList : undefined,
        bcc: bcc.length ? bcc : undefined,
        reply_to: company.email || fromAddr,
        subject,
        html,
        attachments: [{ filename, content: Buffer.from(pdf).toString('base64') }],
      }),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) {
      console.error('Resend error:', data)
      return res.status(502).json({ error: data?.message || `Erreur Resend (${r.status})` })
    }
    try { await afterSend() } catch (e) { console.warn('afterSend:', e?.message) }
    return res.status(200).json({ ok: true, id: data.id })
  } catch (e) {
    console.error('send-document:', e)
    return res.status(500).json({ error: 'Envoi impossible : ' + e.message })
  }
}
