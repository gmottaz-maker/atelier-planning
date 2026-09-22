// Réduction d'une image AVANT son envoi.
//
// Deux raisons, et la seconde est la plus sévère :
//
//  1. l'hébergeur refuse toute requête de plus de 4,5 Mo (lib/uploadLimit.js).
//     Un rendu de 8 Mo ne partait pas, et il fallait le redimensionner à la
//     main avant de le déposer ;
//  2. les visuels d'une présentation VOYAGENT DANS LE PDF, encodés en base64 :
//     six rendus de 2 Mo donnaient un document de 29 Mo que Chromium ne
//     finissait pas de dessiner en trente secondes.
//
// 2000 px de large suffisent : une page de deck fait 1920 px, et un cadre y
// occupe au plus la moitié. Au-delà, on transporte des pixels que personne ne
// verra jamais.
//
// La transparence est aplatie sur du BLANC — c'est la couleur des cadres du
// deck, et le JPEG ne sait pas faire autrement. Un rendu d'atelier arrive de
// toute façon sur fond blanc.

export const LARGEUR_MAX = 2000
export const QUALITE = 0.85

/**
 * Dimensions après réduction, en gardant les proportions. Une image déjà plus
 * petite que la limite n'est pas agrandie : on ne fabrique pas de pixels.
 */
export function dimensionsReduites(largeur, hauteur, max = LARGEUR_MAX) {
  const l = Number(largeur) || 0
  const h = Number(hauteur) || 0
  if (l <= 0 || h <= 0) return { largeur: 0, hauteur: 0, reduite: false }
  const cote = Math.max(l, h)
  if (cote <= max) return { largeur: l, hauteur: h, reduite: false }
  const facteur = max / cote
  return { largeur: Math.round(l * facteur), hauteur: Math.round(h * facteur), reduite: true }
}

/**
 * Réduit un fichier image choisi par l'utilisateur et renvoie son base64.
 *
 * Ne lève jamais pour une raison cosmétique : si le navigateur ne sait pas
 * décoder ce fichier, on renvoie l'original tel quel et c'est la route qui
 * tranchera. Mieux vaut un envoi refusé avec un message clair qu'un dépôt
 * silencieusement perdu.
 */
export async function reduireImage(file, { max = LARGEUR_MAX, qualite = QUALITE, gainMinimum = 0.8 } = {}) {
  const enBase64 = blob => new Promise((ok, ko) => {
    const l = new FileReader()
    l.onload = () => ok(String(l.result).split(',')[1])
    l.onerror = ko
    l.readAsDataURL(blob)
  })
  const tel_quel = async raison => ({ base64: await enBase64(file), mime: file.type, reduite: false, raison })

  try {
    const bitmap = await createImageBitmap(file)
    const { largeur, hauteur } = dimensionsReduites(bitmap.width, bitmap.height, max)

    const toile = document.createElement('canvas')
    toile.width = largeur
    toile.height = hauteur
    const ctx = toile.getContext('2d')
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, largeur, hauteur)
    ctx.drawImage(bitmap, 0, 0, largeur, hauteur)
    bitmap.close?.()

    const blob = await new Promise(ok => toile.toBlob(ok, 'image/jpeg', qualite))
    if (!blob) return tel_quel('encodage impossible')

    // Le JPEG n'est gardé que s'il fait vraiment gagner. Sur une photo ou un
    // rendu, il divise par dix ; sur un trait, un plan ou un logo — des aplats
    // et des bords nets — il grossit et salit les contours. C'est la TAILLE qui
    // tranche, pas le format d'origine : les rendus de l'atelier arrivent en
    // PNG alors qu'ils sont photographiques.
    if (blob.size > file.size * gainMinimum) return tel_quel('le format d\'origine est plus léger')
    return { base64: await enBase64(blob), mime: 'image/jpeg', reduite: true, octets: blob.size }
  } catch {
    // Format que le navigateur ne sait pas décoder : on envoie l'original, et
    // c'est la route qui tranchera, avec un message clair.
    return tel_quel('image illisible par le navigateur')
  }
}
