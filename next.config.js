/** @type {import('next').NextConfig} */
const { execSync } = require('child_process')

// ── Version affichée dans l'application ─────────────────────────────────────
// Sert à répondre à une seule question : « mon push est-il en ligne ? ».
// Les deux valeurs sont figées au BUILD et inlinées dans le bundle, donc
// identiques côté serveur et côté client — pas de désynchronisation d'hydratation.

function commitCourt() {
  // Vercel fournit le SHA du commit déployé. En local il n'existe pas : on le
  // demande à git, et un dépôt absent (archive, conteneur sans .git) ne doit
  // pas casser le build pour autant.
  const surVercel = process.env.VERCEL_GIT_COMMIT_SHA
  if (surVercel) return surVercel.slice(0, 7)
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return 'local'
  }
}

// Heure de Zurich, assemblée depuis `formatToParts` : contrairement à un
// `format()` direct, on ne dépend d'aucun séparateur choisi par la version
// d'ICU du moment. Même précaution que lib/money.js, pour la même raison.
function heureBuild() {
  const p = {}
  for (const { type, value } of new Intl.DateTimeFormat('fr-CH', {
    timeZone: 'Europe/Zurich',
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date())) p[type] = value
  return `${p.day}.${p.month} ${p.hour}:${p.minute}`
}

const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_COMMIT: commitCourt(),
    NEXT_PUBLIC_BUILD_TIME: heureBuild(),
  },
  // Inclut le binaire Chromium (@sparticuz/chromium) dans les fonctions PDF —
  // les .br sont lus à l'exécution, donc pas tracés automatiquement par Next.
  experimental: {
    outputFileTracingIncludes: {
      '/api/customer-invoices/[id]/pdf': ['./node_modules/@sparticuz/chromium/bin/**'],
      '/api/projects/[id]/devis-pdf': ['./node_modules/@sparticuz/chromium/bin/**'],
      '/api/send-document': ['./node_modules/@sparticuz/chromium/bin/**'],
    },
  },
}

module.exports = nextConfig
