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
