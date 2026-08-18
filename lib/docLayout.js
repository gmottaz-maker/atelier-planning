// Mise en page commune des documents commerciaux (offre et facture), d'après
// le handoff « Offre et facture A » : IBM Plex, accent rose de marque, tableau
// à filets, bloc totaux à droite, pied de page avec logo.
//
// L'offre et la facture partagent tout sauf leur en-tête, leur bloc de totaux
// et, pour la facture, le QR-bill en pied. Les deux documents avaient déjà
// divergé une fois faute de code commun.
import { amazingLogo } from './amazingLogo'

export const INK = 'oklch(0.16 0.005 250)'
export const GREY = 'oklch(0.5 0.005 250)'
export const HAIR = 'oklch(0.8 0.005 250)'
export const ACCENT = '#ea4e6e'
export const MONO = "'IBM Plex Mono',ui-monospace,monospace"

export const DOC_FONTS = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap'

export const DOC_CSS = `
  * { box-sizing: border-box; }
  .doc { font-family:'IBM Plex Sans',Helvetica,Arial,sans-serif; color:${INK}; background:#fff; }
  .doc .page { width:210mm; min-height:297mm; display:flex; flex-direction:column; }
  .doc .content { padding:18mm 18mm 14mm; flex:1; display:flex; flex-direction:column; }
  .doc table { width:100%; border-collapse:collapse; font-size:12.5px; }
  /* Le bulletin QR occupe sa propre dernière page, calé en bas (297 − 105 mm).
     Il était auparavant simplement poussé par une marge auto : dès que le
     document dépassait une page, il tombait à cheval sur une coupure et
     s'imprimait en deux moitiés — bulletin inutilisable. Une position calculée
     serait plus économe en papier, mais elle est impossible à viser de façon
     fiable : la règle break-inside sur les lignes décale la pagination réelle
     par rapport à la hauteur mesurée dans le flux. */
  .doc .qr { width:210mm; break-before:page; margin-top:192mm; break-inside:avoid; }
  .doc .qr svg { display:block; width:210mm; height:105mm; }
  /* Impression : ne jamais couper une ligne, ni laisser un titre de section
     seul en bas de page. */
  .doc tr { break-inside:avoid; }
  .doc tr.sec { break-after:avoid; }
  .doc thead { display:table-header-group; }
`

