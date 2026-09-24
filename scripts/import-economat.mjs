#!/usr/bin/env node
// Import des 84 articles de l'économat, repris de l'ancien fichier Numbers.
//
//   node scripts/import-economat.mjs <fichier.csv>            → RAPPORT seulement
//   node scripts/import-economat.mjs <fichier.csv> --ecrire   → écrit en base
//
// UN SCRIPT, PAS UN ÉCRAN D'IMPORT. Quatre-vingt-quatre lignes, une seule
// fois, avec un arbitrage humain sur une vingtaine d'entre elles : un import
// générique coûterait plus cher que la donnée elle-même.
//
// Il ne fait rien sans `--ecrire`. C'est délibéré : le brief prévient que
// « des désignations ou photos proches ne signifient pas nécessairement qu'il
// s'agit de doublons », donc le rapport se lit AVANT d'écrire.
//
// Et une ligne NON RÉSOLUE N'ENTRE PAS. Deux produits différents ne peuvent
// pas porter la même référence, puisque la référence fait foi : les importer
// tous les deux en se promettant de corriger plus tard, c'est imprimer deux
// cartes qui mènent au même produit et découvrir l'erreur une boîte de
// colliers à la main. Ces lignes restent dans le fichier de préparation,
// signalées, et reviennent au prochain passage.
//
// IDEMPOTENT : la clé est `code` (ECO-0001…). Rejouer le script met à jour,
// ne duplique pas, et ne touche ni `etat`, ni `jeton`, ni l'historique — on
// ne veut pas qu'un rejeu remette tout le stock au vert.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

// ── Environnement ───────────────────────────────────────────────────────────
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

// ── Lecture CSV ─────────────────────────────────────────────────────────────
// Le fichier vient d'un export Numbers/Excel : guillemets doublés, virgules
// dans les cellules, retours à la ligne dans les notes. Un `split(',')` ne
// suffit pas, et une dépendance pour quatre-vingts lignes non plus.
function lireCsv(texte) {
  const lignes = []
  let ligne = [], champ = '', guillemets = false
  const t = texte.replace(/^﻿/, '').replace(/\r\n/g, '\n')
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (guillemets) {
      if (c === '"' && t[i + 1] === '"') { champ += '"'; i++ }
      else if (c === '"') guillemets = false
      else champ += c
    } else if (c === '"') guillemets = true
    else if (c === ',') { ligne.push(champ); champ = '' }
    else if (c === '\n') { ligne.push(champ); lignes.push(ligne); ligne = []; champ = '' }
    else champ += c
  }
  if (champ || ligne.length) { ligne.push(champ); lignes.push(ligne) }
  const entetes = lignes.shift().map(h => h.trim())
  return lignes
    .filter(l => l.some(c => c.trim()))
    .map(l => Object.fromEntries(entetes.map((h, i) => [h, (l[i] || '').trim()])))
}

// ── Normalisations ──────────────────────────────────────────────────────────
// Deux coquilles de saisie, et rien d'autre. On ne « nettoie » pas les seuils
// humains : « Si inférieur à 100pce » est la donnée, pas un brouillon.
const COQUILLES = {
  '1 2 - jours': '1 - 2 jours',
  '1 paquets': '1 paquet',
}
const corriger = v => COQUILLES[v] ?? v
const vide = v => (String(v || '').trim() === '' ? null : String(v).trim())

// ── Programme ───────────────────────────────────────────────────────────────
const chemin = process.argv[2]
const ecrire = process.argv.includes('--ecrire')
if (!chemin) {
  console.error('Usage : node scripts/import-economat.mjs <fichier.csv> [--ecrire]')
  process.exit(2)
}

const lignes = lireCsv(readFileSync(chemin, 'utf8'))
console.log(`\n  ${lignes.length} lignes lues dans ${chemin}\n`)

