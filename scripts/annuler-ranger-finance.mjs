#!/usr/bin/env node
// Annule un passage de `ranger-finance.mjs`, ligne par ligne, à l'envers.
//
//   node scripts/annuler-ranger-finance.mjs            → RAPPORT seulement
//   node scripts/annuler-ranger-finance.mjs --ecrire   → remet tout en place
//
// Lit `journal-ranger-finance.tsv` et redéplace chaque fichier vers le dossier
// d'où il venait. Rien n'a été supprimé par le rangement lui-même — ni les
// originaux, ni les doublons mis de côté.
//
// MAIS une annulation n'est complète que si la destination d'origine existe
// encore. Les dossiers vidés du 5 octobre 2026 ont été supprimés à la demande
// (`Claude Finance`, les dix coquilles d'année) : les lignes qui pointaient
// vers eux ne se rejouent plus, et le script les comptera en échec plutôt que
// de prétendre avoir réussi. Les lignes commençant par `#` — dont la trace de
// ces suppressions — sont ignorées.
//
// Autrement dit : l'annulation sert tant qu'on n'a pas supprimé les coquilles.
// Après, le drive garde une corbeille, et c'est tout ce qui reste.
//
// Même discipline que le reclassement de septembre : un journal, et un script
// qui le rejoue en arrière. Un déplacement sans retour n'est pas un
// déplacement, c'est un pari.
import { readFileSync } from 'fs'

function env() {
  const out = { ...process.env }
  try {
    for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
      if (!l.includes('=') || l.startsWith('#')) continue
      const i = l.indexOf('=')
      out[l.slice(0, i).trim()] ||= l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    }
  } catch {}
  return out
}
const E = env()
const ECRIRE = process.argv.includes('--ecrire')
const JOURNAL = process.argv.find(a => a.endsWith('.tsv')) || 'journal-ranger-finance.tsv'

const BASE = `https://api.infomaniak.com/2/drive/${E.KDRIVE_DRIVE_ID}`
async function kf(chemin, init = {}) {
  const r = await fetch(`${BASE}${chemin}`, { ...init, headers: { Authorization: `Bearer ${E.KDRIVE_TOKEN}`, ...(init.headers || {}) } })
  const d = await r.json()
  if (d.result !== 'success') throw new Error(`kDrive: ${d.error?.description || JSON.stringify(d.error)}`)
  return d.data
}

const lignes = readFileSync(JOURNAL, 'utf8').split('\n')
  .filter(l => l.trim() && !l.startsWith('#'))
  .map(l => l.split('\t'))
  .map(([horo, action, fichier, nom, depuis, vers]) => ({ horo, action, fichier, nom, depuis, vers }))

console.log(`${JOURNAL} : ${lignes.length} déplacement(s) à annuler.`)
// À l'envers : si un dossier a été créé en route, on le vide avant de le quitter.
lignes.reverse()

if (!ECRIRE) {
  for (const l of lignes.slice(0, 10)) console.log(`  ${l.nom} : ${l.vers} → ${l.depuis}`)
  if (lignes.length > 10) console.log(`  … +${lignes.length - 10}`)
  console.log('Rien touché. Relance avec --ecrire.')
  process.exit(0)
}

let faits = 0, rates = []
for (const l of lignes) {
  try {
    await kf(`/files/${l.fichier}/move/${l.depuis}`, { method: 'POST' })
    faits++
  } catch (e) { rates.push(`${l.nom} (${l.fichier}) : ${e.message}`) }
}
console.log(`${faits} remis en place.`)
if (rates.length) {
  console.log(`${rates.length} échec(s) — à regarder à la main :`)
  for (const r of rates) console.log('   ', r)
}
