// Nommage et classement des justificatifs (frais) sur kDrive.
// Cible : Justificatifs / <année> / T<trimestre> / <date>_<MARCHAND>_<montant>.pdf
// Le trimestre suit la date du ticket. quarterOf est partagé avec les factures.
import { quarterOf } from './supplierFile'

export { quarterOf }

function slug(s, max = 40) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/, '')
}

// Montant pour le nom de fichier : deux décimales, point décimal (47.30).
// Sert à distinguer deux tickets du même commerçant le même jour.
function amountTag(amount) {
  const n = parseFloat(amount)
  return Number.isFinite(n) ? n.toFixed(2) : null
}

// ex. 2026-05-12_MIGROS_47.30.pdf
export function receiptFilename({ merchant, amount, date }, originalName = '') {
  const ext = (/\.([a-z0-9]{1,5})$/i.exec(originalName || '')?.[1] || 'pdf').toLowerCase()
  const d = /^\d{4}-\d{2}-\d{2}$/.test(String(date || '').trim())
    ? date.trim()
    : new Date().toISOString().slice(0, 10)

  const parts = [d, slug(merchant) || 'JUSTIFICATIF']
  const amt = amountTag(amount)
  if (amt) parts.push(amt)
  return `${parts.join('_')}.${ext}`
}