export const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
export const fmtCHF = n => new Intl.NumberFormat('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)

// En-tête : à gauche la date et les références empilées, à droite le logo.
// `entries` : [{ label, value }] — un libellé vide donne une ligne seule.
export function docHeader(entries, companyName) {
  const blocks = entries.filter(Boolean).map(e => e.label
    ? `<div><div>${esc(e.label)}</div><div style="margin-top:2px;font-family:${MONO}">${esc(e.value)}</div></div>`
    : `<div>${esc(e.value)}</div>`).join('')
  return `<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:24px">
    <div style="display:flex;flex-direction:column;gap:22px;font-weight:600;font-size:13px">${blocks}</div>
    <div style="text-align:right">
      <div style="display:flex;justify-content:flex-end">${amazingLogo(64)}</div>
      <div style="font-size:13px;font-weight:600;margin-top:10px">${esc(companyName)}</div>
    </div>
  </div>`
}

// Destinataire, aligné à droite.
export function addressBlock(label, name, address) {
  return `<div style="margin-top:56px;text-align:right">
    <div style="font-size:12px;color:${GREY};margin-bottom:6px">${esc(label)}</div>
    <div style="font-weight:700;font-size:14px;text-transform:uppercase">${esc(name || '—')}</div>
    ${(address || '').split('\n').filter(Boolean)
      .map(l => `<div style="font-weight:600;font-size:13px;margin-top:2px">${esc(l)}</div>`).join('')}
  </div>`
}

// Objet du document, plus d'éventuelles précisions en gris.
export function objectBlock(title, extras = []) {
  return `<div style="margin-top:34px">
    <div style="font-size:12px;color:${GREY}">Objet</div>
    <div style="font-weight:700;font-size:14px;margin-top:2px">${esc(title || '')}</div>
    ${extras.filter(Boolean).map(t => `<div style="font-size:12.5px;color:${GREY};margin-top:3px">${esc(t)}</div>`).join('')}
  </div>`
}

// Tableau des prestations. `rows` vient de buildOfferRows (lib/devisHtml.js).
// En mode résumé, seules les lignes de section sont rendues.
export function lineTable(rows, { summary = false } = {}) {
  const cell = `font-family:${MONO};font-size:11.5px;`
  const head = ['Description', 'Qté', 'Prix', 'Sous-total']
  const width = ['', 'width:82px', 'width:110px', 'width:110px']
  const align = ['left', 'center', 'center', 'right']

  const body = rows.map(r => {
    if (r.kind === 'section') {
      return `<tr class="sec"><td colspan="4" style="padding:22px 0 6px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid ${INK};padding-bottom:5px">
          <span style="font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${ACCENT}">${esc(r.label)}</span>
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
  }).join('')

  return `<table style="margin-top:30px">
    <thead><tr style="border-bottom:2px solid ${INK}">
      ${head.map((h, i) => `<th style="text-align:${align[i]};font-weight:700;padding:0 0 10px;${width[i]};text-transform:uppercase;letter-spacing:.02em">${h}</th>`).join('')}
    </tr></thead>
    <tbody>${body}</tbody>
  </table>`
}

// Bas de document : conditions à gauche, totaux à droite.
// `totals` : [{ label, value, currency, strong, minus, rule }] — `rule` trace
// le filet noir de 2px au-dessus de la ligne.
export function bottomBlock(conditionsHtml, totals) {
  const lines = totals.filter(Boolean).map(t => `
    ${t.rule ? `<div style="height:2px;background:${INK};margin:8px 0"></div>` : ''}
    <div style="display:flex;justify-content:space-between;padding:6px 0;${t.strong ? 'font-weight:700;font-size:15px;' : ''}${t.muted ? `color:${GREY};` : ''}">
      <div>${esc(t.label)}</div>
      <div style="font-family:${MONO};white-space:nowrap">${t.minus ? '− ' : ''}${fmtCHF(t.value)} ${esc(t.currency || 'CHF')}</div>
    </div>`).join('')
  return `<div style="display:flex;justify-content:space-between;gap:32px;margin-top:44px">
    <div style="font-size:12.5px;max-width:300px">${conditionsHtml}</div>
    <div style="width:230px;font-size:13px">${lines}</div>
  </div>`
}

// Paragraphe de conditions : titre gras puis lignes grises.
export function conditions(title, texts) {
  return `<div style="font-weight:700;margin-bottom:8px">${esc(title)}</div>
    <div style="color:${GREY};line-height:1.6">${texts.filter(Boolean).map(esc).join('<br>')}</div>`
}

// Pied de page : logo 20px, raison sociale, adresse et n° TVA.
export function docFooter(company) {
  const ci = company || {}
  const name = ci.name || 'amazing lab switzerland sàrl'
  const addr = [ci.address, [ci.zip, ci.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  return `<div class="doc-footer" style="margin-top:auto;padding-top:18px;border-top:1px solid ${HAIR};display:flex;align-items:center;gap:10px">
    ${amazingLogo(20)}
    <div style="font-size:11px;line-height:1.7">
      <div style="font-weight:700">${esc(name)}</div>
      <div style="color:${GREY}">${esc(addr)}${ci.vat_number ? ' · ' + esc(ci.vat_number) + ' TVA' : ''}</div>
    </div>
  </div>`
}

// Enveloppe le corps d'un document dans une page HTML complète (pour le PDF).
export function docDocument(body) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${DOC_FONTS}" rel="stylesheet">
<style>@page { size: A4; margin: 0; } body { margin:0; }${DOC_CSS}</style>
</head><body>${body}</body></html>`
}
