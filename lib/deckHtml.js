// Rendu HTML d'une présentation client, d'après le handoff « amazing lab —
// client offer deck template » (design system 4434681b).
//
// Une page = un `<section class="slide">` de 1920 × 1080 px exactement. Ce
// n'est PAS une mise en page responsive : rien ne doit refluer. Une page qui
// déborde à 1920 × 1080 est un problème de CONTENU — trop de texte, trop de
// lignes de budget — et se corrige en coupant le texte, jamais en réduisant le
// corps. C'est pour cela que chaque gabarit ci-dessous impose ses largeurs en
// `ch` : elles disent au modèle de langue combien de signes il a le droit
// d'écrire, et l'écran de relecture le lui rappelle.
//
// Règles du design system que ce fichier applique sans exception :
//   — aucune ombre, aucun dégradé, aucune texture ; la profondeur vient de
//     l'inversion du fond (blanc ↔ #0C0C0C) et de rien d'autre ;
//   — le corail est TYPOGRAPHIQUE : il souligne le « × » du titre et le « ! »
//     de la dernière page. Il ne remplit jamais une surface ;
//   — deux rayons seulement : 15 px pour un conteneur de contenu, 0 pour une
//     section pleine page ;
//   — tout le texte est écrit en minuscules à la saisie, pas en `text-transform` :
//     une capitale collée par le CSS ne se corrige pas à la relecture.
//
// Les cadres d'image restent BLANCS même sur fond noir : les rendus arrivent
// sur fond blanc, et un puits sombre dessine une boîte visible derrière l'objet.
import { readFileSync } from 'fs'
import { join } from 'path'
import { amazingLogo } from './amazingLogo.js'
import { pagesDeck } from './deck.js'

export const NOIR = '#0C0C0C'
export const BLANC = '#FFFFFF'
export const CORAIL = '#FF4D6D'
export const ROSE = '#FFB2C0'
export const GRIS = '#888888'

export const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Montant à la suisse : apostrophe pour les milliers, POINT pour les décimales.
 *
 * `lib/money.js` écrit la virgule, qui est l'usage des factures de la maison.
 * Le deck, lui, suit son handoff : « 24'898.84 ». Les deux documents ne se
 * lisent pas côte à côte, et changer l'un pour l'autre casserait des factures
 * déjà émises.
 */
export function montant(n) {
  // Un montant ABSENT n'est pas un montant nul : `Number(null)` vaut 0, et une
  // ligne vide imprimerait « 0.00 » comme si le poste était offert. Même règle
  // que partout ailleurs dans l'application — ce qu'on ignore ne s'écrit pas.
  if (n === null || n === undefined || n === '') return ''
  const v = Number(n)
  if (!Number.isFinite(v)) return ''
  const [ent, dec] = Math.abs(v).toFixed(2).split('.')
  const milliers = ent.replace(/\B(?=(\d{3})+(?!\d))/g, "'")
  return `${v < 0 ? '−' : ''}${milliers}.${dec}`
}

/** Le « × » d'un titre et le « ! » d'une chute passent en corail. Rien d'autre. */
function accent(t) {
  return esc(t)
    .replace(/×/g, `<span style="color:${CORAIL}">×</span>`)
    .replace(/!(\s*)$/, `<span style="color:${CORAIL}">!</span>$1`)
}

export const DECK_CSS = `
  @page { size: 508mm 285.75mm; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; background: ${BLANC}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  .slide {
    width: 1920px; height: 1080px; padding: 88px 104px 72px;
    display: flex; flex-direction: column; overflow: hidden;
    background: ${BLANC}; color: ${NOIR};
    font-family: 'Apercu Pro', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif;
    font-size: 26px; line-height: 1.45; font-weight: 400;
    break-after: page;
  }
  .slide:last-child { break-after: auto; }
  .slide.sombre { background: ${NOIR}; color: ${BLANC}; }

  .surtitre { font-size: 24px; font-weight: 500; line-height: 1.4; color: ${GRIS}; }
  h1 { font-size: 100px; font-weight: 400; line-height: 1; letter-spacing: -0.005em; margin: 0; }
  h2 { font-size: 56px; font-weight: 400; line-height: 1; margin: 24px 0 0; }
  p  { margin: 0; }
  b  { font-weight: 500; }

  .sous-titre { font-size: 32px; font-weight: 400; line-height: 1.15; }
  .petit { font-size: 24px; line-height: 1.4; }
  .muet  { color: ${GRIS}; }
  .apres-titre { margin-top: 40px; }

  /* Un cadre d'image : fond blanc, 15 px de rayon, l'image entière visible. */
  .cadre {
    background: ${BLANC}; border-radius: 15px; overflow: hidden; min-height: 0;
    display: flex; align-items: center; justify-content: center;
  }
  .cadre img { width: 100%; height: 100%; object-fit: contain; }
  /* Emplacement encore vide : un trait tireté, jamais dans un document envoyé.
     Sans lui, un cadre blanc sur fond blanc disparaît et on croit la page finie. */
  .cadre.vide { outline: 1.5px dashed ${GRIS}; outline-offset: -1.5px; min-height: 120px; }
  .cadre .attente { font-size: 24px; color: ${GRIS}; }

  .panneau { border-radius: 15px; padding: 40px; }
  .encadre { border-radius: 15px; padding: 24px; background: ${ROSE}; color: ${NOIR}; }
`

