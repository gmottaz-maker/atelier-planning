// Nommage et classement des pièces justificatives fournisseurs sur kDrive.
// Cible : Factures fournisseurs / <année> / T<trimestre> / <date>_<FOURNISSEUR>_<n°>.pdf
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

// ex. 2026-05-12_BOIS-SA_2026-0451.pdf
export function supplierInvoiceFilename({ supplier_name, invoice_number, issue_date }, originalName = '') {
  const ext = (/\.([a-z0-9]{1,5})$/i.exec(originalName || '')?.[1] || 'pdf').toLowerCase()
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(issue_date || '').trim())
    ? issue_date.trim()
    : new Date().toISOString().slice(0, 10)

  const parts = [date, slug(supplier_name) || 'FOURNISSEUR']
  const num = slug(invoice_number, 30)
  if (num) parts.push(num)
  return `${parts.join('_')}.${ext}`
}
