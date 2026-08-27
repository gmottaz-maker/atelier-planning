// Construit le HTML du devis (offre) — gabarit de marque (handoff « Offre et
// facture A ») : IBM Plex, accent rose #ea4e6e, tableau à filets, totaux TTC.
//
// Un seul format : ce qui apparaît dans le document se règle ligne par ligne
// dans l'éditeur (marqueur `hidden`), plus par un mode détaillé/résumé global.
//
// La facture (lib/factureHtml.js) partage ce gabarit : la mise en page vit
// dans lib/docLayout.js et les lignes dans lib/quoteLines.js.
import {
  DOC_CSS, DOC_FONTS, docHeader, addressBlock, objectBlock,
  lineTable, bottomBlock, conditions, docFooter, docDocument,
} from './docLayout'
import { lignesDevis, totauxDevis } from './quoteLines'
import { fmtCHF } from './money'

const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n }
const fmtLong = d => new Date(d).toLocaleDateString('fr-CH', { day: '2-digit', month: 'long', year: 'numeric' })
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Corps de l'offre. Le PDF (buildDevisHtml) et l'aperçu écran
// (pages/projects/[id]/devis.js) consomment tous deux cette fonction.
export { DOC_CSS as DEVIS_CSS, DOC_FONTS as DEVIS_FONTS }

const TVA_DEFAUT = 8.1

export function buildDevisBody(project, company) {
  const rawQ = project.quote_data || {}
  // `items_label` renomme la section « Fabrication » du devis. Utile pour une
  // offre qui n'a rien à fabriquer — le stockage, par exemple, où un intitulé
  // « FABRICATION » au-dessus de palettes-mois désoriente le service achats du
  // client. Absent, le libellé historique s'applique : aucune offre existante
  // ne change.
  const rows = lignesDevis(rawQ, { fmtCHF, ...(rawQ.items_label ? { itemsLabel: rawQ.items_label } : {}) })
  const netTotal = totauxDevis(rawQ).total
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
  ${lineTable(rows)}
  ${bottomBlock(
    // `conditions` remplace les conditions par défaut. Celles-ci décrivent une
    // fabrication (« 30 % à la commande, solde à la livraison ») : sur une offre
    // de stockage facturée une fois l'an, la ligne est fausse et peut bloquer
    // l'ouverture d'un bon de commande chez le client. Absent, rien ne change.
    conditions('Conditions :', Array.isArray(rawQ.conditions) && rawQ.conditions.length
      ? rawQ.conditions
      : [
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
export function buildDevisHtml(project, company) {
  return docDocument(buildDevisBody(project, company))
}
