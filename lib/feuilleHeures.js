// Feuille d'heures imprimée : une page A4 par personne et par jour travaillé.
//
// Pensée pour être SCANNÉE et lue par la machine dès sa conception :
//  — nom, date et code de feuille IMPRIMÉS : on ne lit pas une écriture pour
//    savoir à qui et à quel jour la feuille appartient ;
//  — des CASES à un chiffre pour les horaires et les numéros : un chiffre
//    manuscrit isolé dans sa case se lit sans hésiter, une suite libre non ;
//  — trois cases pour un projet, deux pour une activité : une colonne
//    inversée ne passe pas inaperçue (projets à partir de 100, activités en
//    dizaines de famille) ;
//  — les projets en cours et les activités imprimés sur la feuille : personne
//    n'a à chercher un numéro ailleurs.
//
// Les marges viennent de @page, jamais d'un padding (cf. CLAUDE.md).
import { esc, INK, GREY, HAIR, MONO, DOC_FONTS } from './docLayout'
import { estJourTravaille } from './joursOuvres'
import { FAMILLES } from './heures'

export const LIGNES_PAR_FEUILLE = 15
export const MAX_JOURS = 31
export const MAX_PROJETS_LEGENDE = 40

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const LIBELLES_FAMILLE = {
  gestion: 'Gestion', atelier: 'Atelier', finitions: 'Finitions',
  chantier: 'Chantier', logistique: 'Logistique', interne: 'Interne',
}

const FORME = /^\d{4}-\d{2}-\d{2}$/
const versDate = s => { const [y, m, j] = s.split('-').map(Number); return new Date(y, m - 1, j) }
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * Les jours à imprimer. Par défaut, ceux où l'atelier travaille (lundi, mardi,
 * jeudi, vendredi) : une pile de feuilles vierges pour des mercredis et des
 * dimanches finirait à la corbeille.
 *
 * Mais on travaille parfois un mercredi ou un samedi. Un jour demandé SEUL
 * sort donc toujours — c'est la feuille du jour exceptionnel —, et `tous`
 * imprime chaque jour d'une période.
 */
export function joursAImprimer(from, to, { tous = false } = {}) {
  if (!FORME.test(String(from || '')) || !FORME.test(String(to || '')) || from > to) return []
  const out = []
  const d = versDate(from)
  const fin = versDate(to)
  // setDate et non + 86 400 000 ms : les journées de changement d'heure
  // font 23 ou 25 heures. La borne évite une boucle sur une période absurde.
  for (let i = 0; d <= fin && i < 400; i++) {
    if (tous || from === to || estJourTravaille(d)) out.push(iso(d))
    d.setDate(d.getDate() + 1)
  }
  return out
}

