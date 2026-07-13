// Construit le HTML du devis (offre) — reproduit fidèlement pages/projects/[id]/devis.js
// pour un rendu PDF identique via htmlToPdf. mode: 'detail' | 'summary'.

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
export function buildQuoteSections(rawQ, level) {
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
    sections += sectionHeader('Fabrication', itemsTotal)
    for (let idx = 0; idx < q.items.length; idx++) {
      const it = q.items[idx]
      const pSub = (it.purchases || []).reduce((a, r) => a + purchaseNet(r, gm), 0)
      const lSub = (it.labor || []).reduce((a, r) => a + laborNet(r), 0)
      const subTotal = pSub + lSub
      if (subTotal === 0 && !(it.purchases || []).length && !(it.labor || []).length) continue
      sections += `<section style="margin-bottom:${level === 'detail' ? 22 : 6}px;margin-left:14px;margin-top:${level === 'detail' ? 14 : 0}px">
        <h3 style="font-size:12px;font-weight:700;color:#111827;margin-bottom:${level === 'detail' ? 10 : 0}px;padding-bottom:5px;border-bottom:${level === 'detail' ? '1px solid #d1d5db' : 'none'};display:flex;justify-content:space-between;align-items:baseline">
          <span>${esc(it.name || `Item ${idx + 1}`)}</span>
          <span style="font-size:10.5px;font-weight:600;color:#374151;font-variant-numeric:tabular-nums">${fmtCHF(subTotal)} CHF</span></h3>`
      if (level === 'detail') {
        sections += table(
          [{ label: 'Description', width: 'auto', align: 'left' }, { label: 'Dimension', width: '15%', align: 'left' }, { label: 'Qté', width: '7%', align: 'right' }, { label: 'Unité', width: '10%', align: 'left' }, { label: 'Total', width: '13%', align: 'right' }],
          (it.purchases || []).map(r => [withDisc(r.description, r), r.dimension, num(r.quantity), r.unit || '', fmtCHF(purchaseNet(r, gm))]),
          { title: 'Achats / matériel', subtotalLabel: 'Sous-total achats', subtotal: pSub },
        )
        sections += table(
          [{ label: 'Description', width: 'auto', align: 'left' }, { label: 'Qté', width: '8%', align: 'right' }, { label: 'Unité', width: '11%', align: 'left' }, { label: 'Total', width: '14%', align: 'right' }],
          (it.labor || []).map(r => [withDisc(r.description, r), num(r.quantity), r.unit || '', fmtCHF(laborNet(r))]),
          { title: "Main d'œuvre", subtotalLabel: "Sous-total main d'œuvre", subtotal: lSub },
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

export function buildDevisHtml(project, company, mode = 'detail') {
  const level = mode === 'summary' ? 'summary' : 'detail'
  const { html: sections, totals } = buildQuoteSections(project.quote_data, level)
  const grandTotal = totals.grandTotal
  const today = new Date()
  const rawQ = project.quote_data || {}
  const ref = rawQ.number || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(project.id).slice(-4).toUpperCase()}`
  const ci = company || {}
  const ciName = ci.name || 'Amazing Lab'
  const ciAddr = [ci.address, [ci.zip, ci.city].filter(Boolean).join(' '), ci.country].filter(Boolean).join(' · ') || "Rue de l'Ecluse 30 · 1201 Genève · CH"
  const ciContact = [ci.email, ci.website, ci.phone].filter(Boolean).join(' · ')

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 14mm 14mm 18mm 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Inter', sans-serif; color: #111827; font-size: 10px; line-height: 1.5; }
</style></head>
<body>
  <header style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111827;padding-bottom:18px;margin-bottom:28px">
    <div>
      ${ci.logo ? `<img src="${esc(ci.logo)}" alt="" style="max-height:46px;max-width:200px;object-fit:contain;display:block;margin-bottom:8px">` : ''}
      <div style="font-size:11px;font-weight:700;color:#111827;letter-spacing:.12em;text-transform:uppercase;margin-bottom:6px">${esc(ciName)}</div>
      <div style="font-size:9.5px;color:#6b7280">${esc(ciAddr)}</div>
      ${ciContact ? `<div style="font-size:9.5px;color:#6b7280">${esc(ciContact)}</div>` : ''}
      ${ci.vat_number ? `<div style="font-size:9px;color:#9ca3af;margin-top:2px">${esc(ci.vat_number)}</div>` : ''}
    </div>
    <div style="text-align:right">
      <div style="font-size:26px;font-weight:700;color:#111827;letter-spacing:.08em;text-transform:uppercase">Devis</div>
      <div style="font-size:9px;color:#9ca3af;margin-top:6px;letter-spacing:.08em;text-transform:uppercase">Réf. ${esc(ref)}</div>
      <div style="font-size:10px;color:#6b7280;margin-top:2px">${fmtLong(today)}</div>
    </div>
  </header>

  <section style="display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-bottom:32px">
    <div>
      <div style="font-size:9px;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;margin-bottom:5px">Pour</div>
      <div style="font-size:13px;font-weight:600;color:#111827">${esc(project.client || '—')}</div>
    </div>
    <div>
      <div style="font-size:9px;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;margin-bottom:5px">Objet</div>
      <div style="font-size:13px;font-weight:600;color:#111827">${esc(project.name)}</div>
      ${project.short_description ? `<div style="font-size:10px;color:#6b7280;margin-top:3px">${esc(project.short_description)}</div>` : ''}
      ${project.deadline ? `<div style="font-size:10px;color:#6b7280;margin-top:6px">Livraison prévue : ${fmtLong(project.deadline)}</div>` : ''}
    </div>
  </section>

  ${sections}

  <div style="margin-top:28px;padding:16px 20px;background:#111827;color:#fff;border-radius:8px;display:flex;justify-content:space-between;align-items:baseline">
    <span style="font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;opacity:.8">Total HT</span>
    <span style="font-size:22px;font-weight:700;font-variant-numeric:tabular-nums">${fmtCHF(grandTotal)} <span style="font-size:11px;font-weight:500;opacity:.7;margin-left:4px">CHF</span></span>
  </div>

  <footer style="margin-top:32px;font-size:9px;color:#6b7280;line-height:1.7;border-top:1px solid #e5e7eb;padding-top:14px">
    <p style="margin:0 0 3px"><strong style="color:#374151;font-weight:600">Validité :</strong> 30 jours à compter de la date d'émission.</p>
    <p style="margin:0 0 3px"><strong style="color:#374151;font-weight:600">Conditions de paiement :</strong> 30 % à la commande, solde à la livraison.</p>
    <p style="margin:0 0 3px"><strong style="color:#374151;font-weight:600">TVA :</strong> prix indiqués hors taxes.</p>
    <p style="margin:10px 0 0;color:#9ca3af">Devis généré le ${fmtLong(today)} · ${esc(ciName)}</p>
  </footer>
</body></html>`
}
