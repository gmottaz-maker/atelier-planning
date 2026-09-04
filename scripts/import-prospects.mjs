#!/usr/bin/env node
// Import du classeur de prospection dans la table `prospects`.
//
//   node scripts/import-prospects.mjs <fichier.xlsx> [--pour-de-vrai]
//
// À BLANC par défaut : sans `--pour-de-vrai`, il affiche ce qu'il ferait et
// n'écrit rien. Un import de 47 sociétés qu'on découvre après coup est
// pénible à défaire.
//
// IDEMPOTENT : une société déjà présente (même nom) est ignorée, pas
// dupliquée. Relancer le script après avoir complété le fichier n'importe donc
// que les nouvelles lignes.
//
// Ce qui n'est PAS importé : les statuts « Client existant » et « Partenaire
// existant ». Ce ne sont pas des prospects — ils ont leur place dans les
// contacts, et les mêler au démarchage fausserait les compteurs.
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { lireXlsx } from './lib-xlsx.mjs'

const EXCLUS = new Set(['Client existant', 'Partenaire existant'])

// Le fichier n'a pas d'étape : il a un statut de suivi. La traduction perd peu,
// parce qu'aucune de ces lignes n'a encore été contactée directement — les
// colonnes « Dernier contact » et « Date prochaine action » sont vides partout.
const ETAPE = {
  'À prospecter': 'a_contacter',
  'À rechercher': 'a_contacter',
  'Relation indirecte': 'a_contacter',
  'À développer': 'a_contacter',
}

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

const propre = v => String(v ?? '').trim()
const ouNull = v => propre(v) || null
const estEmail = v => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(propre(v))

// « Email / LinkedIn » mélange les deux, séparés par « / ». On démêle plutôt
// que de tout ranger dans un champ e-mail qui ne serait pas cliquable.
function demeler(brut) {
  const morceaux = propre(brut).split(/\s*\/\s*(?=https?:|[^@\s]+@)/).filter(Boolean)
  let email = null, linkedin = null
  for (const m of morceaux) {
    if (estEmail(m)) email ||= m
    else if (/linkedin\.com/i.test(m)) linkedin ||= m
  }
  return { email, linkedin }
}

