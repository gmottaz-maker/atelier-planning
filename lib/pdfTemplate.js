// Gabarit PDF Amazing Lab (offre + facture) — helpers PDFKit.
// Design : handoff_templates_pdf. Couleurs/typo/espacements du thème.
// Note : Space Grotesk / IBM Plex Mono non embarquées → Helvetica + Courier
// comme substituts (mêmes rôles). px du gabarit (96dpi) → pt : ×0.75.
import SVGtoPDF from 'svg-to-pdfkit'
import { AMAZING_LOGO_SVG } from './logo'

export const T = {
  ink: '#241a20', ink2: '#6b5f65', ink3: '#4a3e44', muted: '#9a8d93',
  accent: '#e0506e', border: '#ece3e6', divider: '#f2eaed', faint: '#d3c5cb',
}
export const SANS = 'Helvetica', SANSB = 'Helvetica-Bold', MONO = 'Courier', MONOB = 'Courier-Bold'
export const px = v => v * 0.75
const MM = 2.83465
const PAGE_W = 595.28
export const geom = () => { const L = 18 * MM, R = PAGE_W - 18 * MM; return { L, R, W: R - L } }
export const fmtCHF = n => new Intl.NumberFormat('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)
export const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n }

export function drawLogo(doc, x, y, h) {
  const w = h * (130.84 / 116.93)
  try { SVGtoPDF(doc, AMAZING_LOGO_SVG, x, y, { width: w, height: h }) }
  catch (_) { doc.save().circle(x + h / 2, y + h / 2, h / 2).fill(T.accent).restore() }
  return w
}

// En-tête : logo + raison sociale/adresse à gauche · titre + méta à droite
export function header(doc, { company, title, meta }) {
  const { L, R, W } = geom()
  const top = doc.y
  const logoH = px(64)
  const logoW = drawLogo(doc, L, top, logoH)
  const tx = L + logoW + px(16)

  doc.font(SANSB).fontSize(px(13)).fillColor(T.ink).text((company.name || 'amazing lab').toLowerCase(), tx, top, { width: 260 })
  doc.font(SANS).fontSize(px(11)).fillColor(T.ink2)
  const addr = [company.address, [company.zip, company.city].filter(Boolean).join(' ')].filter(Boolean).join(' · ')
  if (addr) doc.text(addr, tx, doc.y + 2, { width: 260 })
  const contact = [company.email, company.website].filter(Boolean).join(' · ')
  if (contact) doc.text(contact, tx, doc.y, { width: 260 })
  if (company.phone) doc.text(company.phone, tx, doc.y, { width: 260 })
  if (company.vat_number) doc.fillColor(T.muted).text(`N° TVA ${company.vat_number}`, tx, doc.y, { width: 260 })
  const leftBottom = doc.y

  doc.font(SANSB).fontSize(px(26)).fillColor(T.ink).text(title, L, top, { width: W, align: 'right' })
  doc.font(MONO).fontSize(px(11))
  meta.forEach((m, i) => doc.fillColor(m.color || T.muted).text(m.t, L, doc.y + (i === 0 ? px(4) : px(1)), { width: W, align: 'right' }))

  doc.y = Math.max(leftBottom, doc.y, top + logoH) + px(22)
  doc.x = L
}

export function rule(doc, color = T.border, weight = 1) {
  const { L, R } = geom()
  doc.moveTo(L, doc.y).lineTo(R, doc.y).lineWidth(weight).strokeColor(color).stroke()
  doc.y += px(14)
}

// Deux colonnes destinataire / objet
export function parties(doc, left, right) {
  const { L, R } = geom()
  const midX = L + (R - L) / 2 + px(8)
  const top = doc.y
  const block = (x, w, label, lines) => {
    doc.font(MONOB).fontSize(px(9)).fillColor(T.muted).text(label, x, top, { characterSpacing: 0.6, width: w })
    let yy = doc.y + px(3)
    for (const ln of lines) {
      doc.font(ln.bold ? SANSB : SANS).fontSize(px(ln.size || 12)).fillColor(ln.color || T.ink).text(ln.t, x, yy, { width: w })
      yy = doc.y + px(1)
    }
    return yy
  }
  const yL = block(L, (R - L) / 2 - px(16), left.label, left.lines)
  const yR = block(midX, R - midX, right.label, right.lines)
  doc.y = Math.max(yL, yR) + px(18)
  doc.x = L
}

function brk(doc, need = 80) { if (doc.y > 841.89 - 18 * MM - need) { doc.addPage(); doc.y = 18 * MM } }

