#!/usr/bin/env node
// Détection de secrets dans les fichiers suivis par git.
//
// Le dépôt a déjà porté un jeton GitHub en clair (dans l'URL du remote, et
// recommandé noir sur blanc par le CLAUDE.md). Ce contrôle tourne en CI pour
// que ça ne se reproduise pas silencieusement.
//
// Volontairement simple et sans dépendance : il attrape les formes de secrets
// que ce projet manipule réellement, pas toutes celles qui existent.
import { execSync } from 'child_process'
import { readFileSync, statSync } from 'fs'

const MOTIFS = [
  { nom: 'jeton GitHub (classique)',   re: /\bghp_[A-Za-z0-9]{30,}/ },
  { nom: 'jeton GitHub (fine-grained)', re: /\bgithub_pat_[A-Za-z0-9_]{50,}/ },
  { nom: 'clé Anthropic',              re: /\bsk-ant-[A-Za-z0-9\-_]{20,}/ },
  { nom: 'clé Resend',                 re: /\bre_[A-Za-z0-9]{20,}/ },
  { nom: 'JWT Supabase',               re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{20,}\./ },
  { nom: 'identifiant dans une URL',    re: /https?:\/\/[^/\s:@]+:[^/\s@]{8,}@/ },
  { nom: 'chaîne de connexion Postgres', re: /postgres(ql)?:\/\/[^:\s]+:[^@\s]{8,}@/ },
  { nom: 'clé privée',                 re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
]

// Fichiers dont le contenu est par nature exclu : exemples et documentation de
// sécurité citent des formes de secrets sans en être.
const EXCLUS = [/^\.env\.example$/, /^SECURITY\.md$/, /^scripts\/check-secrets\.mjs$/,
                /^package-lock\.json$/, /^public\/ruco\//]

const BINAIRE = /\.(png|jpe?g|gif|webp|heic|pdf|ico|woff2?|ttf|zip)$/i

const fichiers = execSync('git ls-files', { encoding: 'utf8' })
  .split('\n').filter(Boolean)
  .filter(f => !BINAIRE.test(f) && !EXCLUS.some(re => re.test(f)))

let trouvailles = 0
for (const f of fichiers) {
  let contenu
  try {
    if (statSync(f).size > 2_000_000) continue
    contenu = readFileSync(f, 'utf8')
  } catch { continue }

  contenu.split('\n').forEach((ligne, i) => {
    for (const { nom, re } of MOTIFS) {
      if (!re.test(ligne)) continue
      // On n'imprime jamais la valeur : seulement où regarder.
      console.error(`✗ ${f}:${i + 1} — ${nom}`)
      trouvailles++
    }
  })
}

// Le fichier d'environnement ne doit jamais être suivi, même vide.
if (fichiers.some(f => f === '.env.local' || f === '.env')) {
  console.error('✗ un fichier .env est suivi par git')
  trouvailles++
}

if (trouvailles) {
  console.error(`\n${trouvailles} secret(s) potentiel(s). Retirer la valeur, la faire tourner, puis nettoyer l'historique si elle a été poussée.`)
  process.exit(1)
}
console.log(`✓ aucun secret détecté (${fichiers.length} fichiers examinés)`)
