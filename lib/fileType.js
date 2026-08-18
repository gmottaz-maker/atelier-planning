// Contrôle du type réel des fichiers déposés.
//
// Les routes d'upload acceptaient le nom et le type MIME annoncés par le
// navigateur, et les routes de lecture resservaient ensuite le fichier en
// `inline` sur le domaine de Maze. Un HTML ou un SVG déposé sous un type
// anodin s'exécutait donc en JavaScript dans l'origine de l'application, avec
// la session de qui l'ouvrait — XSS stockée.
//
// On ne fait donc confiance ni au type MIME, ni à l'extension, ni à la taille
// annoncés : tout est déduit du contenu réel.

// Types acceptés au stockage. Le HEIC en fait partie : c'est le format natif
// des photos iPhone, et la page des frais (pages/schedule.js) envoie le fichier
// tel quel. Il est inerte — aucun script possible — mais jamais servi en inline.
export const TYPES_AUTORISES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']

// Seules ces images peuvent être servies `inline` : leur contenu a été vérifié
// et aucune ne peut porter de script (contrairement au SVG).
export const TYPES_INLINE = ['image/jpeg', 'image/png', 'image/webp']

export const EXT_PAR_TYPE = {
  'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'image/heic': 'heic',
}

const commence = (buf, octets, offset = 0) =>
  octets.every((o, i) => buf[offset + i] === o)

/** Type MIME déduit de la signature binaire, ou null si non reconnu. */
export function typeReel(buffer) {
  const b = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || [])
  if (b.length < 12) return null
  if (commence(b, [0x25, 0x50, 0x44, 0x46])) return 'application/pdf'            // %PDF
  if (commence(b, [0xFF, 0xD8, 0xFF])) return 'image/jpeg'
  if (commence(b, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) return 'image/png'
  if (commence(b, [0x52, 0x49, 0x46, 0x46]) && commence(b, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp'
  if (commence(b, [0x66, 0x74, 0x79, 0x70], 4)) {                                 // boîte ftyp
    const marque = b.subarray(8, 12).toString('latin1')
    if (['heic', 'heix', 'hevc', 'heim', 'heis', 'hevm', 'mif1', 'msf1'].includes(marque)) return 'image/heic'
  }
  return null
}

/**
 * Valide un fichier déposé. Renvoie { ok: true, mime, ext, size } ou
 * { ok: false, status, error }.
 */
export function validerFichier(buffer, { maxOctets } = {}) {
  const b = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || [])
  if (b.length === 0) return { ok: false, status: 400, error: 'Fichier vide' }
  // La taille se mesure sur le contenu décodé, jamais sur le champ envoyé.
  if (maxOctets && b.length > maxOctets) {
    return { ok: false, status: 413, error: `Fichier trop grand (max ${Math.round(maxOctets / 1024 / 1024)} Mo)` }
  }
  const mime = typeReel(b)
  if (!mime || !TYPES_AUTORISES.includes(mime)) {
    return { ok: false, status: 415, error: 'Type de fichier non autorisé (PDF, JPEG, PNG, WebP ou HEIC)' }
  }
  return { ok: true, mime, ext: EXT_PAR_TYPE[mime], size: b.length }
}

/** Nom assaini : ni chemin, ni caractère de contrôle, extension conforme au type réel. */
export function nomSur(nom, mime) {
  const base = String(nom || 'fichier')
    .replace(/[\\/]/g, '_')
    .replace(/[\u0000-\u001f\u007f"]/g, '')
    .replace(/^\.+/, '')
    .slice(0, 120) || 'fichier'
  const ext = EXT_PAR_TYPE[mime]
  const sansExt = base.replace(/\.[a-z0-9]{1,5}$/i, '')
  return ext ? `${sansExt}.${ext}` : sansExt
}

/**
 * Pose les en-têtes de réponse d'un fichier utilisateur.
 * Tout ce qui n'est pas une image vérifiée part en pièce jointe : un PDF servi
 * `inline` peut porter du JavaScript exécuté par le lecteur du navigateur.
 */
export function entetesFichier(res, { mime, filename }) {
  const type = TYPES_AUTORISES.includes(mime) ? mime : 'application/octet-stream'
  const disposition = TYPES_INLINE.includes(type) ? 'inline' : 'attachment'
  res.setHeader('Content-Type', type)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Cache-Control', 'private, no-store')
  res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(filename || 'fichier')}`)
}
