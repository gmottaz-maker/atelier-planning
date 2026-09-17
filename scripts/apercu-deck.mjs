#!/usr/bin/env node
// Rend le gabarit de présentation client en PDF, pour vérifier la mise en page
// sans attendre d'avoir une vraie offre à montrer.
//
//   node scripts/apercu-deck.mjs [fichier.pdf] [nombre de pièces]
//
// Ne touche ni à la base ni au réseau : c'est un rendu local, à regarder.
import { writeFileSync } from 'fs'
import { deckHtml, policesEmbarquees } from '../lib/deckHtml.js'
import { gabaritDeck } from '../lib/deckGabarit.js'
import { htmlToPdf } from '../lib/htmlToPdf.js'

const sortie = process.argv[2] || 'apercu-deck.pdf'
const pieces = Number(process.argv[3] || 2)

const html = deckHtml(gabaritDeck({ pieces }), { polices: policesEmbarquees() })
const pdf = await htmlToPdf(html)
writeFileSync(sortie, pdf)
console.log(`${sortie} — ${(pdf.length / 1024).toFixed(0)} ko`)
