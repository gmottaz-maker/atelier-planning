// Génère un PDF de facture A4 avec QR-bill suisse au pied de page.
import { getSupabaseServer } from '../../../../lib/supabase-server'
import PDFDocument from 'pdfkit'
import { SwissQRBill } from 'swissqrbill/pdf'

const supabase = getSupabaseServer()

function fmtCHF(n) {
  return new Intl.NumberFormat('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)
}
function fmtDate(s) {
  if (!s) return ''
  const [y, m, d] = s.split('-')
  return `${d}.${m}.${y}`
}

export default async function handler(req, res) {
  const { id } = req.query

  const { data: inv, error } = await supabase
    .from('customer_invoices').select('*, projects(name, client)').eq('id', id).single()
  if (error || !inv) return res.status(404).end()

  // Données émetteur — adapter via env vars
  const creditor = {
    name:    process.env.AMAZING_LAB_NAME    || 'Amazing Lab Sàrl',
    address: process.env.AMAZING_LAB_ADDRESS || "Rue de l'Ecluse 30",
    zip:     parseInt(process.env.AMAZING_LAB_ZIP || '1201', 10),
    city:    process.env.AMAZING_LAB_CITY    || 'Genève',
    country: 'CH',
    account: process.env.AMAZING_LAB_IBAN    || inv.iban_recipient || 'CH4431999123000889012',
  }

  const qrData = {
    currency:  inv.currency || 'CHF',
    amount:    parseFloat(inv.amount),
    reference: inv.qr_reference || undefined,
    message:   `Facture ${inv.invoice_number}${inv.projects?.name ? ' · ' + inv.projects.name : ''}`,
    creditor,
    debtor: inv.client_address ? {
      name:    inv.client_name,
      address: inv.client_address.split('\n')[0] || '',
      zip:     parseInt((inv.client_address.match(/(\d{4})/) || [])[1] || '0', 10),
      city:    (inv.client_address.split('\n').pop() || '').replace(/\d{4}\s*/, ''),
      country: 'CH',
    } : undefined,
  }

  const doc = new PDFDocument({ size: 'A4', margin: 40 })
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename="facture-${inv.invoice_number}.pdf"`)
  doc.pipe(res)

  // ── Header émetteur ────────────────────────────────────────────────────────
  doc.fontSize(9).fillColor('#111827').font('Helvetica-Bold').text(creditor.name)
  doc.font('Helvetica').fontSize(8).fillColor('#6b7280')
    .text(`${creditor.address} · ${creditor.zip} ${creditor.city} · CH`)
    .text(`hello@amazinglab.ch · amazinglab.ch`)

  doc.moveDown(2)

  // ── Titre ──────────────────────────────────────────────────────────────────
  doc.fontSize(22).fillColor('#111827').font('Helvetica-Bold').text('FACTURE', { align: 'right' })
  doc.fontSize(9).fillColor('#6b7280').font('Helvetica')
    .text(`N° ${inv.invoice_number}`, { align: 'right' })
    .text(`Émise le ${fmtDate(inv.issue_date)}`, { align: 'right' })
  if (inv.due_date) doc.text(`Échéance ${fmtDate(inv.due_date)}`, { align: 'right' })

  doc.moveDown(2)

  // ── Bloc client ────────────────────────────────────────────────────────────
  doc.fontSize(8).fillColor('#9ca3af').text('FACTURÉ À', { underline: false })
  doc.fontSize(11).fillColor('#111827').font('Helvetica-Bold').text(inv.client_name)
  if (inv.client_address) {
    doc.fontSize(9).fillColor('#374151').font('Helvetica')
    inv.client_address.split('\n').forEach(line => doc.text(line))
  }

  doc.moveDown(1.5)

  // ── Objet ──────────────────────────────────────────────────────────────────
  if (inv.projects?.name) {
    doc.fontSize(8).fillColor('#9ca3af').font('Helvetica').text('OBJET')
    doc.fontSize(11).fillColor('#111827').font('Helvetica-Bold').text(inv.projects.name)
    doc.moveDown(0.5)
  }

  // ── Tableau des lignes (depuis quote_snapshot) ─────────────────────────────
  const q = inv.quote_snapshot || {}
  function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n }

  const purchases = q.purchases || []
  const labor     = q.labor || []
  const logistics = q.logistics || []

  function drawSection(title, rows, mapRow) {
    if (rows.length === 0) return
    doc.moveDown(1)
    doc.fontSize(9).fillColor('#111827').font('Helvetica-Bold').text(title.toUpperCase())
    doc.moveDown(0.3)
    const startY = doc.y
    const cols = mapRow.cols
    // Header
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#374151')
    let x = 40
    for (const c of cols) {
      doc.text(c.label, x, doc.y, { width: c.width, align: c.align, continued: false })
      x += c.width
    }
    doc.moveDown(0.3)
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#111827').lineWidth(1).stroke()
    doc.moveDown(0.2)
    // Rows
    doc.font('Helvetica').fontSize(9).fillColor('#374151')
    for (const r of rows) {
      const values = mapRow.values(r)
      let xi = 40
      const yi = doc.y
      let maxH = 0
      for (let i = 0; i < cols.length; i++) {
        const h = doc.heightOfString(values[i] || '', { width: cols[i].width })
        if (h > maxH) maxH = h
      }
      for (let i = 0; i < cols.length; i++) {
        doc.text(values[i] || '', xi, yi, { width: cols[i].width, align: cols[i].align })
        xi += cols[i].width
      }
      doc.y = yi + maxH + 2
      doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#f3f4f6').lineWidth(0.5).stroke()
      doc.moveDown(0.1)
    }
  }

  drawSection('Achats / matériel', purchases, {
    cols: [
      { label: 'Item',        width: 90, align: 'left'  },
      { label: 'Description', width: 180, align: 'left' },
      { label: 'Dimension',   width: 75, align: 'left'  },
      { label: 'P.U.',        width: 55, align: 'right' },
      { label: 'Qté',         width: 35, align: 'right' },
      { label: 'Total',       width: 80, align: 'right' },
    ],
    values: r => [
      r.item || '',
      r.description || '',
      r.dimension || '',
      fmtCHF(num(r.unit_price)),
      String(num(r.quantity) || ''),
      fmtCHF(num(r.unit_price) * num(r.quantity) * (1 + num(r.margin)/100)),
    ],
  })

  drawSection("Main d'œuvre", labor, {
    cols: [
      { label: 'Item',        width: 100, align: 'left'  },
      { label: 'Description', width: 235, align: 'left' },
      { label: 'Tarif',       width: 60,  align: 'right' },
      { label: 'Qté',         width: 35,  align: 'right' },
      { label: 'Total',       width: 85,  align: 'right' },
    ],
    values: r => [r.item || '', r.description || '', fmtCHF(num(r.rate)), String(num(r.quantity) || ''), fmtCHF(num(r.rate)*num(r.quantity))],
  })

  drawSection('Logistique', logistics, {
    cols: [
      { label: 'Trajet',      width: 100, align: 'left'  },
      { label: 'Description', width: 235, align: 'left' },
      { label: 'Tarif',       width: 60,  align: 'right' },
      { label: 'Qté',         width: 35,  align: 'right' },
      { label: 'Total',       width: 85,  align: 'right' },
    ],
    values: r => [r.trajet || '', r.description || '', fmtCHF(num(r.rate)), String(num(r.quantity) || ''), fmtCHF(num(r.rate)*num(r.quantity))],
  })

  // ── Total ──────────────────────────────────────────────────────────────────
  doc.moveDown(1.5)
  doc.fontSize(11).fillColor('#111827').font('Helvetica-Bold')
    .text(`TOTAL : ${fmtCHF(inv.amount)} ${inv.currency || 'CHF'}`, { align: 'right' })

  // Notes
  if (inv.notes) {
    doc.moveDown(1)
    doc.fontSize(8).fillColor('#9ca3af').font('Helvetica').text('NOTES')
    doc.fontSize(9).fillColor('#374151').text(inv.notes, { width: 515 })
  }

  // ── QR-bill au pied de page ────────────────────────────────────────────────
  try {
    new SwissQRBill(qrData).attachTo(doc)
  } catch (e) {
    console.error('QR-bill error:', e.message)
    doc.moveDown(2).fontSize(9).fillColor('#dc2626').text('⚠ Impossible de générer le QR-bill : ' + e.message)
  }

  doc.end()
}