/** « jeudi 17 septembre 2026 » */
export function dateLongue(s) {
  const d = versDate(s)
  return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`
}

/** Identifiant imprimé de la feuille : c'est lui que le scan lira en premier. */
export const codeFeuille = (personne, date) => `H·${date}·${String(personne).toUpperCase()}`

/** Les projets de la légende : en cours, hors pause, les plus récents d'abord. */
export function projetsLegende(projets = []) {
  return projets
    .filter(p => p.status === 'active' && !p.suspended && p.numero != null)
    .sort((a, b) => b.numero - a.numero)
}

const cases = n => `<span class="cases">${'<span class="case"></span>'.repeat(n)}</span>`
const heure = () => `${cases(2)}<span class="dp">:</span>${cases(2)}`

function legendeProjets(projets) {
  const liste = projetsLegende(projets)
  const visibles = liste.slice(0, MAX_PROJETS_LEGENDE)
  const reste = liste.length - visibles.length
  return `<div class="leg-titre">Projets en cours</div>
    <div class="liste">${visibles.map(p =>
      `<div class="leg-l"><b>${p.numero}</b>${esc(p.name)}${p.client ? `<span class="leg-client"> · ${esc(p.client)}</span>` : ''}</div>`).join('')}
    ${reste > 0 ? `<div class="leg-l leg-reste">… et ${reste} autre${reste > 1 ? 's' : ''} : noter le n° du projet</div>` : ''}
    </div>`
}

function legendeActivites(activites) {
  const actives = activites.filter(a => a.actif !== false).sort((a, b) => a.code - b.code)
  return `<div class="leg-titre">Activités</div>
    <div class="liste">${FAMILLES.map(f => {
      const de = actives.filter(a => a.famille === f)
      if (!de.length) return ''
      return `<div class="leg-fam">${LIBELLES_FAMILLE[f]}</div>${de.map(a =>
        `<div class="leg-l"><b>${a.code}</b>${esc(a.libelle)}</div>`).join('')}`
    }).join('')}</div>`
}

/** Une feuille : une personne, un jour. */
export function feuilleHtml({ personne, date, projets = [], activites = [] }) {
  const lignes = Array.from({ length: LIGNES_PAR_FEUILLE }, (_, i) => `
    <tr>
      <td class="num">${i + 1}</td>
      <td>${heure()}</td>
      <td>${heure()}</td>
      <td>${cases(3)}</td>
      <td>${cases(2)}</td>
      <td class="libre"></td>
    </tr>`).join('')

  return `<section class="feuille">
    <header>
      <div>
        <div class="etiquette">Feuille d'heures · amazing lab</div>
        <div class="nom">${esc(personne)}</div>
      </div>
      <div class="droite">
        <div class="date">${dateLongue(date)}</div>
        <div class="code">${esc(codeFeuille(personne, date))}</div>
      </div>
    </header>
    <p class="consigne">Une ligne par activité. Heures en HH:MM (ex. 07:30 – 09:45). Projet : son n° à 3 chiffres,
      vide pour le temps interne. Activité : son n° à 2 chiffres. Consulting : écris le client en remarque.</p>
    <table class="grille">
      <thead><tr><th></th><th>Début</th><th>Fin</th><th>Projet</th><th>Activité</th><th>Remarque / client</th></tr></thead>
      <tbody>${lignes}</tbody>
    </table>
    <p class="notes">Pause de midi (1 h) : ne pas la noter. Pause de 30 min : comptée d'office.
      Le temps non noté de la journée est compté en Divers (63).</p>
    <div class="legendes">
      <div class="leg-projets">${legendeProjets(projets)}</div>
      <div class="leg-activites">${legendeActivites(activites)}</div>
    </div>
  </section>`
}

const CSS = `
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'IBM Plex Sans', Helvetica, Arial, sans-serif; color: ${INK}; }
  .feuille { break-after: page; }
  .feuille:last-child { break-after: auto; }
  header { display: flex; justify-content: space-between; align-items: flex-end; gap: 8mm;
    border-bottom: 2px solid ${INK}; padding-bottom: 3mm; }
  .etiquette { font-size: 8pt; text-transform: uppercase; letter-spacing: .1em; color: ${GREY}; }
  .nom { font-size: 24pt; font-weight: 600; line-height: 1.1; }
  .droite { text-align: right; }
  .date { font-size: 15pt; font-weight: 500; }
  .code { font: 9pt ${MONO}; color: ${GREY}; margin-top: 1mm; }
  .consigne { font-size: 8.5pt; color: ${GREY}; margin: 2.5mm 0 3mm; line-height: 1.4; }
  table.grille { width: 100%; border-collapse: collapse; }
  .grille th { font-size: 7.5pt; font-weight: 500; text-transform: uppercase; letter-spacing: .06em;
    color: ${GREY}; text-align: left; padding: 0 0 1.5mm; }
  .grille td { height: 9.5mm; border-top: 0.6pt solid ${HAIR}; padding: 0 2.5mm 0 0; vertical-align: middle; white-space: nowrap; }
  .grille tr:last-child td { border-bottom: 0.6pt solid ${HAIR}; }
  .grille td.num { width: 6mm; font: 8pt ${MONO}; color: ${GREY}; }
  .grille td.libre { width: 100%; }
  .cases { display: inline-flex; gap: 1mm; vertical-align: middle; }
  .case { display: inline-block; width: 6.5mm; height: 8mm; border: 0.8pt solid ${INK}; border-radius: 1mm; }
  .dp { font: 13pt ${MONO}; padding: 0 1mm; vertical-align: middle; }
  .notes { font-size: 8.5pt; margin: 2.5mm 0 3mm; line-height: 1.4; }
  /* minmax(0, …) : sans lui, une colonne de grille s'élargit à son contenu le
     plus large — les lignes de projets, qui ne passent pas à la ligne,
     écrasaient la légende des activités. */
  .legendes { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 7mm; border-top: 1pt solid ${INK}; padding-top: 2.5mm; }
  .leg-titre { font-size: 7.5pt; font-weight: 500; text-transform: uppercase; letter-spacing: .08em; color: ${GREY}; margin-bottom: 1.5mm; }
  .liste { column-count: 2; column-gap: 5mm; }
  .leg-l { font-size: 7.6pt; line-height: 1.28; break-inside: avoid; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  /* text-indent se transmet à la boîte du numéro : sans le remettre à zéro,
     le retrait négatif des activités poussait le chiffre hors de sa case. */
  .leg-l b { display: inline-block; width: 7.5mm; font-family: ${MONO}; font-weight: 600; text-indent: 0; }
  .leg-reste { color: ${GREY}; font-style: italic; }
  /* Le nom avant le client, et le client en gris : cinq projets d'un même
     client ne se distinguent que par leur nom, qu'une coupure ne doit pas manger. */
  .leg-client { color: ${GREY}; }
  /* Les activités sont peu nombreuses : leur libellé passe à la ligne, aligné
     sous le texte et non sous le numéro. Les projets, eux, restent sur une
     ligne — c'est leur numéro qu'on vient chercher. */
  .leg-activites .leg-l { white-space: normal; padding-left: 7.5mm; text-indent: -7.5mm; }
  .leg-fam { font-size: 7pt; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; margin-top: 0.8mm; break-after: avoid; }
  .leg-fam:first-child { margin-top: 0; }
`

/**
 * Le document complet : pour chaque jour, une feuille par personne — ainsi la
 * pile imprimée se range jour par jour.
 */
export function feuillesHtml({ personnes = [], jours = [], projets = [], activites = [] }) {
  const pages = []
  for (const date of jours) for (const personne of personnes) pages.push(feuilleHtml({ personne, date, projets, activites }))
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${DOC_FONTS}" rel="stylesheet">
<title>Feuilles d'heures</title>
<style>${CSS}</style>
</head><body>${pages.join('')}</body></html>`
}
