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

// ── En-têtes de sécurité ─────────────────────────────────────────────────────
//
// Jusqu'au 24 septembre 2026, la production n'en servait qu'UN : le HSTS posé
// par Vercel. Pas de CSP, pas de nosniff, pas de Referrer-Policy — sur une
// application qui porte des IBAN, des marges et des factures.
//
// La CSP est écrite par ce que l'application charge RÉELLEMENT dans le
// navigateur, vérifié origine par origine. Tout le reste — Anthropic, Groq,
// Resend, Todoist, kDrive, Odoo — est appelé depuis les routes API, côté
// serveur : la CSP ne s'y applique pas, et les y inscrire n'aurait fait
// qu'élargir la règle pour rien.
const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL || ''

const CSP = [
  "default-src 'self'",

  // Google Maps (saisie d'adresse) et Google Identity + gapi (agenda sur
  // /home). `'unsafe-eval'` uniquement en développement : c'est webpack et son
  // rechargement à chaud qui l'exigent, jamais la production.
  `script-src 'self' https://maps.googleapis.com https://apis.google.com https://accounts.google.com https://www.gstatic.com${process.env.NODE_ENV === 'development' ? " 'unsafe-eval' 'unsafe-inline'" : ''}`,

  // Toute l'interface est en styles INLINE (convention du dépôt, cf. theme.js),
  // donc `'unsafe-inline'` n'est pas un relâchement ici : c'est la seule façon
  // d'écrire la règle. fonts.googleapis sert l'aperçu imprimable de l'offre.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",

  // `data:` pour les photos réduites dans le navigateur avant envoi (canvas),
  // `blob:` pour les aperçus de fichiers déposés. Le bucket public de Supabase
  // porte les photos de l'économat ; gstatic et googleapis, les tuiles de carte.
  `img-src 'self' data: blob: ${SUPABASE} https://*.googleapis.com https://*.gstatic.com`,

  `connect-src 'self' ${SUPABASE} ${SUPABASE.replace(/^https:/, 'wss:')} https://maps.googleapis.com https://www.googleapis.com https://accounts.google.com https://nominatim.openstreetmap.org`,

  // Le sélecteur de compte de Google Identity s'affiche dans une iframe.
  'frame-src https://accounts.google.com',

  "media-src 'self' blob:",           // dictée : l'enregistrement est un blob
  "worker-src 'self'",                // le service worker
  "object-src 'none'",                // ni Flash, ni PDF embarqué : rien à autoriser
  "base-uri 'self'",                  // interdit de réécrire l'origine des URL relatives
  "form-action 'self'",               // un formulaire ne poste que chez nous
  "frame-ancestors 'self'",           // pas de mise en cadre par un tiers (clickjacking)
].join('; ')

const ENTETES = [
  { key: 'Content-Security-Policy', value: CSP },
  // Un fichier servi en `text/plain` ne doit pas pouvoir être exécuté comme du
  // script parce que le navigateur a « deviné » son type. lib/fileType.js le
  // posait déjà sur les fichiers ; ici, c'est pour toutes les pages.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Le chemin d'une page — /projects/<id> — ne part pas chez un tiers.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Caméra et micro restent AUTORISÉS pour nous : la photo d'un justificatif
  // et la dictée en dépendent. Le reste est fermé.
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(), payment=(), usb=(), interest-cohort=()' },
  // Doublon volontaire de `frame-ancestors`, pour les navigateurs qui ne
  // lisent pas encore la CSP.
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
]

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: '/:path*', headers: ENTETES }]
  },
  env: {
    NEXT_PUBLIC_COMMIT: commitCourt(),
    NEXT_PUBLIC_BUILD_TIME: heureBuild(),
  },
  // Inclut le binaire Chromium (@sparticuz/chromium) dans les fonctions PDF —
  // les .br sont lus à l'exécution, donc pas tracés automatiquement par Next.
  //
  // Clé de PREMIER niveau depuis Next 15 : sous `experimental`, elle est
  // ignorée en silence et le build reste vert. Le Chromium ne partirait alors
  // plus avec les fonctions, et les PDF (devis, factures, envois) tomberaient
  // en production seulement.
  outputFileTracingIncludes: {
    '/api/customer-invoices/[id]/pdf': ['./node_modules/@sparticuz/chromium/bin/**'],
    '/api/projects/[id]/devis-pdf': ['./node_modules/@sparticuz/chromium/bin/**'],
    '/api/send-document': ['./node_modules/@sparticuz/chromium/bin/**'],
    '/api/heures/feuille': ['./node_modules/@sparticuz/chromium/bin/**'],
    // La présentation client embarque en plus les Apercu Pro : sans elles, le
    // deck sort en Helvetica — la fonte EST la marque, et aucune erreur ne
    // serait levée.
    '/api/presentations/[id]/pdf': [
      './node_modules/@sparticuz/chromium/bin/**',
      './public/fonts/**',
    ],
    // Les cartes Kanban de l'économat, pour la même raison : une carte en
    // Helvetica n'est pas une carte de la maison, et rien ne le signalerait.
    '/api/economat/cartes': [
      './node_modules/@sparticuz/chromium/bin/**',
      './public/fonts/**',
    ],
  },
}

module.exports = nextConfig
