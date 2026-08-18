import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

// Inventaire des routes API et du niveau d'autorisation qu'elles appliquent.
//
// Ce test ne remplace pas des tests d'intégration : il garde l'INVENTAIRE. Une
// route ajoutée sans contrôle, ou une route admin rétrogradée en simple
// `requireUser`, fait échouer la suite — c'est exactement la dérive qui avait
// laissé app-settings et les crons ouverts à tout compte connecté.

const RACINE = join(process.cwd(), 'pages/api')

function routes(dir = RACINE, prefixe = '') {
  const out = []
  for (const entree of readdirSync(dir)) {
    const chemin = join(dir, entree)
    if (statSync(chemin).isDirectory()) out.push(...routes(chemin, `${prefixe}/${entree}`))
    else if (entree.endsWith('.js')) out.push({ route: `${prefixe}/${entree}`, chemin })
  }
  return out
}

// Niveau appliqué, déduit du helper importé et appelé.
function niveau({ chemin }) {
  const src = readFileSync(chemin, 'utf8')
  if (/requireCronOrAdmin\s*\(/.test(src)) return 'cron-ou-admin'
  if (/requireAdmin\s*\(/.test(src)) return 'admin'
  if (/requireUser\s*\(/.test(src)) return 'utilisateur'
  if (/getVerifiedUser\s*\(/.test(src)) return 'utilisateur'
  if (/secretMatches\s*\(/.test(src)) return 'secret'
  return 'aucun'
}

// Routes délibérément sans JWT, avec la raison. Toute autre route sans contrôle
// fait échouer le test.
const SANS_JWT = {
  '/display-projects.js': 'écran mural public — DTO réduit, cf. tests/displayProjects.test.js',
  '/warmup.js': 'réveil des fonctions serverless — ne renvoie aucune donnée',
}

// Routes qui doivent exiger l'admin ou le secret cron, jamais un simple membre.
const ADMIN_ATTENDU = [
  '/app-settings/[key].js',        // IBAN et raison sociale imprimés sur les factures
  '/storage-invoices/cron.js',     // génère des factures
  '/sync-odoo-clients.js',         // réécrit le fichier clients
  '/push/send.js',                 // notifie toute l'équipe
]

describe('inventaire des autorisations API', () => {
  const toutes = routes()

  it('trouve les routes API', () => {
    expect(toutes.length).toBeGreaterThan(40)
  })

  it('aucune route sans contrôle en dehors des exceptions documentées', () => {
    const nues = toutes.filter(r => niveau(r) === 'aucun').map(r => r.route)
    expect(nues.sort()).toEqual(Object.keys(SANS_JWT).sort())
  })

  it('les routes sensibles exigent l\'admin ou le secret cron', () => {
    for (const route of ADMIN_ATTENDU) {
      const r = toutes.find(x => x.route === route)
      expect(r, `route absente : ${route}`).toBeTruthy()
      expect(['admin', 'cron-ou-admin'], `${route} trop permissive`).toContain(niveau(r))
    }
  })

  it('aucune route ne compare un secret avec ===', () => {
    // Une comparaison de chaînes s'arrête au premier caractère différent et
    // fuit le préfixe correct ; secretMatches compare à temps constant.
    const fautives = toutes.filter(({ chemin }) => {
      const src = readFileSync(chemin, 'utf8')
      return /(SECRET|secret)\s*(===|!==)|(===|!==)\s*(process\.env\.\w*SECRET)/.test(src)
    }).map(r => r.route)
    expect(fautives).toEqual([])
  })

  it('aucune route n\'accorde l\'admin sur le nom plutôt que sur le rôle', () => {
    const fautives = toutes.filter(({ chemin }) => {
      const src = readFileSync(chemin, 'utf8')
      return /name\s*===\s*ADMIN_USER|ADMIN_USER\s*===\s*\w+\.name/.test(src)
    }).map(r => r.route)
    expect(fautives).toEqual([])
  })

  it('aucune identité ne provient du corps de la requête', () => {
    const fautives = toutes.filter(({ chemin }) => {
      const src = readFileSync(chemin, 'utf8')
      return /req\.headers\['?x-actor/.test(src)
    }).map(r => r.route)
    expect(fautives).toEqual([])
  })
})