async function main() {
  const [fichier, ...flags] = process.argv.slice(2)
  const pourDeVrai = flags.includes('--pour-de-vrai')
  if (!fichier) { console.error('Usage : node scripts/import-prospects.mjs <fichier.xlsx> [--pour-de-vrai]'); process.exit(2) }

  const e = env()
  const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY)

  const feuilles = Object.fromEntries(lireXlsx(fichier))
  const lignes = feuilles['Prospects']
  if (!lignes) { console.error('Feuille « Prospects » introuvable.'); process.exit(2) }
  const entetes = lignes[0].map(propre)
  const col = nom => entetes.indexOf(nom)
  const v = (l, nom) => { const i = col(nom); return i < 0 ? '' : propre(l[i]) }

  const { data: dejaLa } = await sb.from('prospects').select('name')
  const connus = new Set((dejaLa || []).map(p => propre(p.name).toLowerCase()))

  const aFaire = []
  const ignores = { exclus: [], doublons: [], vides: 0 }

  for (const l of lignes.slice(1)) {
    if (!l.some(Boolean)) continue
    const nom = v(l, 'Entreprise')
    if (!nom) { ignores.vides++; continue }
    const statut = v(l, 'Statut')
    if (EXCLUS.has(statut)) { ignores.exclus.push(`${nom} (${statut})`); continue }
    if (connus.has(nom.toLowerCase())) { ignores.doublons.push(nom); continue }

    const contexte = v(l, 'Relation / contexte')
    // La source ne s'invente pas. Le fichier ne la dit que pour les lignes
    // portant une relation existante ; ailleurs on laisse vide plutôt que de
    // supposer « internet » pour tout le monde.
    const relationnel = ['Relation indirecte', 'À développer'].includes(statut)

    const notes = [
      contexte && `Contexte : ${contexte}`,
      v(l, 'Notes'),
      v(l, 'Prochaine action') && `Prochaine action : ${v(l, 'Prochaine action')}`,
      v(l, 'Source contact / vérification') && `Vérification : ${v(l, 'Source contact / vérification')}`,
      statut && !ETAPE[statut] ? `Statut d'origine : ${statut}` : '',
    ].filter(Boolean).join('\n\n')

    const prospect = {
      name: nom,
      sector: ouNull(v(l, 'Catégorie')),
      zone: ouNull(v(l, 'Zone')),
      priority: ['A+', 'A', 'B', 'C'].includes(v(l, 'Priorité')) ? v(l, 'Priorité') : null,
      potential: ['Très fort', 'Fort', 'À qualifier', 'Faible'].includes(v(l, 'Potentiel')) ? v(l, 'Potentiel') : null,
      stage: ETAPE[statut] || 'a_contacter',
      angle: ouNull(v(l, 'Pourquoi Amazing Lab')),
      services: ouNull(v(l, 'Prestations à proposer')),
      target_role: ouNull(v(l, 'Contact cible')),
      website: ouNull(v(l, 'Site / source')),
      source: relationnel ? 'recommandation' : null,
      source_detail: relationnel ? (contexte.slice(0, 200) || null) : null,
      notes: notes || null,
    }

    const personnes = []
    const principal = v(l, 'Nom du contact')
    if (principal) {
      const melange = demeler(v(l, 'Email / LinkedIn'))
      personnes.push({
        name: principal,
        role: ouNull(v(l, 'Fonction / rôle vérifié')) || ouNull(v(l, 'Contact cible')),
        email: ouNull(v(l, 'Email public')) || melange.email,
        linkedin: ouNull(v(l, 'LinkedIn contact')) || melange.linkedin,
        confidence: ouNull(v(l, 'Confiance contact')),
      })
    }
    // « Contact secondaire » porte parfois « Nom – fonction » sur une seule
    // ligne : on coupe au tiret cadratin plutôt que de perdre la fonction.
    const second = v(l, 'Contact secondaire')
    if (second) {
      const [n, ...reste] = second.split(/\s+[–—-]\s+/)
      personnes.push({ name: propre(n), role: propre(reste.join(' – ')) || null })
    }

    aFaire.push({ prospect, personnes })
  }

  console.log(`\n  Fichier : ${fichier}`)
  console.log(`  ${lignes.length - 1} lignes lues`)
  console.log(`  ${ignores.exclus.length} exclues (client ou partenaire existant) :`)
  for (const x of ignores.exclus) console.log(`      · ${x}`)
  if (ignores.doublons.length) console.log(`  ${ignores.doublons.length} déjà en base, ignorées : ${ignores.doublons.join(', ')}`)
  console.log(`\n  ${aFaire.length} prospects à créer, ${aFaire.reduce((n, x) => n + x.personnes.length, 0)} personnes\n`)

  const parPrio = {}
  for (const x of aFaire) parPrio[x.prospect.priority || '—'] = (parPrio[x.prospect.priority || '—'] || 0) + 1
  console.log('  Par priorité :', Object.entries(parPrio).sort().map(([k, n]) => `${k} ${n}`).join(' · '))
  const avecSource = aFaire.filter(x => x.prospect.source).length
  console.log(`  Source renseignée : ${avecSource} (les autres restent vides — le fichier ne la dit pas)\n`)

  if (!pourDeVrai) {
    console.log('  ── À BLANC — rien n\'a été écrit. Trois exemples de ce qui serait créé :\n')
    for (const x of aFaire.slice(0, 3)) {
      console.log('   ', JSON.stringify(x.prospect, null, 2).replace(/\n/g, '\n    '))
      if (x.personnes.length) console.log('     personnes :', JSON.stringify(x.personnes))
      console.log()
    }
    console.log('  Relancer avec --pour-de-vrai pour écrire.\n')
    return
  }

  let crees = 0, pers = 0
  for (const { prospect, personnes } of aFaire) {
    const { data, error } = await sb.from('prospects').insert(prospect).select('id').single()
    if (error) { console.error(`  ✗ ${prospect.name} : ${error.message}`); continue }
    crees++
    if (personnes.length) {
      const { error: e2 } = await sb.from('prospect_people')
        .insert(personnes.map(p => ({ ...p, prospect_id: data.id })))
      if (e2) console.error(`  ! ${prospect.name} : personnes non créées — ${e2.message}`)
      else pers += personnes.length
    }
  }
  console.log(`\n  ✓ ${crees} prospects créés, ${pers} personnes rattachées.\n`)
}

main().catch(e => { console.error(e); process.exit(1) })
