// Nommage et classement des justificatifs (frais) sur kDrive.
//
// Cible : Comptabilité <année> / Justificatifs comptables / T<trimestre>
//         — la MÊME branche que les factures fournisseurs (cf. lib/kdrive.js).
// Nom   : <date>_<MARCHAND>_<montant>.pdf
//
// Le trimestre suit la date du ticket. `quarterOf` et `amountTag` sont
// partagés avec les factures : deux façons d'écrire un montant dans un nom de
// fichier finiraient par diverger d'une décimale.
// Extension explicite : les scripts node importent ce module tel quel
// (même raison que `lib/economat.js` → `./annuaire.js`).
import { quarterOf, amountTag } from './supplierFile.js'

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

// Extension déduite du type MIME quand le nom d'origine manque : une photo
// prise depuis le téléphone (page Horaires) n'a pas de nom de fichier, et
// serait sinon enregistrée en .pdf alors que c'est un JPEG.
const EXT_BY_MIME = {
  'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
  'image/gif': 'gif', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif',
}

// ex. 2026-05-12_MIGROS_47.30.pdf
export function receiptFilename({ merchant, amount, date }, originalName = '', mimeType = '') {
  const ext = (/\.([a-z0-9]{1,5})$/i.exec(originalName || '')?.[1]
    || EXT_BY_MIME[String(mimeType || '').toLowerCase()]
    || 'pdf').toLowerCase()
  const d = /^\d{4}-\d{2}-\d{2}$/.test(String(date || '').trim())
    ? date.trim()
    : new Date().toISOString().slice(0, 10)

  const parts = [d, slug(merchant) || 'JUSTIFICATIF']
  const amt = amountTag(amount)
  if (amt) parts.push(amt)
  return `${parts.join('_')}.${ext}`
}
