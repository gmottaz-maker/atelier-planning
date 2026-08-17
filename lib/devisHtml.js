// Construit le HTML du devis (offre) — gabarit de marque (handoff « Offre et
// facture A ») : IBM Plex, accent rose #ea4e6e, tableau à filets, totaux TTC.
// mode: 'detail' | 'summary'.
//
// `buildQuoteSections` (plus bas) reste l'ancien rendu par sections : il sert
// toujours à la FACTURE (lib/factureHtml.js). Ne pas le modifier en croyant
// toucher à l'offre.
import { amazingLogo } from './amazingLogo'

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
const fmtCHF = n => new Intl.NumberFormat('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
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

function sectionHeader(title, total) {
  return `<h2 style="font-size:13px;font-weight:700;color:#111827;margin:22px 0 10px;padding-bottom:6px;border-bottom:2px solid #111827;display:flex;justify-content:space-between;align-items:baseline">
    <span>${esc(title)}</span>
    <span style="font-size:11px;font-weight:600;color:#374151;font-variant-numeric:tabular-nums">Sous-total : ${fmtCHF(total)} CHF</span></h2>`
}

function table(cols, rows, { title, subtotalLabel, subtotal } = {}) {
  if (!rows.length) return ''
  const head = cols.map(c => `<th style="padding:6px 4px;text-align:${c.align};font-size:9px;font-weight:600;color:#6b7280;letter-spacing:.02em;width:${c.width}">${esc(c.label)}</th>`).join('')
  const body = rows.map(row => `<tr style="border-bottom:1px solid #f3f4f6">${row.map((cell, j) => `<td style="padding:6px 4px;vertical-align:top;text-align:${cols[j].align};color:${j === 0 ? '#111827' : '#374151'};font-weight:${j === 0 ? 500 : 400};${cols[j].align === 'right' ? 'font-variant-numeric:tabular-nums' : ''}">${esc(cell)}</td>`).join('')}</tr>`).join('')
  const sub = subtotalLabel ? `<tr><td colspan="${cols.length - 1}" style="padding:6px 4px;text-align:right;font-size:9px;color:#6b7280">${esc(subtotalLabel)}</td><td style="padding:6px 4px;text-align:right;font-weight:700;font-variant-numeric:tabular-nums">${fmtCHF(subtotal)}</td></tr>` : ''
  return `<section style="margin-bottom:18px">
    ${title ? `<h4 style="font-size:8px;font-weight:500;color:#9ca3af;text-transform:uppercase;letter-spacing:.1em;margin-bottom:3px">${esc(title)}</h4>` : ''}
    <table style="width:100%;border-collapse:collapse;font-size:10px">
      <thead><tr style="border-bottom:1px solid #d1d5db">${head}</tr></thead>
      <tbody>${body}${sub}</tbody>
    </table></section>`
}

// Rendu partagé des sections (offre ET facture) — normalise ancien/nouveau format.
// level: 'detail' (lignes) | 'summary' (sous-totaux de section seulement)
// Retourne { html, totals }.
export function buildQuoteSections(rawQ, level, opts = {}) {
  rawQ = rawQ || {}
  const q = (Array.isArray(rawQ.items) || Array.isArray(rawQ.management))
    ? { management: rawQ.management || [], items: rawQ.items || [], subcontracting: rawQ.subcontracting || [], logistics: rawQ.logistics || [] }
    : { management: [], items: (rawQ.purchases?.length || rawQ.labor?.length) ? [{ name: 'Général', purchases: rawQ.purchases || [], labor: rawQ.labor || [] }] : [], subcontracting: [], logistics: rawQ.logistics || [] }
  const gm = rawQ.general_margin ?? ''
  const managementTotal = (q.management || []).reduce((s, r) => s + laborNet(r), 0)
  const itemsTotal = (q.items || []).reduce((s, it) => s + (it.purchases || []).reduce((a, r) => a + purchaseNet(r, gm), 0) + (it.labor || []).reduce((a, r) => a + laborNet(r), 0), 0)
  const subcontractingTotal = (q.subcontracting || []).reduce((s, r) => s + serviceNet(r, gm), 0)
  const logisticsTotal = (q.logistics || []).reduce((s, r) => s + logisticsNet(r), 0)
  const grandTotal = managementTotal + itemsTotal + subcontractingTotal + logisticsTotal

  let sections = ''
  if ((q.management || []).length) {
    sections += sectionHeader('Gestion projet', managementTotal)
    if (level === 'detail') sections += table(
      [{ label: 'Item', width: '18%', align: 'left' }, { label: 'Description', width: 'auto', align: 'left' }, { label: 'Qté', width: '8%', align: 'right' }, { label: 'Unité', width: '11%', align: 'left' }, { label: 'Total', width: '14%', align: 'right' }],
      q.management.map(r => [r.item, withDisc(r.description, r), num(r.quantity), r.unit || '', fmtCHF(laborNet(r))]),
    )
  }
  if ((q.items || []).length) {
    sections += sectionHeader(opts.itemsLabel || 'Fabrication', itemsTotal)
    for (let idx = 0; idx < q.items.length; idx++) {
      const it = q.items[idx]
      const pSub = (it.purchases || []).reduce((a, r) => a + purchaseNet(r, gm), 0)
      const lSub = (it.labor || []).reduce((a, r) => a + laborNet(r), 0)
      const subTotal = pSub + lSub
      if (subTotal === 0 && !(it.purchases || []).length && !(it.labor || []).length) continue
      // Chaque item forme un bloc groupé sous Fabrication : filet vertical à
      // gauche + retrait, pour une hiérarchie claire (bord droit conservé).
      sections += `<section style="margin-bottom:${level === 'detail' ? 20 : 4}px;margin-left:6px;margin-top:${level === 'detail' ? 12 : 0}px;border-left:2px solid ${level === 'detail' ? '#d1d5db' : 'transparent'};padding-left:${level === 'detail' ? 16 : 8}px">
        <h3 style="font-size:12px;font-weight:700;color:#111827;margin:0 0 ${level === 'detail' ? 8 : 0}px;padding:${level === 'detail' ? '4px 8px' : '0'};background:${level === 'detail' ? '#f3f4f6' : 'transparent'};border-radius:4px;display:flex;justify-content:space-between;align-items:baseline">
          <span>${esc(it.name || `Item ${idx + 1}`)}</span>
          <span style="font-size:10.5px;font-weight:600;color:#374151;font-variant-numeric:tabular-nums">${fmtCHF(subTotal)} CHF</span></h3>`
      if (level === 'detail') {
        sections += table(
          [{ label: 'Description', width: 'auto', align: 'left' }, { label: 'Dimension', width: '15%', align: 'left' }, { label: 'Qté', width: '7%', align: 'right' }, { label: 'Unité', width: '10%', align: 'left' }, { label: 'Total', width: '13%', align: 'right' }],
          (it.purchases || []).map(r => [withDisc(r.description, r), r.dimension, num(r.quantity), r.unit || '', fmtCHF(purchaseNet(r, gm))]),
          opts.plainLines ? {} : { title: 'Achats / matériel', subtotalLabel: 'Sous-total achats', subtotal: pSub },
        )
        sections += table(
          [{ label: 'Description', width: 'auto', align: 'left' }, { label: 'Qté', width: '8%', align: 'right' }, { label: 'Unité', width: '11%', align: 'left' }, { label: 'Total', width: '14%', align: 'right' }],
          (it.labor || []).map(r => [withDisc(r.description, r), num(r.quantity), r.unit || '', fmtCHF(laborNet(r))]),
          opts.plainLines ? {} : { title: "Main d'œuvre", subtotalLabel: "Sous-total main d'œuvre", subtotal: lSub },
        )
      }
      sections += `</section>`
    }
  }
  if ((q.subcontracting || []).length) {
    sections += sectionHeader('Sous-traitance', subcontractingTotal)
    if (level === 'detail') sections += table(
      [{ label: 'Item', width: '16%', align: 'left' }, { label: 'Description', width: 'auto', align: 'left' }, { label: 'Qté', width: '8%', align: 'right' }, { label: 'Unité', width: '11%', align: 'left' }, { label: 'Total', width: '14%', align: 'right' }],
      q.subcontracting.map(r => [r.item, withDisc(r.description, r), num(r.quantity), r.unit || '', fmtCHF(serviceNet(r, gm))]),
    )
  }
  if ((q.logistics || []).length) {
    sections += sectionHeader('Logistique', logisticsTotal)
    if (level === 'detail') sections += table(
      [{ label: 'Trajet', width: '16%', align: 'left' }, { label: 'Description', width: 'auto', align: 'left' }, { label: 'Qté', width: '8%', align: 'right' }, { label: 'Unité', width: '11%', align: 'left' }, { label: 'Total', width: '14%', align: 'right' }],
      q.logistics.map(r => [r.trajet, withDisc(r.description, r), num(r.quantity), r.unit || '', fmtCHF(logisticsNet(r))]),
    )
  }
  return { html: sections, totals: { managementTotal, itemsTotal, subcontractingTotal, logisticsTotal, grandTotal } }
}

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

export function buildOfferRows(rawQ) {
  const q = rawQ || {}
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
    section('Fabrication', itemsTotal)
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

// Corps du document, sans <html>/<head> : partagé par le PDF (buildDevisHtml)
// et l'aperçu écran (pages/projects/[id]/devis.js), pour qu'ils ne divergent
// jamais. `DEVIS_CSS` et `DEVIS_FONTS` sont les deux morceaux à injecter.
export const DEVIS_FONTS = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap'
export const DEVIS_CSS = `
  * { box-sizing: border-box; }
  .devis-doc { font-family:'IBM Plex Sans',Helvetica,Arial,sans-serif; color:oklch(0.16 0.005 250); background:#fff; }
  .devis-doc .page { width:210mm; min-height:297mm; padding:18mm 18mm 14mm; display:flex; flex-direction:column; }
  .devis-doc table { width:100%; border-collapse:collapse; font-size:12.5px; }
  /* Impression : ne jamais couper une ligne, ni laisser un titre de section
     seul en bas de page. */
  .devis-doc tr { break-inside:avoid; }
  .devis-doc tr.sec { break-after:avoid; }
  .devis-doc thead { display:table-header-group; }
`

export function buildDevisBody(project, company, mode = 'detail') {
  const summary = mode === 'summary'
  const rawQ = project.quote_data || {}
  const rows = buildOfferRows(rawQ)
  const netTotal = rows.filter(r => r.kind === 'section').reduce((s, r) => s + r.total, 0)
  const vatRate = rawQ.vat_rate != null && rawQ.vat_rate !== '' ? num(rawQ.vat_rate) : TVA_RATE
  const vat = netTotal * vatRate / 100

  const today = new Date()
  // Numérotation inchangée : celle saisie sur l'offre, sinon le repli historique.
  const ref = rawQ.number || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(project.id).slice(-4).toUpperCase()}`
  const ci = company || {}
  const ciName = ci.name || 'amazing lab switzerland sàrl'
  const ciAddr = [ci.address, [ci.zip, ci.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')

  const INK = 'oklch(0.16 0.005 250)', GREY = 'oklch(0.5 0.005 250)', HAIR = 'oklch(0.8 0.005 250)'
  const MONO = "'IBM Plex Mono',ui-monospace,monospace"
  const cell = `font-family:${MONO};font-size:11.5px;`

  const renderRow = r => {
    if (r.kind === 'section') {
      return `<tr class="sec"><td colspan="4" style="padding:22px 0 6px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid ${INK};padding-bottom:5px">
          <span style="font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#ea4e6e">${esc(r.label)}</span>
          <span style="${cell}font-weight:500;color:${GREY}">${fmtCHF(r.total)} CHF</span>
        </div></td></tr>`
    }
    if (summary) return ''
    const pad = r.level === 2 ? 'padding-left:14px;' : ''
    return `<tr style="border-bottom:1px solid ${HAIR}">
      <td style="padding:14px 0">
        <div style="${pad}font-weight:700">${esc(r.title)}</div>
        ${r.desc ? `<div style="${pad}font-weight:400;color:${GREY};font-size:11.5px;margin-top:3px">${esc(r.desc)}</div>` : ''}
      </td>
      <td style="text-align:center;${cell}white-space:nowrap">${esc(r.qty)}</td>
      <td style="text-align:center;${cell}">${r.price ? fmtCHF(r.price) : ''}</td>
      <td style="text-align:right;${cell}">${fmtCHF(r.total)}</td>
    </tr>`
  }

  const totalLine = (label, value, opts = {}) =>
    `<div style="display:flex;justify-content:space-between;padding:6px 0;${opts.strong ? 'font-weight:700;font-size:15px;' : ''}">
       <div>${esc(label)}</div><div style="font-family:${MONO}">${opts.minus ? '– ' : ''}${fmtCHF(value)} CHF</div></div>`

  return `<div class="devis-doc"><div class="page">

  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:24px">
    <div style="display:flex;flex-direction:column;gap:22px;font-weight:600;font-size:13px">
      <div>${fmtLong(today)}</div>
      <div><div>N° d'offre</div><div style="margin-top:2px;font-family:${MONO}">${esc(ref)}</div></div>
      ${project.reference ? `<div><div>Référence</div><div style="margin-top:2px;font-family:${MONO}">${esc(project.reference)}</div></div>` : ''}
    </div>
    <div style="text-align:right">
      <div style="display:flex;justify-content:flex-end">${amazingLogo(64)}</div>
      <div style="font-size:13px;font-weight:600;margin-top:10px">${esc(ciName)}</div>
    </div>
  </div>

  <div style="margin-top:56px;text-align:right">
    <div style="font-size:12px;color:${GREY};margin-bottom:6px">Offre à&nbsp;:</div>
    <div style="font-weight:700;font-size:14px;text-transform:uppercase">${esc(project.client || '—')}</div>
    ${(project.client_address || '').split('\n').filter(Boolean)
      .map(l => `<div style="font-weight:600;font-size:13px;margin-top:2px">${esc(l)}</div>`).join('')}
  </div>

  <div style="margin-top:34px">
    <div style="font-size:12px;color:${GREY}">Objet</div>
    <div style="font-weight:700;font-size:14px;margin-top:2px">${esc(project.name || '')}</div>
    ${project.short_description ? `<div style="font-size:12.5px;color:${GREY};margin-top:3px">${esc(project.short_description)}</div>` : ''}
    ${project.deadline ? `<div style="font-size:12.5px;color:${GREY};margin-top:6px">Livraison prévue&nbsp;: ${fmtLong(project.deadline)}</div>` : ''}
  </div>

  <table style="margin-top:30px">
    <thead><tr style="border-bottom:2px solid ${INK}">
      <th style="text-align:left;font-weight:700;padding:0 0 10px;text-transform:uppercase;letter-spacing:.02em">Description</th>
      <th style="text-align:center;font-weight:700;padding:0 0 10px;width:82px;text-transform:uppercase;letter-spacing:.02em">Qté</th>
      <th style="text-align:center;font-weight:700;padding:0 0 10px;width:110px;text-transform:uppercase;letter-spacing:.02em">Prix</th>
      <th style="text-align:right;font-weight:700;padding:0 0 10px;width:110px;text-transform:uppercase;letter-spacing:.02em">Sous-total</th>
    </tr></thead>
    <tbody>${rows.map(renderRow).join('')}</tbody>
  </table>

  <div style="display:flex;justify-content:space-between;gap:32px;margin-top:44px">
    <div style="font-size:12.5px;max-width:300px">
      <div style="font-weight:700;margin-bottom:8px">Conditions&nbsp;:</div>
      <div style="color:${GREY};line-height:1.6">
        Offre valable 30 jours à compter de la date d'émission.<br>
        Conditions de paiement&nbsp;: 30&nbsp;% à la commande, solde à la livraison.<br>
        Prix en francs suisses (CHF).
      </div>
    </div>
    <div style="width:230px;font-size:13px">
      ${totalLine('Sous-total', netTotal)}
      ${totalLine(`TVA (${String(vatRate).replace('.', ',')} %)`, vat)}
      <div style="height:2px;background:${INK};margin:8px 0"></div>
      ${totalLine('Total', netTotal + vat, { strong: true })}
    </div>
  </div>

  <div style="margin-top:auto;padding-top:18px;border-top:1px solid ${HAIR};display:flex;align-items:center;gap:10px">
    ${amazingLogo(20)}
    <div style="font-size:11px;line-height:1.7">
      <div style="font-weight:700">${esc(ciName)}</div>
      <div style="color:${GREY}">${esc(ciAddr)}${ci.vat_number ? ' · ' + esc(ci.vat_number) + ' TVA' : ''}</div>
    </div>
  </div>
</div></div>`
}

// Document complet pour la génération PDF.
export function buildDevisHtml(project, company, mode = 'detail') {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${DEVIS_FONTS}" rel="stylesheet">
<style>@page { size: A4; margin: 0; } body { margin:0; }${DEVIS_CSS}</style>
</head><body>${buildDevisBody(project, company, mode)}</body></html>`
}

