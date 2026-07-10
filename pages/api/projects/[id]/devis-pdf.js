// PDF de devis (offre) généré au code — même approche que la facture.
// ?mode=detailed (lignes) | summary (sections + totaux). Un vrai template
// design viendra plus tard.
import PDFDocument from 'pdfkit'
import { getSupabaseServer } from '../../../../lib/supabase-server'
import { requireUser } from '../../../../lib/requireAdmin'

const supabase = getSupabaseServer()
const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n }
const fmtCHF = n => new Intl.NumberFormat('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)
const effMargin = (r, gm) => (r?.margin !== '' && r?.margin != null) ? num(r.margin) : num(gm)
const purchaseBilled = (r, gm) => num(r.unit_price) * num(r.quantity) * (1 + effMargin(r, gm) / 100)
const serviceTotal = r => num(r.rate) * num(r.quantity)
const serviceBilled = (r, gm) => serviceTotal(r) * (1 + effMargin(r, gm) / 100)
const marginLog = r => (r?.margin !== '' && r?.margin != null) ? num(r.margin) : 0
const serviceBilledLog = r => serviceTotal(r) * (1 + marginLog(r) / 100)
const fmtLong = d => new Date(d).toLocaleDateString('fr-CH', { day: '2-digit', month: 'long', year: 'numeric' })

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return
  const { id } = req.query
  const mode = req.query.mode === 'summary' ? 'summary' : 'detailed'

  const { data: project, error } = await supabase.from('projects').select('*').eq('id', id).single()
  if (error || !project) return res.status(404).end()

  const { data: settings } = await supabase.from('app_settings').select('value').eq('key', 'company_info').maybeSingle()
  const company = settings?.value || {
    name: process.env.AMAZING_LAB_NAME || 'Amazing Lab', address: "Rue de l'Ecluse 30",
    zip: '1201', city: 'Genève', country: 'CH', vat_number: '',
  }

  // Normalisation ancien → nouveau format
  const rawQ = project.quote_data || {}
  const q = (Array.isArray(rawQ.items) || Array.isArray(rawQ.management))
    ? { management: rawQ.management || [], items: rawQ.items || [], subcontracting: rawQ.subcontracting || [], logistics: rawQ.logistics || [] }
    : { management: [], items: (rawQ.purchases?.length || rawQ.labor?.length) ? [{ name: 'Général', purchases: rawQ.purchases || [], labor: rawQ.labor || [] }] : [], subcontracting: [], logistics: rawQ.logistics || [] }
  const gm = rawQ.general_margin ?? ''
  const managementTotal = (q.management || []).reduce((s, r) => s + serviceTotal(r), 0)
  const itemsTotal = (q.items || []).reduce((s, it) => s + (it.purchases || []).reduce((a, r) => a + purchaseBilled(r, gm), 0) + (it.labor || []).reduce((a, r) => a + serviceTotal(r), 0), 0)
  const subTotal = (q.subcontracting || []).reduce((s, r) => s + serviceBilled(r, gm), 0)
  const logTotal = (q.logistics || []).reduce((s, r) => s + serviceBilledLog(r), 0)
  const grand = managementTotal + itemsTotal + subTotal + logTotal
  const today = new Date()
  const ref = rawQ.number || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(project.id).slice(-4).toUpperCase()}`

  const doc = new PDFDocument({ size: 'A4', margin: 40 })
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename="devis-${ref}.pdf"`)
  doc.pipe(res)

  const L = 40, R = 555, W = R - L
  const brk = (need = 60) => { if (doc.y > 800 - need) { doc.addPage(); doc.y = 40 } }

  // ── En-tête ──
  const topY = 44
  doc.fontSize(11).fillColor('#111827').font('Helvetica-Bold').text((company.name || '').toUpperCase(), L, topY, { characterSpacing: 1, width: 300 })
  doc.font('Helvetica').fontSize(8.5).fillColor('#6b7280')
    .text([company.address, [company.zip, company.city].filter(Boolean).join(' '), company.country].filter(Boolean).join(' · '), { width: 300 })
  const contact = [company.email, company.website, company.phone].filter(Boolean).join(' · ')
  if (contact) doc.text(contact, { width: 300 })
  if (company.vat_number) doc.fillColor('#9ca3af').text(company.vat_number, { width: 300 })
  const leftBottom = doc.y

  doc.fontSize(24).fillColor('#111827').font('Helvetica-Bold').text('DEVIS', L, topY, { align: 'right', width: W, characterSpacing: 2 })
  doc.fontSize(8.5).fillColor('#9ca3af').font('Helvetica').text(`RÉF. ${ref}`, L, doc.y, { align: 'right', width: W })
  doc.fillColor('#6b7280').text(fmtLong(today), L, doc.y, { align: 'right', width: W })

  let y = Math.max(leftBottom, doc.y) + 12
  doc.moveTo(L, y).lineTo(R, y).lineWidth(1.5).strokeColor('#111827').stroke()
  doc.y = y + 16

  // ── Pour / Objet ──
  const colY = doc.y
  doc.fontSize(8).fillColor('#9ca3af').font('Helvetica').text('POUR', L, colY, { characterSpacing: 1 })
  doc.fontSize(12).fillColor('#111827').font('Helvetica-Bold').text(project.client || '—', L, doc.y + 2, { width: 240 })
  const leftEnd = doc.y
  doc.fontSize(8).fillColor('#9ca3af').font('Helvetica').text('OBJET', 320, colY, { characterSpacing: 1 })
  doc.fontSize(12).fillColor('#111827').font('Helvetica-Bold').text(project.name || '', 320, doc.y + 2, { width: 235 })
  if (project.short_description) doc.fontSize(9).fillColor('#6b7280').font('Helvetica').text(project.short_description, 320, doc.y + 2, { width: 235 })
  if (project.deadline) doc.fontSize(9).fillColor('#6b7280').font('Helvetica').text(`Livraison prévue : ${fmtLong(project.deadline)}`, 320, doc.y + 4, { width: 235 })
  doc.y = Math.max(leftEnd, doc.y) + 22
  doc.x = L

  function sectionHeader(title, total) {
    brk(50)
    doc.moveDown(0.5)
    const yy = doc.y
    doc.fontSize(11).fillColor('#111827').font('Helvetica-Bold').text(title, L, yy, { width: W - 120 })
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#111827').text(`${fmtCHF(total)} CHF`, L, yy, { align: 'right', width: W })
    const ly = Math.max(doc.y, yy + 12) + 2
    doc.moveTo(L, ly).lineTo(R, ly).lineWidth(0.8).strokeColor('#111827').stroke()
    doc.y = ly + 8
  }
  function table(cols, rows) {
    if (mode === 'summary' || !rows.length) return
    brk(40)
    let x = L; const yh = doc.y
    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#9ca3af')
    cols.forEach(c => { doc.text(c.label, x, yh, { width: c.w, align: c.align }); x += c.w })
    doc.y = yh + 12
    doc.moveTo(L, doc.y).lineTo(R, doc.y).lineWidth(0.4).strokeColor('#e5e7eb').stroke()
    doc.y += 3
    doc.font('Helvetica').fontSize(8.5).fillColor('#374151')
    rows.forEach(r => {
      brk(24)
      const yr = doc.y; let xi = L; let maxH = 0
      r.forEach((v, i) => { const h = doc.heightOfString(String(v ?? ''), { width: cols[i].w }); if (h > maxH) maxH = h })
      r.forEach((v, i) => { doc.text(String(v ?? ''), xi, yr, { width: cols[i].w, align: cols[i].align }); xi += cols[i].w })
      doc.y = yr + maxH + 3
    })
    doc.moveDown(0.4)
  }
  const subLabel = (name, total) => {
    brk(30)
    doc.moveDown(0.3)
    const yy = doc.y
    doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#111827').text(name, L + 6, yy, { width: W - 120 })
    doc.fontSize(9).font('Helvetica').fillColor('#374151').text(`${fmtCHF(total)} CHF`, L, yy, { align: 'right', width: W })
    doc.y = Math.max(doc.y, yy + 12) + 3
  }

  // ── Sections ──
  if ((q.management || []).length) {
    sectionHeader('Gestion projet', managementTotal)
    table(
      [{ label: 'Item', w: 90, align: 'left' }, { label: 'Description', w: 230, align: 'left' }, { label: 'Qté', w: 40, align: 'right' }, { label: 'Unité', w: 55, align: 'left' }, { label: 'Total', w: 100, align: 'right' }],
      q.management.map(r => [r.item, r.description, num(r.quantity) || '', r.unit || '', fmtCHF(serviceTotal(r))]),
    )
  }
  if ((q.items || []).length) {
    sectionHeader('Fabrication', itemsTotal)
    for (const it of q.items) {
      const pSub = (it.purchases || []).reduce((a, r) => a + purchaseBilled(r, gm), 0)
      const lSub = (it.labor || []).reduce((a, r) => a + serviceTotal(r), 0)
      if (!(it.purchases || []).length && !(it.labor || []).length) continue
      subLabel(it.name || 'Item', pSub + lSub)
      table(
        [{ label: 'Achats / matériel', w: 260, align: 'left' }, { label: 'Dim.', w: 60, align: 'left' }, { label: 'Qté', w: 40, align: 'right' }, { label: 'Unité', w: 45, align: 'left' }, { label: 'Total', w: 110, align: 'right' }],
        (it.purchases || []).map(r => [r.description, r.dimension || '', num(r.quantity) || '', r.unit || '', fmtCHF(purchaseBilled(r, gm))]),
      )
      table(
        [{ label: "Main d'œuvre", w: 320, align: 'left' }, { label: 'Qté', w: 40, align: 'right' }, { label: 'Unité', w: 45, align: 'left' }, { label: 'Total', w: 110, align: 'right' }],
        (it.labor || []).map(r => [r.description, num(r.quantity) || '', r.unit || '', fmtCHF(serviceTotal(r))]),
      )
    }
  }
  if ((q.subcontracting || []).length) {
    sectionHeader('Sous-traitance', subTotal)
    table(
      [{ label: 'Item', w: 85, align: 'left' }, { label: 'Description', w: 235, align: 'left' }, { label: 'Qté', w: 40, align: 'right' }, { label: 'Unité', w: 55, align: 'left' }, { label: 'Total', w: 100, align: 'right' }],
      q.subcontracting.map(r => [r.item, r.description, num(r.quantity) || '', r.unit || '', fmtCHF(serviceBilled(r, gm))]),
    )
  }
  if ((q.logistics || []).length) {
    sectionHeader('Logistique', logTotal)
    table(
      [{ label: 'Trajet', w: 90, align: 'left' }, { label: 'Description', w: 230, align: 'left' }, { label: 'Qté', w: 40, align: 'right' }, { label: 'Unité', w: 55, align: 'left' }, { label: 'Total', w: 100, align: 'right' }],
      q.logistics.map(r => [r.trajet, r.description, num(r.quantity) || '', r.unit || '', fmtCHF(serviceBilledLog(r))]),
    )
  }

  // ── Total ──
  brk(60)
  doc.moveDown(1)
  doc.moveTo(L, doc.y).lineTo(R, doc.y).lineWidth(1.5).strokeColor('#111827').stroke()
  doc.moveDown(0.5)
  doc.fontSize(13).font('Helvetica-Bold').fillColor('#111827').text(`TOTAL : ${fmtCHF(grand)} CHF`, L, doc.y, { align: 'right', width: W })
  doc.moveDown(0.4)
  doc.fontSize(8).font('Helvetica').fillColor('#9ca3af').text('Montants en CHF. TVA en sus si applicable. Devis valable 30 jours.', L, doc.y, { align: 'right', width: W })

  doc.end()
}
