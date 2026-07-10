// PDF de devis (offre) A4 — thème Amazing Lab (gabarit partagé pdfTemplate).
// ?mode=detailed (lignes par catégorie) | summary (condensé par catégorie).
import PDFDocument from 'pdfkit'
import { getSupabaseServer } from '../../../../lib/supabase-server'
import { requireUser } from '../../../../lib/requireAdmin'
import { header, rule, parties, lineTable, categoryTable, totals, notesBlocks, signatureLine, T, num, fmtCHF } from '../../../../lib/pdfTemplate'

const supabase = getSupabaseServer()
const effMargin = (r, gm) => (r?.margin !== '' && r?.margin != null) ? num(r.margin) : num(gm)
const purchaseBilled = (r, gm) => num(r.unit_price) * num(r.quantity) * (1 + effMargin(r, gm) / 100)
const serviceTotal = r => num(r.rate) * num(r.quantity)
const serviceBilled = (r, gm) => serviceTotal(r) * (1 + effMargin(r, gm) / 100)
const marginLog = r => (r?.margin !== '' && r?.margin != null) ? num(r.margin) : 0
const serviceBilledLog = r => serviceTotal(r) * (1 + marginLog(r) / 100)
const fmtD = d => { const x = new Date(d); return `${String(x.getDate()).padStart(2, '0')}.${String(x.getMonth() + 1).padStart(2, '0')}.${x.getFullYear()}` }
const qtyU = r => `${num(r.quantity) || ''}${r.unit ? ' ' + r.unit : ''}`.trim()

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return
  const { id } = req.query
  const mode = req.query.mode === 'summary' ? 'summary' : 'detailed'

  const { data: project, error } = await supabase.from('projects').select('*').eq('id', id).single()
  if (error || !project) return res.status(404).end()

  const { data: settings } = await supabase.from('app_settings').select('value').eq('key', 'company_info').maybeSingle()
  const company = settings?.value || {
    name: 'Amazing Lab Sàrl', address: "Rue de l'Ecluse 30", zip: '1201', city: 'Genève',
    country: 'CH', email: 'hello@amazinglab.ch', website: 'amazinglab.ch', vat_number: '',
  }

  // Normalisation format
  const rawQ = project.quote_data || {}
  const q = (Array.isArray(rawQ.items) || Array.isArray(rawQ.management))
    ? { management: rawQ.management || [], items: rawQ.items || [], subcontracting: rawQ.subcontracting || [], logistics: rawQ.logistics || [] }
    : { management: [], items: (rawQ.purchases?.length || rawQ.labor?.length) ? [{ name: 'Général', purchases: rawQ.purchases || [], labor: rawQ.labor || [] }] : [], subcontracting: [], logistics: rawQ.logistics || [] }
  const gm = rawQ.general_margin ?? ''

  const allPurchases = (q.items || []).flatMap(it => it.purchases || [])
  const allLabor = (q.items || []).flatMap(it => it.labor || [])
  const managementTotal = (q.management || []).reduce((s, r) => s + serviceTotal(r), 0)
  const purchasesTotal = allPurchases.reduce((s, r) => s + purchaseBilled(r, gm), 0)
  const laborTotal = allLabor.reduce((s, r) => s + serviceTotal(r), 0)
  const subTotal = (q.subcontracting || []).reduce((s, r) => s + serviceBilled(r, gm), 0)
  const logTotal = (q.logistics || []).reduce((s, r) => s + serviceBilledLog(r), 0)
  const net = managementTotal + purchasesTotal + laborTotal + subTotal + logTotal
  const vatRate = 8.1
  const vat = net * vatRate / 100
  const gross = net + vat

  const today = new Date()
  const valid = new Date(today); valid.setDate(valid.getDate() + 30)
  const ref = rawQ.number || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(project.id).slice(-4).toUpperCase()}`

  const doc = new PDFDocument({ size: 'A4', margin: Math.round(18 * 2.83465) })
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename="devis-${ref}.pdf"`)
  doc.pipe(res)

  header(doc, {
    company, title: 'OFFRE',
    meta: [
      { t: `N° ${ref}`, color: T.ink2 },
      { t: `ÉMISE LE ${fmtD(today)}` },
      { t: `VALABLE JUSQU'AU ${fmtD(valid)}` },
    ],
  })
  rule(doc, T.border, 1)

  parties(doc,
    { label: 'DESTINATAIRE', lines: [{ t: project.client || '—', bold: true, size: 12.5 }] },
    {
      label: 'OBJET',
      lines: [
        { t: project.name || '', bold: true, size: 12.5 },
        ...(project.short_description ? [{ t: project.short_description, size: 11, color: T.ink3 }] : []),
        ...(project.deadline ? [{ t: `Livraison prévue : ${fmtD(project.deadline)}`, size: 11, color: T.ink2 }] : []),
      ],
    },
  )

  if (mode === 'summary') {
    const rows = []
    if (managementTotal) rows.push({ cat: 'Gestion projet', amount: managementTotal })
    if (purchasesTotal) rows.push({ cat: 'Achats / matériel', amount: purchasesTotal })
    if (laborTotal) rows.push({ cat: "Main d'œuvre", amount: laborTotal })
    if (subTotal) rows.push({ cat: 'Sous-traitance', amount: subTotal })
    if (logTotal) rows.push({ cat: 'Logistique', amount: logTotal })
    categoryTable(doc, rows)
  } else {
    if ((q.management || []).length) lineTable(doc, {
      label: 'Gestion projet',
      cols: [{ label: 'Prestation', w: 95 }, { label: 'Description', w: 203 }, { label: 'Tarif', w: 55, align: 'right', mono: true }, { label: 'Qté', w: 40, align: 'right', mono: true }, { label: 'Total', w: 100, align: 'right', mono: true, bold: true }],
      rows: q.management.map(r => [r.item, r.description, fmtCHF(num(r.rate)), qtyU(r), fmtCHF(serviceTotal(r))]),
    })
    if (allPurchases.length) lineTable(doc, {
      label: 'Achats / matériel',
      cols: [{ label: 'Article', w: 90 }, { label: 'Description', w: 148 }, { label: 'Dim.', w: 50 }, { label: 'P.U.', w: 55, align: 'right', mono: true }, { label: 'Qté', w: 40, align: 'right', mono: true }, { label: 'Total', w: 110, align: 'right', mono: true, bold: true }],
      rows: allPurchases.map(r => [r.item, r.description, r.dimension || '', fmtCHF(num(r.unit_price)), qtyU(r), fmtCHF(purchaseBilled(r, gm))]),
    })
    if (allLabor.length) lineTable(doc, {
      label: "Main d'œuvre",
      cols: [{ label: 'Prestation', w: 95 }, { label: 'Description', w: 203 }, { label: 'Tarif', w: 55, align: 'right', mono: true }, { label: 'Qté', w: 40, align: 'right', mono: true }, { label: 'Total', w: 100, align: 'right', mono: true, bold: true }],
      rows: allLabor.map(r => [r.item, r.description, fmtCHF(num(r.rate)), qtyU(r), fmtCHF(serviceTotal(r))]),
    })
    if ((q.subcontracting || []).length) lineTable(doc, {
      label: 'Sous-traitance',
      cols: [{ label: 'Prestation', w: 95 }, { label: 'Description', w: 203 }, { label: 'Tarif', w: 55, align: 'right', mono: true }, { label: 'Qté', w: 40, align: 'right', mono: true }, { label: 'Total', w: 100, align: 'right', mono: true, bold: true }],
      rows: q.subcontracting.map(r => [r.item, r.description, fmtCHF(num(r.rate)), qtyU(r), fmtCHF(serviceBilled(r, gm))]),
    })
    if ((q.logistics || []).length) lineTable(doc, {
      label: 'Logistique',
      cols: [{ label: 'Trajet', w: 95 }, { label: 'Description', w: 203 }, { label: 'Tarif', w: 55, align: 'right', mono: true }, { label: 'Qté', w: 40, align: 'right', mono: true }, { label: 'Total', w: 100, align: 'right', mono: true, bold: true }],
      rows: q.logistics.map(r => [r.trajet, r.description, fmtCHF(num(r.rate)), qtyU(r), fmtCHF(serviceBilledLog(r))]),
    })
  }

  totals(doc, { net, vatRate, vat, gross, currency: 'CHF' })

  notesBlocks(doc, [
    { label: 'Conditions', text: 'Offre valable 30 jours. TVA 8.1% incluse dans le total TTC. Acompte de 40 % à la commande.' },
  ])
  signatureLine(doc)

  doc.end()
}
