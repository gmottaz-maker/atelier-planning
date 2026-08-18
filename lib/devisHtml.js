// Construit le HTML du devis (offre) — gabarit de marque (handoff « Offre et
// facture A ») : IBM Plex, accent rose #ea4e6e, tableau à filets, totaux TTC.
// mode: 'detail' | 'summary'.
//
// La facture (lib/factureHtml.js) partage ce gabarit : la mise en page vit
// dans lib/docLayout.js et le repliage des lignes dans buildOfferRows.
import {
  DOC_CSS, DOC_FONTS, docHeader, addressBlock, objectBlock,
  lineTable, bottomBlock, conditions, docFooter, docDocument,
} from './docLayout'
import { fmtCHF } from './money'

const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n }
const effMargin = (r, gm) => (r?.margin !== '' && r?.margin != null) ? num(r.margin) : num(gm)
const purchaseTotal = r => num(r.unit_price) * num(r.quantity)
const purchaseBilled = (r, gm) => purchaseTotal(r) * (1 + effMargin(r, gm) / 100)
const serviceTotal = r => num(r.rate) * num(r.quantity)
const serviceBilled = (r, gm) => serviceTotal(r) * (1 + effMargin(r, gm) / 100)
const marginLog = r => (r?.margin !== '' && r?.margin != null) ? num(r.margin) : 0
const serviceBilledLog = r => serviceTotal(r) * (1 + marginLog(r) / 100)
// Escompte par ligne : % puis montant CHF, appliqués sur le montant facturé (borné à 0).
const applyDisc = (amt, r) => Math.max(0, amt * (1 - num(r.discount) / 100) - num(r.discount_amount))
const purchaseNet = (r, gm) => applyDisc(purchaseBilled(r, gm), r)
const laborNet = r => applyDisc(serviceTotal(r), r)
const serviceNet = (r, gm) => applyDisc(serviceBilled(r, gm), r)
const logisticsNet = r => applyDisc(serviceBilledLog(r), r)
const fmtLong = d => new Date(d).toLocaleDateString('fr-CH', { day: '2-digit', month: 'long', year: 'numeric' })
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
// Libellé escompte à accoler à la description d'une ligne remisée.
function discLabel(r) {
  const p = num(r.discount), a = num(r.discount_amount)
  const parts = []
  if (p) parts.push(`−${String(r.discount).replace('.', ',')} %`)
  if (a) parts.push(`−${fmtCHF(a)} CHF`)
  return parts.length ? `  ·  escompte ${parts.join(' ')}` : ''
}
const withDisc = (desc, r) => `${desc ?? ''}${discLabel(r)}`

// ── Gabarit de marque : aplatissement du devis en lignes ────────────────────
// Le devis a trois niveaux (section → item → ligne) ; le gabarit en a deux
// (prestation → sous-prestation). On replie ainsi :
//   • une ligne de Gestion / Sous-traitance / Logistique = une prestation ;
//   • un item de Fabrication = une prestation, ses lignes = sous-prestations ;
//   • un item qui n'a qu'UNE ligne est fusionné avec elle (sinon on lit deux
//     fois la même chose pour le même montant).
const TVA_RATE = 8.1

// Quantité et unité réunies : le gabarit n'a pas de colonne Unité.
function qtyLabel(r) {
  const q = num(r.quantity)
  if (!q) return ''
  return `${(Math.round(q * 100) / 100).toString().replace('.', ',')}${r.unit ? ' ' + r.unit : ''}`
}

