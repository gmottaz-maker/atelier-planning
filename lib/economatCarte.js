// La carte Kanban physique : A6 paysage, quatre par feuille A4.
//
// LA FEUILLE EST UN A4 PAYSAGE, et ce n'est pas un détail de goût. A6 paysage
// = 148 × 105 mm ; 2 × 148,5 = 297 et 2 × 105 = 210. Quatre cartes tombent
// pile sur un A4 couché, et sur aucun A4 debout. C'est le genre de chose qui
// se découvre devant l'imprimante.
//
// Les marges viennent de `@page`, jamais d'un padding : un padding ne
// s'applique qu'au début et à la fin du bloc, et à partir de la page 2 le
// contenu touchait le bord du papier (déjà payé sur les factures). Ici la
// marge est nulle de toute façon — les cartes doivent atteindre la coupe.
//
// Ce qui N'EST PAS imprimé : l'état courant et le stock cible. Ils changent,
// la carte non. Ni l'URL : c'est le QR qui mène au bouton « Commander ».
import { readFileSync } from 'fs'
import { join } from 'path'
import { couleurDe, categorieDe, nomFournisseur } from './economat.js'

const esc = s => String(s === null || s === undefined ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Les Apercu Pro en base64 : la fonte EST la marque, et Chromium n'ira pas
 *  la chercher sur le réseau depuis une fonction serverless. */
export function policesEmbarquees(racine = process.cwd()) {
  const faces = [['apercu-pro-400.woff2', 400], ['apercu-pro-500.woff2', 500], ['apercu-pro-700.woff2', 700]]
  const css = []
  for (const [nom, poids] of faces) {
    try {
      const b64 = readFileSync(join(racine, 'public', 'fonts', nom)).toString('base64')
      css.push(`@font-face{font-family:'Apercu Pro';font-style:normal;font-weight:${poids};font-display:block;src:url(data:font/woff2;base64,${b64}) format('woff2')}`)
    } catch {
      // Fonte introuvable : la carte se rend dans la fonte système plutôt que
      // de ne pas se rendre du tout.
    }
  }
  return css.join('\n')
}

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
@page{size:A4 landscape;margin:0}
html,body{width:297mm}
body{font-family:'Apercu Pro',system-ui,sans-serif;color:#0C0C0C;-webkit-print-color-adjust:exact;print-color-adjust:exact}

.feuille{width:297mm;height:210mm;position:relative;page-break-after:always;overflow:hidden}
.feuille:last-child{page-break-after:auto}
.grille{display:grid;grid-template-columns:148.5mm 148.5mm;grid-template-rows:105mm 105mm;width:297mm;height:210mm}

/* Repères de coupe : des traits courts aux bords, pas un cadre. Une coupe
   légèrement de travers ne laisse alors pas un demi-cadre le long de la
   carte — elle laisse du blanc, ce qui ne se voit pas. */
.repere{position:absolute;background:#6b6b6b}
.rv{width:.25mm;height:7mm;left:148.4mm}
.rh{height:.25mm;width:7mm;top:104.9mm}

.carte{width:148.5mm;height:105mm;display:flex;flex-direction:column;overflow:hidden}
.vide{width:148.5mm;height:105mm}

.bandeau{height:11mm;flex:none;display:flex;align-items:center;justify-content:space-between;
  padding:0 5mm;color:#0C0C0C}
.bandeau .cat{font-size:8pt;font-weight:500;letter-spacing:.09em;text-transform:uppercase;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bandeau .code{font-family:ui-monospace,Menlo,monospace;font-size:8pt;font-weight:500;flex:none;padding-left:4mm}

/* La photo et le QR à gauche, tout ce qui se lit à droite. Le QR est posé en
   bas de colonne : sur une carte glissée dans un bac, c'est le coin qui
   dépasse, et c'est lui qu'on vise avec le téléphone. */
.corps{flex:1;display:flex;gap:5mm;padding:4mm 5mm 4mm;min-height:0}
.gauche{width:42mm;flex:none;display:flex;flex-direction:column}
.photo{width:42mm;height:42mm;border:.3mm solid #0C0C0C;border-radius:2mm;overflow:hidden;
  display:flex;align-items:center;justify-content:center;background:#fff}
.photo img{width:100%;height:100%;object-fit:cover}
.photo .absente{font-size:6.5pt;color:#888;letter-spacing:.06em;text-transform:uppercase}
.qr{margin-top:auto;text-align:center;width:42mm}
.qr svg{width:21mm;height:21mm;display:block;margin:0 auto}
.qr .legende{font-size:6pt;letter-spacing:.06em;text-transform:uppercase;color:#888;margin-top:.8mm}

.droite{flex:1;min-width:0;display:flex;flex-direction:column;min-height:0}
.titre{font-size:15pt;font-weight:500;line-height:1.12;letter-spacing:-.01em;
  /* Une carte qui déborde est un problème de contenu, pas de mise en page :
     le corps ne se réduit pas, le texte se coupe. */
  max-height:3.4em;overflow:hidden}

.lignes{margin-top:3mm;display:flex;flex-direction:column;gap:1.2mm}
.ligne{display:flex;gap:2mm;font-size:9pt;line-height:1.3}
.ligne .cle{width:24mm;flex:none;font-size:7pt;font-weight:500;letter-spacing:.07em;
  text-transform:uppercase;color:#888;padding-top:.5mm}
.ligne .val{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ligne .val.mono{font-family:ui-monospace,Menlo,monospace}
.pastille{display:inline-block;width:2.6mm;height:2.6mm;border-radius:50%;margin-right:1.4mm;
  vertical-align:-.2mm}

/* L'emplacement en bas et en grand : c'est la question qu'on se pose la carte
   à la main — « ça se range où ? ». */
.pied{margin-top:auto;padding-top:2mm;border-top:.2mm solid rgba(12,12,12,.12)}
.pied .cle{font-size:7pt;font-weight:500;letter-spacing:.07em;text-transform:uppercase;color:#888;display:block}
.pied .val{font-size:10pt;display:block;margin-top:.5mm;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap}
`

/** Une ligne « clé : valeur », omise si la valeur est vide. Un champ vide ne
 *  laisse pas un label orphelin sur une carte qu'on lit à un mètre. */
function ligne(cle, valeur, { mono = false, pastille = '' } = {}) {
  const v = String(valeur === null || valeur === undefined ? '' : valeur).trim()
  if (!v) return ''
  const point = pastille ? `<span class="pastille" style="background:${esc(pastille)}"></span>` : ''
  return `<div class="ligne"><span class="cle">${esc(cle)}</span><span class="val${mono ? ' mono' : ''}">${point}${esc(v)}</span></div>`
}

function carteHtml(article, { categories = [], fournisseurs = [], qr = '', photoUrl = '' }) {
  if (!article) return '<div class="vide"></div>'
  const { feuille, racine } = categorieDe(article, categories)
  const couleur = couleurDe(article, categories)
  const nomCat = [racine?.nom, feuille && feuille.id !== racine?.id ? feuille.nom : null].filter(Boolean).join(' · ') || 'sans catégorie'

  const photo = photoUrl
    ? `<img src="${esc(photoUrl)}" alt="">`
    : '<span class="absente">sans photo</span>'

  return `<div class="carte">
  <div class="bandeau" style="background:${esc(couleur)}">
    <span class="cat">${esc(nomCat)}</span>
    <span class="code">${esc(article.code)}</span>
  </div>
  <div class="corps">
    <div class="gauche">
      <div class="photo">${photo}</div>
      <div class="qr">${qr}<div class="legende">stock · commander</div></div>
    </div>
    <div class="droite">
      <div class="titre">${esc(article.designation)}</div>
      <div class="lignes">
        ${ligne('Fournisseur', nomFournisseur(article.fournisseur_id, fournisseurs))}
        ${ligne('Référence', article.reference, { mono: true })}
        ${ligne('Stock bas', article.seuil_bas, { pastille: '#E8A33D' })}
        ${ligne('À commander', article.seuil_commander, { pastille: '#C4002B' })}
        ${ligne('Quantité', article.quantite_commande)}
        ${ligne('Délai', article.delai)}
      </div>
      <div class="pied">
        <span class="cle">Emplacement</span>
        <span class="val">${esc(article.emplacement || '—')}</span>
      </div>
    </div>
  </div>
</div>`
}

/**
 * Le document complet.
 *
 * `feuilles` est une liste de listes de 4 cases (cf. `planches`), une case
 * valant `null` pour un emplacement laissé vide. `qrs` et `photos` sont
 * indexés par identifiant d'article : le HTML ne va rien chercher lui-même —
 * le QR est un SVG inliné, la photo une URL publique.
 */
export function feuillesCartesHtml(feuilles, { categories = [], fournisseurs = [], qrs = {}, photos = {}, polices = '' } = {}) {
  const reperes = `
    <div class="repere rv" style="top:0"></div>
    <div class="repere rv" style="bottom:0"></div>
    <div class="repere rh" style="left:0"></div>
    <div class="repere rh" style="right:0"></div>`

  const pages = (feuilles || []).map(cases => `<div class="feuille">${reperes}<div class="grille">${
    cases.map(a => carteHtml(a, {
      categories, fournisseurs,
      qr: a ? (qrs[a.id] || '') : '',
      photoUrl: a ? (photos[a.id] || '') : '',
    })).join('')
  }</div></div>`).join('\n')

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<title>cartes économat</title>
<style>${polices}\n${CSS}</style>
</head><body>${pages}</body></html>`
}
