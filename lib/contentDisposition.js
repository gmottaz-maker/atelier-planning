// En-tête `Content-Disposition` avec un nom de fichier accentué.
//
// Les en-têtes HTTP ne transportent que de l'ASCII (RFC 7230). Un
// `filename="devis-arche végétale.pdf"` posé tel quel arrive au navigateur avec
// des `?` à la place des accents — c'est ce que voyaient les PDF d'offre et de
// facture.
//
// La solution est RFC 6266 : `filename*=UTF-8''<pourcent-encodé>`, que tous les
// navigateurs actuels comprennent. On garde en plus un `filename=` translittéré
// en ASCII, que la RFC recommande pour les clients qui ignorent `filename*` —
// certains outils de messagerie et de sauvegarde en font partie.

/** Retire accents et caractères non-ASCII, pour le repli `filename=`. */
export function versAscii(nom) {
  return String(nom || 'fichier')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // é → e, è → e, ü → u
    .replace(/[^\x20-\x7E]/g, '')                        // tout ce qui reste hors ASCII imprimable
    .replace(/["\\]/g, '')                               // guillemets et antislashs : ils casseraient l'en-tête
    .trim() || 'fichier'
}

/**
 * Valeur complète de l'en-tête.
 * @param {string} nom          nom du fichier, accents permis
 * @param {'attachment'|'inline'} disposition
 */
export function contentDisposition(nom, disposition = 'attachment') {
  const propre = String(nom || 'fichier').replace(/[\r\n]/g, ' ')
  return `${disposition}; filename="${versAscii(propre)}"; filename*=UTF-8''${encodeURIComponent(propre)}`
}