export function buildOfferRows(rawQ, opts = {}) {
  rawQ = rawQ || {}
  // Ancien format plat { purchases, labor, logistics } : on le replie sur un
  // item unique. Les devis et les instantanés de facture d'avant le passage au
  // format groupé sont encore en base.
  const q = (Array.isArray(rawQ.items) || Array.isArray(rawQ.management))
    ? rawQ
    : {
        management: [],
        items: (rawQ.purchases?.length || rawQ.labor?.length)
          ? [{ name: 'Général', purchases: rawQ.purchases || [], labor: rawQ.labor || [] }]
          : [],
        subcontracting: [],
        logistics: rawQ.logistics || [],
        general_margin: rawQ.general_margin,
      }
  const gm = q.general_margin ?? ''
  const rows = []
  const section = (label, total) => rows.push({ kind: 'section', label, total })
  const line = o => rows.push({ kind: 'line', level: 1, ...o })
  const sub  = o => rows.push({ kind: 'line', level: 2, ...o })

  const mgmt = q.management || []
  if (mgmt.length) {
    section('Gestion projet', mgmt.reduce((s, r) => s + laborNet(r), 0))
    for (const r of mgmt) line({
      title: r.item || 'Gestion de projet', desc: withDisc(r.description, r),
      qty: qtyLabel(r), price: num(r.rate), total: laborNet(r),
    })
  }

  const items = q.items || []
  if (items.length) {
    const itemsTotal = items.reduce((s, it) =>
      s + (it.purchases || []).reduce((a, r) => a + purchaseNet(r, gm), 0)
        + (it.labor || []).reduce((a, r) => a + laborNet(r), 0), 0)
    section(opts.itemsLabel || 'Fabrication', itemsTotal)
    for (const it of items) {
      const parts = [
        ...(it.purchases || []).map(r => ({ r, purchase: true })),
        ...(it.labor || []).map(r => ({ r, purchase: false })),
      ]
      const netOf = p => p.purchase ? purchaseNet(p.r, gm) : laborNet(p.r)
      const priceOf = p => p.purchase
        ? num(p.r.unit_price) * (1 + effMargin(p.r, gm) / 100)
        : num(p.r.rate)
      const total = parts.reduce((s, p) => s + netOf(p), 0)

      if (parts.length === 1) {
        // Fusion : le nom de l'item porte la ligne unique
        const p = parts[0]
        const details = [p.r.description, p.r.dimension].filter(Boolean).join(' · ')
        line({
          title: it.name || p.r.description || 'Item',
          desc: withDisc(details, p.r),
          qty: qtyLabel(p.r), price: priceOf(p), total,
        })
        continue
      }
      line({ title: it.name || 'Item', desc: '', qty: '', price: null, total })
      for (const p of parts) sub({
        title: p.r.description || (p.purchase ? 'Matériel' : "Main d'œuvre"),
        desc: withDisc(p.r.dimension || '', p.r),
        qty: qtyLabel(p.r), price: priceOf(p), total: netOf(p),
      })
    }
  }

  const stc = q.subcontracting || []
  if (stc.length) {
    section('Sous-traitance', stc.reduce((s, r) => s + serviceNet(r, gm), 0))
    for (const r of stc) line({
      title: r.item || 'Sous-traitance', desc: withDisc(r.description, r),
      qty: qtyLabel(r), price: num(r.rate) * (1 + effMargin(r, gm) / 100), total: serviceNet(r, gm),
    })
  }

  const lg = q.logistics || []
  if (lg.length) {
    section('Logistique', lg.reduce((s, r) => s + logisticsNet(r), 0))
    for (const r of lg) line({
      title: r.trajet || 'Logistique', desc: withDisc(r.description, r),
      qty: qtyLabel(r), price: num(r.rate) * (1 + marginLog(r) / 100), total: logisticsNet(r),
    })
  }
  return rows
}

// Corps de l'offre. Le PDF (buildDevisHtml) et l'aperçu écran
// (pages/projects/[id]/devis.js) consomment tous deux cette fonction.
export { DOC_CSS as DEVIS_CSS, DOC_FONTS as DEVIS_FONTS }

const TVA_DEFAUT = 8.1

export function buildDevisBody(project, company, mode = 'detail') {
  const rawQ = project.quote_data || {}
  const rows = buildOfferRows(rawQ)
  const netTotal = rows.filter(r => r.kind === 'section').reduce((s, r) => s + r.total, 0)
  const vatRate = rawQ.vat_rate != null && rawQ.vat_rate !== '' ? num(rawQ.vat_rate) : TVA_DEFAUT
  const vat = netTotal * vatRate / 100

  const today = new Date()
  // Numérotation inchangée : celle saisie sur l'offre, sinon le repli historique.
  const ref = rawQ.number || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(project.id).slice(-4).toUpperCase()}`
  const ci = company || {}

  return `<div class="doc"><div class="page"><div class="content">
  ${docHeader([
    { value: fmtLong(today) },
    { label: "N° d'offre", value: ref },
    project.reference ? { label: 'Référence', value: project.reference } : null,
  ], ci.name || 'amazing lab switzerland sàrl')}
  ${addressBlock('Offre à :', project.client, project.client_address)}
  ${objectBlock(project.name, [
    project.short_description,
    project.deadline ? `Livraison prévue : ${fmtLong(project.deadline)}` : null,
  ])}
  ${lineTable(rows, { summary: mode === 'summary' })}
  ${bottomBlock(
    conditions('Conditions :', [
      "Offre valable 30 jours à compter de la date d'émission.",
      'Conditions de paiement : 30 % à la commande, solde à la livraison.',
      'Prix en francs suisses (CHF).',
    ]),
    [
      { label: 'Sous-total', value: netTotal },
      { label: `TVA (${String(vatRate).replace('.', ',')} %)`, value: vat },
      { label: 'Total', value: netTotal + vat, strong: true, rule: true },
    ],
  )}
  ${docFooter(ci)}
  </div></div></div>`
}

// Document complet pour la génération PDF.
export function buildDevisHtml(project, company, mode = 'detail') {
  return docDocument(buildDevisBody(project, company, mode))
}