// Tableau de lignes détaillé. cols: [{label,w,align,mono}] · rows: [values]
export function lineTable(doc, { label, cols, rows }) {
  if (!rows || !rows.length) return
  const { L } = geom()
  brk(doc, 60)
  if (label) { doc.font(MONOB).fontSize(px(9)).fillColor(T.muted).text(label.toUpperCase(), L, doc.y, { characterSpacing: 0.6 }); doc.y += px(6) }
  let x = L; const yh = doc.y
  doc.font(SANSB).fontSize(px(9.5)).fillColor(T.ink)
  cols.forEach(c => { doc.text(c.label, x, yh, { width: c.w, align: c.align }); x += c.w })
  doc.y = yh + px(15)
  doc.moveTo(L, doc.y).lineTo(L + cols.reduce((s, c) => s + c.w, 0), doc.y).lineWidth(1.5).strokeColor(T.ink).stroke()
  doc.y += px(3)
  for (const r of rows) {
    brk(doc, 28)
    const yr = doc.y; let xi = L; let maxH = 0
    r.forEach((v, i) => { doc.font(cols[i].mono ? MONO : SANS).fontSize(px(12)); const h = doc.heightOfString(String(v ?? ''), { width: cols[i].w }); if (h > maxH) maxH = h })
    r.forEach((v, i) => { doc.font(cols[i].mono ? MONO : (cols[i].bold ? SANSB : SANS)).fontSize(px(cols[i].mono ? 12 : 12.5)).fillColor(cols[i].muted ? T.ink3 : T.ink).text(String(v ?? ''), xi, yr, { width: cols[i].w, align: cols[i].align }); xi += cols[i].w })
    doc.y = yr + maxH + px(6)
    doc.moveTo(L, doc.y - px(2)).lineTo(L + cols.reduce((s, c) => s + c.w, 0), doc.y - px(2)).lineWidth(0.6).strokeColor(T.divider).stroke()
  }
  doc.y += px(6)
  doc.x = L
}

// Tableau condensé par catégorie (facture détaillée) : [{cat, sub, amount}]
export function categoryTable(doc, rows, currency = 'CHF') {
  if (!rows || !rows.length) return
  const { L, R, W } = geom()
  brk(doc, 60)
  for (const r of rows) {
    const yr = doc.y
    doc.font(SANSB).fontSize(px(12.5)).fillColor(T.ink).text(r.cat, L, yr, { width: W - 120 })
    if (r.sub) doc.font(SANS).fontSize(px(11)).fillColor(T.muted).text(r.sub, L, doc.y, { width: W - 120 })
    doc.font(MONOB).fontSize(px(12.5)).fillColor(T.ink).text(fmtCHF(r.amount), L, yr, { width: W, align: 'right' })
    doc.y = Math.max(doc.y, yr + px(14)) + px(6)
    doc.moveTo(L, doc.y - px(2)).lineTo(R, doc.y - px(2)).lineWidth(0.6).strokeColor(T.divider).stroke()
  }
  doc.y += px(6)
  doc.x = L
}

// Bloc totaux 260px aligné à droite
export function totals(doc, { net, vatRate, vat, gross, currency = 'CHF' }) {
  const { R } = geom()
  brk(doc, 90)
  const bw = px(260), bx = R - bw
  const line = (label, value, opts = {}) => {
    const yy = doc.y
    doc.font(SANS).fontSize(px(opts.big ? 13.5 : 12.5)).fillColor(opts.big ? T.ink : T.ink3)
    if (opts.big) doc.font(SANSB)
    doc.text(label, bx, yy, { width: bw * 0.5 })
    doc.font(opts.big ? MONOB : MONO).fontSize(px(opts.big ? 16 : 12.5)).fillColor(opts.accent ? T.accent : T.ink3)
      .text(`${fmtCHF(value)} ${currency}`, bx, yy, { width: bw, align: 'right' })
    doc.y = Math.max(doc.y, yy + px(opts.big ? 18 : 15)) + px(1)
  }
  if (net != null) line('Sous-total HT', net)
  if (vat != null) line(`TVA ${vatRate != null ? vatRate + '%' : ''}`, vat)
  doc.moveTo(bx, doc.y + px(4)).lineTo(R, doc.y + px(4)).lineWidth(1.5).strokeColor(T.ink).stroke()
  doc.y += px(10)
  line('Total TTC', gross, { big: true, accent: true })
  doc.x = geom().L
}

// Notes / conditions : label mono + paragraphe
export function notesBlocks(doc, blocks) {
  const { L, W } = geom()
  for (const b of blocks) {
    if (!b.text) continue
    brk(doc, 50)
    doc.moveDown(0.6)
    doc.font(MONOB).fontSize(px(9)).fillColor(T.muted).text(b.label.toUpperCase(), L, doc.y, { characterSpacing: 0.6 })
    doc.font(SANS).fontSize(px(12)).fillColor(T.ink3).text(b.text, L, doc.y + px(3), { width: W })
    doc.x = L
  }
}

// Offre : ligne « Bon pour accord » alignée à droite
export function signatureLine(doc) {
  const { R } = geom()
  brk(doc, 60)
  doc.moveDown(2)
  const bw = px(260), bx = R - bw
  doc.moveTo(bx, doc.y).lineTo(R, doc.y).lineWidth(1).strokeColor(T.faint).stroke()
  doc.y += px(6)
  doc.font(SANS).fontSize(px(10.5)).fillColor(T.muted).text('Bon pour accord — date & signature client', bx, doc.y, { width: bw })
}
