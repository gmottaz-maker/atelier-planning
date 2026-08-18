// Autorisation d'accès à un fichier kDrive par identifiant.
//
// Le serveur utilise un token kDrive très privilégié : sans contrôle, un
// `fileId` deviné donne accès à n'importe quel fichier du drive, y compris les
// dossiers comptables. On exige donc que le fichier soit référencé dans une
// table de l'application, ET que l'utilisateur ait le droit de le voir.
import { isAdminUser } from './requireAdmin'

const MIME_BY_EXT = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
}
export function mimeFromName(name) {
  const ext = (/\.([a-z0-9]+)$/i.exec(name || '')?.[1] || '').toLowerCase()
  return MIME_BY_EXT[ext] || 'application/pdf'
}

/**
 * Renvoie { filename, mime } si l'utilisateur peut lire ce fichier, sinon null.
 * Un refus et un fichier inexistant renvoient tous deux null : répondre 403
 * confirmerait l'existence du fichier.
 */
export async function authorizeKdriveFile(supabase, fileId, user) {
  const id = Number(fileId)
  if (!Number.isInteger(id) || id <= 0) return null

  const checks = await Promise.all([
    supabase.from('project_files').select('id, filename, mime_type').eq('kdrive_file_id', id).limit(1).maybeSingle(),
    supabase.from('supplier_invoices').select('id, kdrive_filename').eq('kdrive_file_id', id).limit(1).maybeSingle(),
    supabase.from('customer_invoices').select('id, invoice_number').eq('pdf_kdrive_id', id).limit(1).maybeSingle(),
    supabase.from('project_updates').select('id, image_filename, image_mime_type').eq('image_kdrive_id', id).limit(1).maybeSingle(),
    supabase.from('expenses').select('id, kdrive_filename, user_name').eq('kdrive_file_id', id).limit(1).maybeSingle(),
  ])
  const [projectFile, supplierInvoice, customerInvoice, update, expense] = checks.map(c => c.data)
  const found = projectFile || supplierInvoice || customerInvoice || update || expense
  if (!found) return null

  const admin = isAdminUser(user)
  // Pièces comptables : admin uniquement.
  if (!admin && (supplierInvoice || customerInvoice)) return null
  // Frais : son auteur, ou l'admin.
  if (expense && !admin && expense.user_name !== user?.name) return null

  const filename = found.filename || found.kdrive_filename || found.image_filename
    || `facture-${found.invoice_number || id}.pdf`
  return { filename, mime: found.mime_type || found.image_mime_type || mimeFromName(filename) }
}