// ── Rapport avant import ────────────────────────────────────────────────────
// Les colonnes d'audit du classeur (A_completer, Controle_reference,
// Doublon_reference, Source_Numbers…) NE DEVIENNENT PAS des colonnes de la
// base : elles ont servi à préparer la reprise, elles s'arrêtent ici. Elles
// alimentent ce rapport, et c'est tout.
const parReference = new Map()
for (const l of lignes) {
  const cle = `${l.Fournisseur}|${l.Reference_fournisseur}`
  if (!parReference.has(cle)) parReference.set(cle, [])
  parReference.get(cle).push(l)
}

const doublons = []   // même référence ET même désignation → une seule fiche
const conflits = []   // même référence, désignations DIFFÉRENTES → à trancher
for (const [cle, groupe] of parReference) {
  if (groupe.length < 2) continue
  const designations = new Set(groupe.map(l => l.Designation))
  if (designations.size === 1) doublons.push({ cle, groupe })
  else conflits.push({ cle, groupe })
}

if (doublons.length) {
  console.log('  DOUBLONS — même référence, même désignation : une seule fiche sera créée')
  for (const { cle, groupe } of doublons) {
    console.log(`    ${cle}  →  garde ${groupe[0].ID_Mase}, écarte ${groupe.slice(1).map(l => l.ID_Mase).join(', ')}`)
    console.log(`      ${groupe[0].Designation}`)
  }
  console.log()
}

if (conflits.length) {
  console.log('  CONFLITS DE RÉFÉRENCE — à trancher À LA MAIN : la référence fait foi,')
  console.log('  donc deux produits différents ne peuvent pas porter la même.')
  for (const { cle, groupe } of conflits) {
    console.log(`    ${cle}`)
    for (const l of groupe) {
      // Deux lignes identiques DANS un groupe en conflit restent importées
      // toutes les deux : on ne fusionne rien tant que la référence du groupe
      // n'est pas tranchée, sinon on effacerait la ligne qui porte la bonne.
      const jumelle = groupe.find(x => x !== l && x.Designation === l.Designation)
      console.log(`      ${l.ID_Mase}  ${l.Designation}${jumelle ? `   ← identique à ${jumelle.ID_Mase}` : ''}`)
    }
  }
  console.log('    → ces lignes NE SONT PAS IMPORTÉES. Corriger la référence dans le')
  console.log('      fichier de préparation, puis relancer.\n')
}

// ── Écriture ────────────────────────────────────────────────────────────────
if (!ecrire) {
  console.log('  Rapport seul. Relancer avec --ecrire pour importer.\n')
  process.exit(0)
}

const e = env()
if (!e.NEXT_PUBLIC_SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis (.env.local)')
  process.exit(2)
}
const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY)

const { data: cats, error: souciCats } = await sb.from('economat_categories').select('id, nom, parent_id')
if (souciCats) { console.error('Catégories illisibles — jouer schema-economat.sql d\'abord.'); process.exit(1) }
if (!cats?.length) { console.error('Aucune catégorie en base — jouer schema-economat.sql d\'abord.'); process.exit(1) }

const racines = new Map(cats.filter(c => !c.parent_id).map(c => [c.nom, c.id]))
const filles = new Map(cats.filter(c => c.parent_id).map(c => [`${c.parent_id}|${c.nom}`, c.id]))

// Le fournisseur est une liste CONTRÔLÉE. Un nom absent est créé plutôt que
// perdu — mais il est annoncé : c'est plus souvent une coquille (« opo »,
// « OPO Oeschger ») qu'une nouvelle maison, et c'est précisément ce que la
// liste contrôlée est là pour empêcher.
const { data: fours } = await sb.from('economat_fournisseurs').select('id, nom')
const parNom = new Map((fours || []).map(f => [f.nom.toLowerCase(), f.id]))
const inconnus = [...new Set(lignes.map(l => l.Fournisseur).filter(n => n && !parNom.has(n.toLowerCase())))]
if (inconnus.length) {
  console.log('  FOURNISSEURS AJOUTÉS À LA LISTE (vérifier que ce ne sont pas des coquilles) :')
  for (const nom of inconnus) console.log(`    ${nom}`)
  console.log()
  const { data: crees, error: souci } = await sb.from('economat_fournisseurs')
    .insert(inconnus.map(nom => ({ nom }))).select('id, nom')
  if (souci) { console.error('Fournisseurs :', souci.message); process.exit(1) }
  for (const f of crees) parNom.set(f.nom.toLowerCase(), f.id)
}
const fournisseurId = nom => parNom.get(String(nom || '').toLowerCase()) ?? null

