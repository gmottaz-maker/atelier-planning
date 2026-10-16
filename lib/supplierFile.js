// Nommage et classement des pièces justificatives fournisseurs sur kDrive.
//
// Cible : Comptabilité <année> / Justificatifs comptables / T<trimestre>
//         (cf. `lib/kdrive.js` — UNE seule branche pour toutes les pièces
//         d'achat depuis le reclassement d'octobre 2026)
//
// Nom : <date>_<FOURNISSEUR>-<n° de facture>_<montant>.pdf
//
// Le format vient de `CONSIGNES-MAZE-PROJECT.md` :
// `AAAA-MM-JJ_FOURNISSEUR-description_montant.pdf`. Le numéro de facture
// occupe l'emplacement « description » — c'est par lui qu'on retrouve une
// pièce dans un relevé fournisseur — et le MONTANT ferme le nom, parce que
// c'est par lui qu'on la retrouve dans un relevé bancaire.
//
// Le trimestre est celui de la date d'émission, comme le décompte TVA.

// Normalise un libellé pour un nom de fichier : sans accent, majuscules, tirets.
function slug(s, max = 40) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/, '')
}

// Année + trimestre d'une date YYYY-MM-DD. Repli sur aujourd'hui si absente ou
// illisible (OCR muet) : la facture est classée au trimestre courant.
// Parsing textuel volontaire — `new Date('2026-01-01')` est du UTC et peut
// basculer sur le trimestre précédent selon le fuseau du serveur.
export function quarterOf(issueDate) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(issueDate || '').trim())
  const now = new Date()
  const year  = m ? Number(m[1]) : now.getFullYear()
  const month = m ? Number(m[2]) : now.getMonth() + 1
  if (!m || month < 1 || month > 12) {
    return { year: now.getFullYear(), quarter: Math.floor(now.getMonth() / 3) + 1 }
  }
  return { year, quarter: Math.floor((month - 1) / 3) + 1 }
}

/**
 * Montant pour un nom de fichier : deux décimales, point décimal (944.15).
 *
 * C'est le TOTAL, jamais un sous-total, un acompte ou un supplément — quatre
 * factures DHL portaient le supplément carburant à la place du total, et on ne
 * les retrouvait dans aucun relevé. Un montant illisible ne met RIEN : un nom
 * sans montant vaut mieux qu'un montant faux.
 */
export function amountTag(amount) {
  const n = parseFloat(amount)
  return Number.isFinite(n) ? n.toFixed(2) : null
}

// ex. 2026-05-12_BOIS-SA-2026-0451_1240.50.pdf
export function supplierInvoiceFilename({ supplier_name, invoice_number, issue_date, amount }, originalName = '') {
  const ext = (/\.([a-z0-9]{1,5})$/i.exec(originalName || '')?.[1] || 'pdf').toLowerCase()
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(issue_date || '').trim())
    ? issue_date.trim()
    : new Date().toISOString().slice(0, 10)

  const fournisseur = slug(supplier_name) || 'FOURNISSEUR'
  const num = slug(invoice_number, 30)
  const parts = [date, num ? `${fournisseur}-${num}` : fournisseur]
  const tag = amountTag(amount)
  if (tag) parts.push(tag)
  return `${parts.join('_')}.${ext}`
}
