// HTML de la facture — même langage visuel que le devis (rendu des lignes
// partagé via buildQuoteSections) + QR-bill SVG en pied.
// mode: 'detailed' (lignes complètes = offre détaillée) | 'summary' (sous-totaux).
import { buildQuoteSections } from './devisHtml'

const fmtCHF = n => new Intl.NumberFormat('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)
const fmtDate = s => { if (!s) return ''; const [y, m, d] = s.split('-'); return `${d}.${m}.${y}` }
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function buildFactureHtml(inv, company, mode, qrSvg) {
  const ci = company || {}
  const ciName = ci.name || 'Amazing Lab'
  const ciAddr = [ci.address, [ci.zip, ci.city].filter(Boolean).join(' '), ci.country].filter(Boolean).join(' · ')
  const ciContact = [ci.email, ci.website, ci.phone].filter(Boolean).join(' · ')
  const cur = inv.currency || 'CHF'

  // Lignes : même rendu que l'offre (détaillé = lignes ; résumé = sous-totaux)
  const level = mode === 'summary' ? 'summary' : 'detail'
  const isStorage = String(inv.object || '').startsWith('Stockage')
  const { html: catRows } = buildQuoteSections(inv.quote_snapshot, level, isStorage ? { itemsLabel: 'Stockage', plainLines: true } : {})

  const hasVat = inv.amount_net != null && inv.vat_amount != null

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Inter', sans-serif; color: #111827; font-size: 10px; line-height: 1.5; }
  .page { min-height: 297mm; display: flex; flex-direction: column; }
  .content { padding: 14mm 14mm 8mm; flex: 1; }
  .qr { width: 210mm; margin-top: auto; }
  .qr svg { display: block; width: 210mm; height: 105mm; }
</style></head>
<body><div class="page"><div class="content">
  <header style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111827;padding-bottom:18px;margin-bottom:28px">
    <div>
      ${ci.logo ? `<img src="${esc(ci.logo)}" alt="" style="max-height:46px;max-width:200px;object-fit:contain;display:block;margin-bottom:8px">` : ''}
      <div style="font-size:11px;font-weight:700;color:#111827;letter-spacing:.12em;text-transform:uppercase;margin-bottom:6px">${esc(ciName)}</div>
      <div style="font-size:9.5px;color:#6b7280">${esc(ciAddr)}</div>
      ${ciContact ? `<div style="font-size:9.5px;color:#6b7280">${esc(ciContact)}</div>` : ''}
      ${ci.vat_number ? `<div style="font-size:9px;color:#9ca3af;margin-top:2px">${esc(ci.vat_number)}</div>` : ''}
    </div>
    <div style="text-align:right">
      <div style="font-size:26px;font-weight:700;color:#111827;letter-spacing:.08em;text-transform:uppercase">Facture</div>
      <div style="font-size:9px;color:#9ca3af;margin-top:6px;letter-spacing:.08em;text-transform:uppercase">N° ${esc(inv.invoice_number)}</div>
      <div style="font-size:10px;color:#6b7280;margin-top:2px">Émise le ${fmtDate(inv.issue_date)}</div>
      ${inv.due_date ? `<div style="font-size:10px;color:#6b7280">Échéance ${fmtDate(inv.due_date)}</div>` : ''}
      ${inv.projects?.reference ? `<div style="font-size:10px;color:#374151;margin-top:6px">Référence : ${esc(inv.projects.reference)}</div>` : ''}
    </div>
  </header>

  <section style="display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-bottom:28px">
    <div>
      <div style="font-size:9px;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;margin-bottom:5px">Facturé à</div>
      <div style="font-size:13px;font-weight:600;color:#111827">${esc(inv.client_name)}</div>
      ${(inv.client_address || '').split('\n').filter(Boolean).map(l => `<div style="font-size:10px;color:#6b7280">${esc(l)}</div>`).join('')}
    </div>
    <div>
      <div style="font-size:9px;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;margin-bottom:5px">Objet</div>
      <div style="font-size:13px;font-weight:600;color:#111827">${esc(inv.projects?.name || inv.object || '—')}</div>
    </div>
  </section>

  ${catRows}

  <div style="margin-top:20px;margin-left:auto;width:300px">
    ${hasVat ? `
    <div style="display:flex;justify-content:space-between;font-size:12px;color:#374151;padding:3px 0"><span>Sous-total HT</span><span style="font-variant-numeric:tabular-nums">${fmtCHF(inv.amount_net)} ${cur}</span></div>
    <div style="display:flex;justify-content:space-between;font-size:12px;color:#374151;padding:3px 0"><span>TVA ${inv.vat_rate != null ? inv.vat_rate + '%' : ''}</span><span style="font-variant-numeric:tabular-nums">${fmtCHF(inv.vat_amount)} ${cur}</span></div>` : ''}
    <div style="margin-top:8px;padding:14px 18px;background:#111827;color:#fff;border-radius:8px;display:flex;justify-content:space-between;align-items:baseline">
      <span style="font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;opacity:.8">Total ${hasVat ? 'TTC' : ''}</span>
      <span style="font-size:20px;font-weight:700;font-variant-numeric:tabular-nums">${fmtCHF(inv.amount)} <span style="font-size:10px;font-weight:500;opacity:.7">${cur}</span></span>
    </div>
  </div>

  ${inv.notes ? `<div style="margin-top:26px"><div style="font-size:9px;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Notes</div><div style="font-size:11px;color:#374151;white-space:pre-wrap">${esc(inv.notes)}</div></div>` : ''}
  ${ci.payment_terms ? `<div style="margin-top:16px"><div style="font-size:9px;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Conditions de paiement</div><div style="font-size:11px;color:#374151">${esc(ci.payment_terms)}</div></div>` : ''}
</div>
${qrSvg ? `<div class="qr">${qrSvg}</div>` : ''}
</div></body></html>`
}
