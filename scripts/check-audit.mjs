#!/usr/bin/env node
// Audit des dépendances de production, tolérant aux pannes de npm.
//
//   npm run check:audit
//
// Pourquoi ce script plutôt que `npm audit --audit-level=critical` en une
// ligne : le 4 septembre 2026, l'endpoint d'audit de npm a répondu 503. La
// commande a attendu SEPT minutes puis échoué, et la CI a viré au rouge sur du
// code parfaitement sain. Deux builds y sont passés.
//
// La distinction que `npm audit` ne fait pas, et que ce script fait :
//
//   · une faille CRITIQUE dans une dépendance de production  → on bloque ;
//   · npm injoignable                                        → on AVERTIT.
//
// Le second cas n'est pas un laisser-passer : c'est un choix d'ordre. Bloquer
// un correctif urgent parce que le registre npm a le hoquet coûte plus cher que
// de reporter un contrôle de vulnérabilités de quelques heures — et le
// contrôle repasse à chaque build suivant. Le fichier de CI dit déjà la même
// chose en ne bloquant que sur « critical » et pas sur « high ».
import { execFile } from 'child_process'

const TENTATIVES = 3
const ATTENTES = [4000, 12000]      // pauses entre les tentatives
const DELAI_MAX = 90_000            // au-delà, l'endpoint ne répond pas : on n'attend pas 7 min

function auditer() {
  return new Promise(resolve => {
    execFile('npm', ['audit', '--omit=dev', '--json'],
      { maxBuffer: 32 * 1024 * 1024, timeout: DELAI_MAX },
      (erreur, stdout, stderr) => {
        // `npm audit` sort en code 1 dès qu'il TROUVE quelque chose : un code
        // non nul ne dit donc rien à lui seul. Seule la sortie JSON tranche.
        try { return resolve({ rapport: JSON.parse(stdout) }) } catch {}
        // Le motif de la panne vit sur STDERR (« 503 Service Unavailable »,
        // « ENOTFOUND »…). Sans lui, le journal de CI dirait « raison
        // inconnue », ce qui cacherait un vrai problème derrière un
        // avertissement bénin.
        const motif = String(stderr || '').split('\n')
          .map(l => l.replace(/^npm (warn|error)\s*/i, '').trim())
          .filter(l => l && !/^A complete log/i.test(l))
          .pop()
        resolve({ panne: motif || erreur?.message || 'sortie illisible' })
      })
  })
}

const pause = ms => new Promise(r => setTimeout(r, ms))

// npm décrit une panne d'audit de trois façons selon le cas : `error` peut être
// une CHAÎNE (« Service Unavailable », vu en CI le 4 septembre), un OBJET
// { summary, detail } — souvent vides — et le motif utile se trouve alors dans
// `message` (« ECONNREFUSED… »). Les trois, sinon le journal dit « raison
// inconnue » et cache un vrai problème derrière un avertissement bénin.
function motifDe(rapport, panne) {
  const e = rapport?.error
  const depuisErreur = typeof e === 'string' ? e : (e?.summary || e?.detail || '')
  return String(depuisErreur || rapport?.message || panne || '').trim() || 'raison inconnue'
}

const { rapport, panne } = await (async () => {
  let dernier = null
  for (let i = 0; i < TENTATIVES; i++) {
    if (i > 0) await pause(ATTENTES[i - 1])
    dernier = await auditer()
    if (dernier.rapport && !dernier.rapport.error) return dernier
    if (i < TENTATIVES - 1) {
      console.log(`  · tentative ${i + 1}/${TENTATIVES} : ${motifDe(dernier.rapport, dernier.panne).slice(0, 90)}`)
    }
  }
  return dernier
})()

if (!rapport || rapport.error) {
  const quoi = motifDe(rapport, panne)
  console.log('')
  console.log(`  ⚠ Audit npm indisponible après ${TENTATIVES} tentatives — ${quoi.slice(0, 140)}`)
  console.log('    Le contrôle est REPORTÉ, pas annulé : il repassera au prochain build.')
  console.log('')
  // Marque l'avertissement dans l'interface GitHub Actions, pour qu'un report
  // répété se voie au lieu de passer inaperçu.
  if (process.env.GITHUB_ACTIONS) console.log('::warning title=Audit npm indisponible::Contrôle des vulnérabilités reporté au prochain build.')
  process.exit(0)
}

const n = rapport.metadata?.vulnerabilities || {}
const resume = ['critical', 'high', 'moderate', 'low']
  .map(k => `${n[k] || 0} ${k}`).join(' · ')
console.log(`\n  Dépendances de production : ${resume}`)

if ((n.critical || 0) === 0) {
  console.log('  ✓ aucune faille critique\n')
  process.exit(0)
}

// On ne bloque que sur « critical », comme avant — mais on DIT lesquelles,
// pour que la personne qui reçoit le build rouge sache quoi corriger.
console.log('\n  ✗ failles CRITIQUES :')
for (const [nom, v] of Object.entries(rapport.vulnerabilities || {})) {
  if (v.severity !== 'critical') continue
  const via = (v.via || []).map(x => typeof x === 'string' ? x : x.title).filter(Boolean)
  console.log(`      ${nom} — ${via.join(' ; ').slice(0, 120)}`)
}
console.log('')
process.exit(1)
