// Nom de fichier PDF cohérent : « type-nom du projet-JJ_MM_AAAA.pdf »
// Ex. : devis-arche végétale-13_07_2026.pdf
export function pdfFilename(type, projectName, date = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const stamp = `${dd}_${mm}_${d.getFullYear()}`
  const name = (projectName || 'projet').toLowerCase().replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'projet'
  return `${type}-${name}-${stamp}.pdf`
}

/**
 * Nom du PDF d'une OFFRE ou d'une FACTURE : le client, puis le numéro.
 *
 *   « Manor SA - 2026-024.pdf »
 *
 * C'est sous ces deux-là qu'on cherche un document dans un dossier de
 * téléchargements ou dans une pièce jointe — pas sous le nom du projet, que le
 * client ne connaît pas toujours, ni sous la date du jour, qui n'est pas celle
 * du document.
 *
 * Sans numéro — une offre encore en brouillon — la date prend sa place, pour
 * que deux téléchargements successifs ne portent pas le même nom.
 */
export function nomPdfDocument(client, numero, { repli = '', date = new Date() } = {}) {
  const propre = v => String(v || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim()
  const d = date instanceof Date ? date : new Date(date)
  const jour = `${String(d.getDate()).padStart(2, '0')}_${String(d.getMonth() + 1).padStart(2, '0')}_${d.getFullYear()}`

  const qui = propre(client) || propre(repli) || 'document'
  const quoi = propre(numero) || jour
  return `${qui} - ${quoi}.pdf`
}