/** Un cadre d'image. Sans source, il annonce ce qui manque au lieu de mentir. */
function cadre(img = {}, { style = '' } = {}) {
  const dedans = img.src
    ? `<img src="${esc(img.src)}" alt="${esc(img.alt || '')}">`
    : `<span class="attente">[${esc(img.attente || 'visuel')}]</span>`
  return `<div class="cadre${img.src ? '' : ' vide'}" style="${style}">${dedans}</div>`
}

/** Cadre + légende dessous, en colonne qui remplit la hauteur disponible. */
function cadreLegende(img = {}, { ecart = 24 } = {}) {
  return `<div style="flex:1;display:flex;flex-direction:column;gap:${ecart}px;min-height:0;min-width:0">
    ${cadre(img, { style: 'flex:1' })}
    ${img.legende ? `<div class="petit muet">${esc(img.legende)}</div>` : ''}
  </div>`
}

const entete = (sur, titre, maxch) =>
  `${sur ? `<div class="surtitre">${esc(sur)}</div>` : ''}
   ${titre ? `<h2${maxch ? ` style="max-width:${maxch}ch"` : ''}>${accent(titre)}</h2>` : ''}`

// ── Les gabarits, dans l'ordre du récit ──────────────────────────────────────

const GABARITS = {

  couverture: d => `<section class="slide sombre" style="justify-content:space-between">
    <div>${amazingLogo(56, ROSE)}</div>
    <div>
      <div class="surtitre">${esc(d.surtitre || '')}</div>
      <h1 style="max-width:16ch;margin-top:24px">${accent(d.titre)}</h1>
      ${d.sousTitre ? `<div class="sous-titre" style="margin-top:24px">${esc(d.sousTitre)}</div>` : ''}
    </div>
    <div class="petit muet" style="display:flex;justify-content:space-between">
      <span>${esc(d.lieu || '')}</span>
      <span>${esc(d.numero || '')}</span>
      <span>${esc(d.date || '')}</span>
    </div>
  </section>`,

  contexte: d => `<section class="slide">
    ${entete(d.surtitre || 'le contexte', d.titre, 24)}
    <div class="apres-titre" style="display:flex;gap:64px;align-items:flex-start;flex:1;min-height:0">
      <div style="flex:1;display:flex;flex-direction:column;gap:40px">
        ${(d.paragraphes || []).map(p => `<p style="max-width:40ch">${esc(p)}</p>`).join('')}
        ${(d.chiffres || []).length ? `<div style="display:flex;gap:40px">
          ${(d.chiffres || []).map(c => `<div>
            <div style="font-size:100px;line-height:1;letter-spacing:-0.005em">${esc(c.valeur)}</div>
            <div class="petit muet" style="margin-top:8px">${esc(c.legende)}</div>
          </div>`).join('')}
        </div>` : ''}
      </div>
      ${d.panneau ? `<div class="panneau" style="flex:0 0 560px;background:${NOIR};color:${BLANC}">
        <div class="sous-titre">${esc(d.panneau.titre)}</div>
        <div style="display:flex;flex-direction:column;gap:16px;margin-top:24px">
          ${(d.panneau.points || []).map(p => `<div class="petit">${esc(p)}</div>`).join('')}
        </div>
      </div>` : ''}
    </div>
  </section>`,

  brief: d => `<section class="slide">
    ${entete(d.surtitre || 'le brief', d.titre, 26)}
    <div class="apres-titre" style="display:flex;gap:40px;flex:1;min-height:0">
      ${(d.cartes || []).slice(0, 2).map((c, i) => `<div class="panneau" style="flex:1;display:flex;flex-direction:column;gap:24px;${
        i === 0 ? `background:${ROSE};color:${NOIR}` : `background:${NOIR};color:${BLANC}`}">
        <div class="petit" style="font-weight:500">${esc(c.label)}</div>
        <p>${esc(c.texte)}</p>
      </div>`).join('')}
    </div>
    ${d.portee ? `<p style="margin-top:40px;max-width:88ch">${esc(d.portee)}</p>` : ''}
  </section>`,

  pourquoi: d => `<section class="slide sombre">
    ${entete(d.surtitre || 'pourquoi nous', d.titre, 24)}
    <div style="margin-top:64px;display:grid;grid-template-columns:1fr 1fr;gap:40px 64px">
      ${(d.atouts || []).map(a => `<div>
        <div class="sous-titre" style="margin-bottom:12px">${esc(a.titre)}</div>
        <p>${esc(a.texte)}</p>
      </div>`).join('')}
    </div>
  </section>`,

  apercu: d => `<section class="slide">
    ${entete(d.surtitre || 'les pièces', d.titre)}
    <div class="apres-titre" style="display:flex;gap:40px;min-height:0">
      ${(d.pieces || []).map(p => `<div style="flex:1;min-width:0">
        ${cadre(p.image || {}, { style: 'height:300px' })}
        <div class="sous-titre" style="margin-top:24px">${esc(p.nom)}</div>
        <div class="petit muet" style="margin-top:8px">${esc(p.description || '')}</div>
      </div>`).join('')}
    </div>
  </section>`,

  methode: d => `<section class="slide">
    ${entete(d.surtitre || 'comment lire les visuels', d.titre, 26)}
    ${d.intro ? `<p style="margin-top:24px;max-width:96ch">${esc(d.intro)}</p>` : ''}
    <div class="apres-titre" style="display:flex;gap:64px;flex:1;min-height:0">
      ${(d.colonnes || []).map(c => `<div style="flex:1;display:flex;flex-direction:column;min-width:0;min-height:0">
        ${cadre(c.image || {}, { style: 'flex:1' })}
        <div class="petit" style="font-weight:500;margin-top:24px">${esc(c.legende)}</div>
        <p class="petit muet" style="margin-top:12px">${esc(c.texte)}</p>
      </div>`).join('')}
    </div>
  </section>`,

  visuels: d => `<section class="slide sombre">
    <div style="display:flex;justify-content:space-between;align-items:baseline">
      <span class="petit muet">élément ${d.rang} / ${d.total}</span>
      <span class="petit" style="font-weight:500">${esc(d.nom)}</span>
    </div>
    <div style="margin-top:40px;flex:1;min-height:0;display:flex;gap:${d.empile ? 24 : 40}px;${
      d.empile ? 'flex-direction:column' : ''}">
      ${(d.images || []).slice(0, 2).map(i => cadreLegende(i, { ecart: d.empile ? 12 : 24 })).join('')}
    </div>
  </section>`,

  detail: d => `<section class="slide">
    ${entete(`élément ${d.rang} / ${d.total}`, d.titre || d.nom)}
    <div class="apres-titre" style="display:flex;gap:40px;align-items:stretch;flex:1;min-height:0">
      <div style="flex:1;display:flex;flex-direction:column;gap:24px;min-width:0">
        ${d.texte ? `<p>${esc(d.texte)}</p>` : ''}
        ${d.encadre ? `<div class="encadre">
          <div class="petit" style="font-weight:500">${esc(d.encadre.titre)}</div>
          <p class="petit" style="margin-top:12px">${esc(d.encadre.texte)}</p>
        </div>` : ''}
        ${(d.specs || []).length ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px 40px" class="petit">
          ${(d.specs || []).map(s => `<div><b>${esc(s.label)}</b><br>${esc(s.valeur)}</div>`).join('')}
        </div>` : ''}
      </div>
      <div style="flex:0 0 38%;display:flex;flex-direction:column;gap:16px;min-height:0">
        ${(d.images || []).slice(0, 2).map(i => cadre(i, { style: 'flex:1' })).join('')}
      </div>
    </div>
  </section>`,

  materiaux: d => `<section class="slide">
    ${entete(d.surtitre || 'matériaux', d.titre, 24)}
    <div class="apres-titre" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:40px;flex:1;min-height:0">
      ${(d.items || []).map(m => `<div style="display:flex;flex-direction:column;gap:20px;min-height:0">
        <div style="flex:1;border-radius:15px;background:${esc(m.couleur || GRIS)}"></div>
        <div>
          <div class="sous-titre">${esc(m.nom)}</div>
          <div class="petit muet" style="margin-top:8px">${esc(m.description || '')}</div>
        </div>
      </div>`).join('')}
    </div>
    ${d.note ? `<div class="petit muet" style="margin-top:40px">${esc(d.note)}</div>` : ''}
  </section>`,

  planning: d => {
    const etapes = (d.etapes || []).slice(0, 5)
    return `<section class="slide sombre">
      ${entete(d.surtitre || 'planning', d.titre)}
      <div style="margin-top:64px;display:flex;align-items:flex-start;position:relative">
        <div style="position:absolute;top:14px;left:14px;right:14px;height:1.5px;background:${GRIS}"></div>
        ${etapes.map((e, i) => `<div style="flex:1;display:flex;flex-direction:column;gap:20px;position:relative;${
          i === etapes.length - 1 ? '' : 'padding-right:20px'}">
          <div style="width:28px;height:28px;border-radius:50%;position:relative;background:${i === 0 ? CORAIL : BLANC}"></div>
          <div class="petit" style="font-weight:500">${esc(e.date)}</div>
          <div class="petit muet">${esc(e.texte)}</div>
        </div>`).join('')}
      </div>
    </section>`
  },

  budget: d => {
    const lignes = d.lignes || []
    const cellule = (g, dr, style = '') =>
      `<div style="${style}">${g}</div><div style="text-align:right;${style}">${dr}</div>`
    return `<section class="slide">
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <span class="surtitre">${esc(d.surtitre || 'budget')}</span>
        <span class="surtitre">${esc([d.numero, d.livraison].filter(Boolean).join(' — '))}</span>
      </div>
      <h2>${accent(d.titre)}</h2>
      <div class="apres-titre petit" style="display:grid;grid-template-columns:2fr 1fr">
        ${cellule(esc(d.enteteLibelle || 'poste'), esc(d.enteteMontant || 'montant chf'),
          `font-weight:500;color:${GRIS};padding-bottom:13px;border-bottom:1.5px solid ${NOIR}`)}
        ${lignes.map((l, i) => cellule(esc(l.libelle), l.gratuit ? esc(l.gratuit) : montant(l.montant),
          `padding:13px 0;border-bottom:${i === lignes.length - 1 ? `1.5px solid ${NOIR}` : `1px solid ${GRIS}`}`)).join('')}
        ${d.sousTotal != null ? cellule('sous-total ht', montant(d.sousTotal), `padding:13px 0;color:${GRIS}`) : ''}
        ${d.tva != null ? cellule(esc(d.libelleTva || 'tva 8.1 %'), montant(d.tva), `padding-bottom:13px;color:${GRIS}`) : ''}
        ${d.total != null ? cellule('total ttc', montant(d.total),
          `font-size:32px;font-weight:500;padding-top:13px;border-top:1.5px solid ${NOIR}`) : ''}
      </div>
      ${d.note ? `<div class="petit muet" style="margin-top:40px">${esc(d.note)}</div>` : ''}
    </section>`
  },

  conditions: d => `<section class="slide">
    ${entete(d.surtitre || 'conditions', d.titre)}
    <div class="apres-titre" style="display:grid;grid-template-columns:1fr 1fr;gap:40px 64px">
      ${(d.items || []).map(c => `<div>
        <div class="petit muet" style="font-weight:500;margin-bottom:12px">${esc(c.label)}</div>
        <p>${esc(c.texte)}</p>
      </div>`).join('')}
    </div>
  </section>`,

  cloture: d => `<section class="slide sombre" style="justify-content:space-between">
    <div>${amazingLogo(56, ROSE)}</div>
    <h1 style="max-width:18ch">${accent(d.ligne || 'parlons de votre projet !')}</h1>
    <div class="petit muet">${esc(d.contact || '')}</div>
  </section>`,
}

/** Une page. Un type inconnu ne rend rien plutôt que de casser le document. */
export function pageHtml(page) {
  const gabarit = GABARITS[page?.type]
  return gabarit ? gabarit(page) : ''
}

/**
 * Les Apercu Pro, embarquées en base64.
 *
 * Aucune substitution Google Fonts n'est acceptable ici — la fonte EST la
 * marque. Les .woff2 vivent dans `public/fonts` ; en production ils ne partent
 * avec la fonction que si `next.config.js` les liste dans
 * `outputFileTracingIncludes`, comme le binaire Chromium. Sans eux, le PDF
 * sortirait en Helvetica sans qu'aucune erreur ne soit levée : d'où le repli
 * explicite et silencieux, et le contrôle au build.
 */
export function policesEmbarquees(racine = process.cwd()) {
  const faces = [['apercu-pro-400.woff2', 400], ['apercu-pro-500.woff2', 500], ['apercu-pro-700.woff2', 700]]
  const css = []
  for (const [nom, poids] of faces) {
    try {
      const b64 = readFileSync(join(racine, 'public', 'fonts', nom)).toString('base64')
      css.push(`@font-face{font-family:'Apercu Pro';font-style:normal;font-weight:${poids};font-display:block;src:url(data:font/woff2;base64,${b64}) format('woff2')}`)
    } catch {
      // Fonte introuvable : le document se rend dans la fonte système.
    }
  }
  return css.join('\n')
}

/** Document complet, prêt pour Chromium. */
export function deckHtml(deck, { polices = '' } = {}) {
  const pages = pagesDeck(deck).map(pageHtml).join('\n')
  return `<!DOCTYPE html><html lang="${esc(deck?.langue || 'fr')}"><head>
<meta charset="utf-8">
<title>${esc(deck?.titre || 'présentation')}</title>
<style>${polices}\n${DECK_CSS}</style>
</head><body>${pages}</body></html>`
}
