#!/usr/bin/env node
// Inventaire de la dette graphique : où les couleurs sont écrites en dur
// plutôt que prises dans lib/theme.js.
//
// Sert de tableau de bord à la refonte : tant qu'un écran a des couleurs en
// dur, le changer de palette demande de le rouvrir ligne à ligne. L'objectif
// est d'amener ces compteurs à zéro, écran par écran, pour qu'un changement de
// jetons suffise ensuite.
//
//   npm run check:style            tous les écrans
//   npm run check:style -- index   filtre sur un nom
//
// N'échoue jamais : c'est une mesure, pas une barrière.
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

const HEX = /#[0-9a-fA-F]{3,8}\b/g
const TAILWIND = /\b(?:bg|text|border|ring|from|via|to)-(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g
const JETON = /\bC\.[a-zA-Z]+|\bFONT\b|\bMONO\b|personChip|CAL_CAT/g

function fichiers(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) { if (e !== 'api') fichiers(p, out) }
    else if (e.endsWith('.js')) out.push(p)
  }
  return out
}

const filtre = process.argv[2]
const cibles = [...fichiers('pages'), ...fichiers('components')]
  .filter(f => !filtre || f.includes(filtre))
  .sort()

let totalHex = 0, totalTw = 0, migres = 0
const lignes = []

for (const f of cibles) {
  const src = readFileSync(f, 'utf8')
  const hex = (src.match(HEX) || []).length
  const tw = (src.match(TAILWIND) || []).length
  const jetons = (src.match(JETON) || []).length
  totalHex += hex; totalTw += tw
  const dette = hex + tw
  if (dette === 0) migres++
  lignes.push({ f, hex, tw, jetons, dette })
}

lignes.sort((a, b) => b.dette - a.dette)

const etat = l => (l.dette === 0 ? '✓' : l.jetons > 0 ? '~' : '✗')
console.log('\n  état  fichier                              hex   tailwind   jetons')
console.log('  ' + '─'.repeat(68))
for (const l of lignes) {
  if (l.dette === 0 && !filtre) continue          // on ne liste que ce qui reste
  console.log(`   ${etat(l)}    ${l.f.padEnd(36)} ${String(l.hex).padStart(4)} ${String(l.tw).padStart(10)} ${String(l.jetons).padStart(8)}`)
}

console.log('  ' + '─'.repeat(68))
console.log(`  ${migres}/${lignes.length} fichiers sans couleur en dur`)
console.log(`  reste : ${totalHex} valeurs hex, ${totalTw} classes Tailwind de couleur`)
console.log('\n  ✓ migré   ~ partiellement (utilise déjà des jetons)   ✗ pas commencé\n')