function categorieId(ligne, manquantes) {
  const racine = racines.get(ligne.Categorie)
  if (!racine) { manquantes.add(ligne.Categorie); return null }
  if (!ligne.Sous_categorie) return racine
  const fille = filles.get(`${racine}|${ligne.Sous_categorie}`)
  if (!fille) { manquantes.add(`${ligne.Categorie} > ${ligne.Sous_categorie}`); return racine }
  return fille
}

// Écartés : les doublons secondaires (fusionnés) ET toutes les lignes d'un
// groupe en conflit (non résolues, donc hors import).
const fusionnes = new Set(doublons.flatMap(d => d.groupe.slice(1).map(l => l.ID_Mase)))
const bloques = new Set(conflits.flatMap(c => c.groupe.map(l => l.ID_Mase)))
const ecartes = new Set([...fusionnes, ...bloques])
const manquantes = new Set()

const aEcrire = lignes.filter(l => !ecartes.has(l.ID_Mase)).map(l => ({
  code: l.ID_Mase,
  designation: l.Designation,
  categorie_id: categorieId(l, manquantes),
  fournisseur_id: fournisseurId(l.Fournisseur),
  fournisseur_alt_id: fournisseurId(l.Fournisseur_alternatif),
  reference: vide(l.Reference_fournisseur),
  url_produit: vide(l.URL_produit),
  delai: vide(corriger(l.Delai_habituel)),
  unite: vide(l.Unite_gestion),
  stock_cible: vide(l.Stock_cible),
  seuil_bas: vide(l.Seuil_stock_bas),
  seuil_commander: vide(l.Seuil_commande),
  quantite_commande: vide(corriger(l.Quantite_commande)),
  emplacement: vide(l.Emplacement),
  notes: vide(l.Notes),
  archived: /^non$/i.test(l.Actif),
  created_by: 'import Numbers',
}))

if (manquantes.size) {
  console.log('  CATÉGORIES ABSENTES DE LA BASE (l\'article est rangé au niveau au-dessus) :')
  for (const m of manquantes) console.log(`    ${m}`)
  console.log()
}

// `etat` n'est PAS dans la charge : toutes les lignes valent « Stock OK » dans
// le fichier, c'est le DÉFAUT de la colonne, et un rejeu du script ne doit
// jamais remettre au vert un article qu'on vient de passer en rouge.
const { error } = await sb.from('economat_articles').upsert(aEcrire, { onConflict: 'code' })
if (error) { console.error('Import impossible :', error.message); process.exit(1) }

// Le plus grand code du FICHIER, pas du lot importé : les lignes laissées de
// côté portent des codes réels, qui entreront en base quand leur référence
// sera tranchée. Caler la séquence sur le lot les ferait réattribuer à des
// articles neufs — et un code d'économat ne se réattribue jamais.
const numero = c => Number(String(c).replace(/\D/g, '')) || 0
const dernier = Math.max(...lignes.map(l => numero(l.ID_Mase)))

console.log(`  ✓ ${aEcrire.length} articles importés.`)
console.log(`    ${fusionnes.size} doublons fusionnés, ${bloques.size} lignes laissées de côté (référence à trancher).\n`)
// La séquence des codes n'a pas bougé : l'import pose les codes lui-même, sans
// la consommer. Sans ce rattrapage, le prochain article créé à l'écran
// réclamerait ECO-0001 — déjà pris — et la route répondrait 500.
// `setval` n'est pas exposé à l'API de données : c'est une ligne à jouer dans
// l'éditeur SQL, comme les migrations.
console.log('  À JOUER DANS L\'ÉDITEUR SQL, sinon le prochain article créé échouera :')
console.log(`    SELECT setval('economat_code_seq', ${dernier});\n`)
