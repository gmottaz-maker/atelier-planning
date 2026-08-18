// HTML de la facture — même gabarit que l'offre (handoff « Offre et facture A »),
// via lib/docLayout.js, plus le QR-bill SVG collé en pied de dernière page.
// Un seul format : la visibilité se règle ligne par ligne dans l'éditeur
// (marqueur `hidden`), plus par un mode détaillé/résumé global. Le paramètre
// `mode` est conservé pour ne pas casser les appelants ; il est ignoré.
import { lignesDevis } from './quoteLines'
import {
  GREY, docHeader, addressBlock, objectBlock, lineTable,
  bottomBlock, conditions, docFooter, docDocument, esc,
} from './docLayout'
import { fmtCHF } from './money'

const fmtDate = s => { if (!s) return ''; const [y, m, d] = s.split('-'); return `${d}.${m}.${y}` }
const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n }

export function buildFactureHtml(inv, company, mode, qrSvg) {
  // `qrSvg` ne sert plus qu'à décider si l'IBAN doit être rappelé en clair :
  // le bulletin lui-même est un document séparé, fusionné au moment du PDF
  // (lib/htmlToPdf.js). Voir qrDocument() dans lib/docLayout.js.
  const ci = company || {}
  const cur = inv.currency || 'CHF'

  // Lignes : même repliage que l'offre. Les factures de stockage titrent leur
  // section « Stockage » plutôt que « Fabrication ».
  // Les factures de stockage titrent leur section « Stockage », pas « Fabrication ».
  const isStorage = String(inv.object || '').startsWith('Stockage')
  const rows = lignesDevis(inv.quote_snapshot, { fmtCHF, ...(isStorage ? { itemsLabel: 'Stockage' } : {}) })

  // Les totaux viennent des colonnes de la facture, pas du recalcul des lignes :
  // une facture émise ne doit plus bouger si un barème change.
  const hasVat = inv.amount_net != null && inv.vat_amount != null

  // Escompte global : amount_net est le net APRÈS escompte, on remonte au
  // sous-total d'origine pour afficher la remise en clair.
  const discRate = num(inv.discount_rate)
  const discFixed = num(inv.discount_amount)
  const hasDiscount = hasVat && (discRate > 0 || discFixed > 0)
  // Dénominateur nul à 100 % de remise → on retombe sur net + montant fixe.
  const denom = 1 - discRate / 100
  const grossSubtotal = hasDiscount
    ? Math.round((denom > 0 ? (num(inv.amount_net) + discFixed) / denom : num(inv.amount_net) + discFixed) * 100) / 100
    : num(inv.amount_net)
  const discountValue = Math.round((grossSubtotal - num(inv.amount_net)) * 100) / 100
  const discountLabel = inv.discount_label || (discRate > 0 ? `Escompte ${discRate} %` : 'Escompte')

  const totals = hasDiscount
    ? [
        { label: 'Sous-total HT', value: grossSubtotal, currency: cur },
        { label: discountLabel, value: discountValue, currency: cur, minus: true, muted: true },
        { label: 'Net HT', value: inv.amount_net, currency: cur },
        { label: `TVA${inv.vat_rate != null ? ` (${String(inv.vat_rate).replace('.', ',')} %)` : ''}`, value: inv.vat_amount, currency: cur },
        { label: 'Total à payer', value: inv.amount, currency: cur, strong: true, rule: true },
      ]
    : hasVat
      ? [
          { label: 'Sous-total HT', value: inv.amount_net, currency: cur },
          { label: `TVA${inv.vat_rate != null ? ` (${String(inv.vat_rate).replace('.', ',')} %)` : ''}`, value: inv.vat_amount, currency: cur },
          { label: 'Total à payer', value: inv.amount, currency: cur, strong: true, rule: true },
        ]
      : [{ label: 'Total à payer', value: inv.amount, currency: cur, strong: true, rule: true }]

  // L'IBAN n'est rappelé que sans QR-bill : le bulletin le porte déjà.
  const iban = inv.iban_recipient || ci.iban
  const left = conditions('Conditions de paiement :', [
    ci.payment_terms || 'Paiement à 30 jours net.',

    !qrSvg && iban ? `IBAN : ${iban}` : null,
  ]) + (inv.notes
    ? `<div style="margin-top:14px;font-weight:700;margin-bottom:6px">Notes :</div><div style="color:${GREY};line-height:1.6;white-space:pre-wrap">${esc(inv.notes)}</div>`
    : '')

  return docDocument(`<div class="doc"><div class="page"><div class="content">
  ${docHeader([
    { value: fmtDate(inv.issue_date) },
    { label: 'N° de facture', value: inv.invoice_number },
    inv.due_date ? { label: 'Échéance', value: fmtDate(inv.due_date) } : null,
    inv.projects?.reference ? { label: 'Référence', value: inv.projects.reference } : null,
  ], ci.name || 'amazing lab switzerland sàrl')}
  ${addressBlock('Facturé à :', inv.client_name, inv.client_address)}
  ${objectBlock(inv.projects?.name || inv.object || '—', [
    inv.projects?.name && inv.object && inv.object !== inv.projects.name ? inv.object : null,
  ])}
  ${lineTable(rows)}
  ${bottomBlock(left, totals)}
  ${docFooter(ci)}
  </div></div></div>`)
}
