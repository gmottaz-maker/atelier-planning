#!/usr/bin/env node
// Fabrique les icônes de l'application installée sur un téléphone.
//
//   node scripts/icones-pwa.mjs
//
// Pourquoi un script et pas des fichiers déposés à la main : l'icône est le
// LOGO DE LA MAISON, qui vit dans `lib/amazingLogo.js` et sert déjà à l'écran
// de chargement. Deux dessins pour la même marque finissent par diverger — il
// y en avait d'ailleurs un troisième, un « atome » inventé, dans icon.svg et
// favicon.svg, au rose de juillet.
//
// Trois contraintes d'iOS qu'aucun outil ne rappelle :
//
//  1. `apple-touch-icon` doit être un PNG. iOS ne lit PAS le SVG et fabrique à
//     la place une capture de la page — c'est ce qui se passait ici.
//  2. La transparence devient NOIRE. Le fond doit donc être peint, et autant
//     qu'il le soit avec le noir de la marque, celui de l'écran de chargement.
//  3. iOS arrondit les angles lui-même. Un rayon dessiné dans l'image
//     donnerait un double arrondi, visible sur fond clair.
//
// Android, lui, masque l'icône `maskable` dans une forme qu'il choisit : le
// dessin doit tenir dans le cercle central de 80 %. D'où une seconde version,
// plus petite dans son cadre.
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import puppeteer from 'puppeteer-core'
import { amazingLogo } from '../lib/amazingLogo.js'

const NOIR = '#0C0C0C'
const ROSE = '#FFB2C0'   // AL.pink — celui de l'écran de chargement

const SORTIE = join(process.cwd(), 'public', 'icons')
mkdirSync(SORTIE, { recursive: true })

/** Le logo centré sur un fond plein, à la part de largeur demandée. */
function page(taille, part) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0}
    html,body{width:${taille}px;height:${taille}px;background:${NOIR};overflow:hidden}
    .cadre{width:${taille}px;height:${taille}px;display:flex;align-items:center;justify-content:center}
    .cadre svg{width:${Math.round(taille * part)}px;height:auto}
  </style></head><body>
    <div class="cadre">${amazingLogo(0, ROSE).replace(/style="[^"]*"/, `style="fill:currentColor;color:${ROSE}"`)}</div>
  </body></html>`
}

const executablePath = process.env.CHROME_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const navigateur = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'] })
try {
  // `part` : la largeur du logo dans le cadre. 0.62 pour les icônes qu'iOS
  // affiche telles quelles, 0.48 pour la maskable, dont Android peut rogner
  // jusqu'à 20 % de chaque bord.
  const ICONES = [
    { nom: 'icon-180.png', taille: 180, part: 0.62 },   // apple-touch-icon
    { nom: 'icon-192.png', taille: 192, part: 0.62 },
    { nom: 'icon-512.png', taille: 512, part: 0.62 },
    { nom: 'icon-maskable-512.png', taille: 512, part: 0.48 },
  ]
  for (const { nom, taille, part } of ICONES) {
    const onglet = await navigateur.newPage()
    await onglet.setViewport({ width: taille, height: taille, deviceScaleFactor: 1 })
    await onglet.setContent(page(taille, part), { waitUntil: 'load' })
    const png = await onglet.screenshot({ type: 'png', omitBackground: false })
    writeFileSync(join(SORTIE, nom), png)
    await onglet.close()
    console.log(`  ${nom.padEnd(24)} ${taille}×${taille}  ${(png.length / 1024).toFixed(0)} ko`)
  }
} finally {
  await navigateur.close()
}

// Le favicon reste un SVG — c'est un onglet de navigateur, pas une icône
// d'écran d'accueil, et il doit suivre le thème clair/sombre du système.
// Même logo, mais sans fond : l'onglet a le sien.
writeFileSync(join(process.cwd(), 'public', 'favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 130.84 116.93">
  <style>
    svg { color: ${NOIR}; }
    @media (prefers-color-scheme: dark) { svg { color: #ffffff; } }
  </style>
  ${amazingLogo(0, 'currentColor').replace(/^<svg[^>]*>/, '<g style="fill:currentColor">').replace(/<\/svg>$/, '</g>')}
</svg>\n`)
console.log('  favicon.svg              même logo, sans fond, suit le thème système\n')
