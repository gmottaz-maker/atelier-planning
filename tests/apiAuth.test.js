import { describe, it, expect, vi, beforeEach } from 'vitest'
import { faireRes, faireReq, connecter, ANONYME, MEMBRE, AUTRE, ADMIN } from './helpers/routeHarness'

// Ces tests appellent les VRAIS handlers. Une matrice d'autorisation recopiée
// dans un test ne prouverait rien sur le code livré ; ici, changer une route
// pour qu'elle accepte un membre fait échouer la suite.

// Seul le socle est simulé : le client Supabase et les services externes.
// TOUTE la chaîne d'autorisation — getVerifiedUser, requireUser, requireAdmin,
// requireCronOrAdmin — est le code de production.
//
// Plusieurs routes appellent getSupabaseServer() au niveau MODULE
// (`const supabase = getSupabaseServer()`), donc une seule fois à l'import.
// Rendre l'objet courant les figerait sur la première base du fichier de test.
// On rend donc un proxy qui redirige vers la base du test en cours.
let base = null
const proxy = new Proxy({}, {
  get: (_, prop) => base?.[prop],
})
vi.mock('../lib/supabase-server', () => ({ getSupabaseServer: () => proxy }))
vi.mock('../lib/kdrive', () => ({
  listDir: async () => [], downloadStream: async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }),
  thumbnailStream: async () => ({ headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => new ArrayBuffer(8) }),
  upload: async () => ({ id: 1, name: 'f.pdf' }), del: async () => {}, ensureProjectFolder: async () => 1,
}))
vi.mock('../lib/todoist', () => ({
  todoistEnabled: () => false, TODOIST_SYNC_USER: 'Guillaume',
  createTask: async () => null, updateTask: async () => {}, deleteTask: async () => {},
}))
vi.mock('../lib/push-server', () => ({ notifyTeam: async () => {} }))

let entetes = {}
beforeEach(() => { const c = connecter(ANONYME); base = c.base; entetes = c.headers })

/** Connecte `qui`, garnit la base, puis appelle la route. */
const sous = (qui, tables = {}) => {
  const c = connecter(qui, { tables })
  base = c.base; entetes = c.headers
  return c
}

const appeler = async (mod, options = {}) => {
  const res = faireRes()
  await mod.default(faireReq({ ...options, headers: { ...entetes, ...(options.headers || {}) } }), res)
  return res
}

describe('app-settings — IBAN et raison sociale imprimés sur les factures', () => {
  const charger = () => import('../pages/api/app-settings/[key]')

  it('refuse un anonyme', async () => {
    const res = await appeler(await charger(), { method: 'GET', query: { key: 'company_info' } })
    expect(res.statusCode).toBe(401)
  })

  it('laisse un membre lire les clés dont l\'interface a besoin', async () => {
    sous(MEMBRE, { app_settings: [{ key: 'company_info', value: { name: 'AL' } }] })
    const res = await appeler(await charger(), { method: 'GET', query: { key: 'company_info' } })
    expect(res.statusCode).toBe(200)
  })

  it('refuse à un membre la lecture d\'une clé arbitraire', async () => {
    sous(MEMBRE)
    const res = await appeler(await charger(), { method: 'GET', query: { key: 'nimporte_quoi' } })
    expect(res.statusCode).toBe(404)
  })

  it('REFUSE à un membre de modifier — il pourrait détourner les virements', async () => {
    sous(MEMBRE)
    const res = await appeler(await charger(), {
      method: 'PUT', query: { key: 'company_info' }, body: { value: { iban: 'CH00 PIRATE' } },
    })
    expect(res.statusCode).toBe(403)
  })

  it('laisse l\'admin modifier', async () => {
    sous(ADMIN, { app_settings: [] })
    const res = await appeler(await charger(), {
      method: 'PUT', query: { key: 'company_info' }, body: { value: { iban: 'CH85 …' } },
    })
    expect([200, 500]).toContain(res.statusCode)   // 200 si l'upsert simulé répond
    expect(res.statusCode).not.toBe(403)
  })
})

describe('tâches privées', () => {
  const taches = [
    { id: 't1', title: 'Publique', is_private: false, responsible: 'Arnaud', status: 'active' },
    { id: 't2', title: 'Privée Arnaud', is_private: true, responsible: 'Arnaud', status: 'active' },
    { id: 't3', title: 'Privée Gabin', is_private: true, responsible: 'Gabin', status: 'active' },
  ]

  it('ne renvoie jamais la tâche privée d\'un collègue', async () => {
    sous(MEMBRE, { tasks: taches })            // Gabin
    const res = await appeler(await import('../pages/api/tasks/index'), { method: 'GET' })
    expect(res.statusCode).toBe(200)
    const titres = res.body.map(t => t.title)
    expect(titres).toContain('Privée Gabin')
    expect(titres).not.toContain('Privée Arnaud')
  })

  it('laisse l\'admin tout voir', async () => {
    sous(ADMIN, { tasks: taches })
    const res = await appeler(await import('../pages/api/tasks/index'), { method: 'GET' })
    expect(res.body).toHaveLength(3)
  })

  it('répond 404 — pas 403 — quand un membre vise la tâche privée d\'un autre', async () => {
    // Un 403 confirmerait que la tâche existe.
    sous(MEMBRE, { tasks: taches })
    const res = await appeler(await import('../pages/api/tasks/[id]'), {
      method: 'PUT', query: { id: 't2' }, body: { title: 'détourné' },
    })
    expect(res.statusCode).toBe(404)
  })

  it('laisse un membre modifier sa propre tâche privée', async () => {
    sous(MEMBRE, { tasks: taches })
    const res = await appeler(await import('../pages/api/tasks/[id]'), {
      method: 'PUT', query: { id: 't3' }, body: { title: 'à jour' },
    })
    expect(res.statusCode).not.toBe(404)
    expect(res.statusCode).not.toBe(403)
  })
})

describe('fichiers kDrive', () => {
  const charger = () => import('../pages/api/kdrive/download')

  it('refuse un identifiant qui n\'est référencé nulle part', async () => {
    sous(MEMBRE)
    const res = await appeler(await charger(), { method: 'GET', query: { fileId: '999' } })
    expect(res.statusCode).toBe(404)
  })

  it('REFUSE à un membre une facture fournisseur, même référencée', async () => {
    sous(MEMBRE, { supplier_invoices: [{ id: 1, kdrive_file_id: 42, kdrive_filename: 'f.pdf' }] })
    const res = await appeler(await charger(), { method: 'GET', query: { fileId: '42' } })
    expect(res.statusCode).toBe(404)
  })

  it('REFUSE à un membre le reçu d\'un collègue', async () => {
    sous(MEMBRE, { expenses: [{ id: 1, kdrive_file_id: 7, kdrive_filename: 'r.jpg', user_name: 'Arnaud' }] })
    const res = await appeler(await charger(), { method: 'GET', query: { fileId: '7' } })
    expect(res.statusCode).toBe(404)
  })

  it('laisse un membre ouvrir son propre reçu', async () => {
    sous(AUTRE, { expenses: [{ id: 1, kdrive_file_id: 7, kdrive_filename: 'r.jpg', user_name: 'Arnaud' }] })
    const res = await appeler(await charger(), { method: 'GET', query: { fileId: '7' } })
    expect(res.statusCode).not.toBe(404)
  })

  it('laisse l\'admin ouvrir une facture fournisseur', async () => {
    sous(ADMIN, { supplier_invoices: [{ id: 1, kdrive_file_id: 42, kdrive_filename: 'f.pdf' }] })
    const res = await appeler(await charger(), { method: 'GET', query: { fileId: '42' } })
    expect(res.statusCode).not.toBe(404)
  })

  it('sert une pièce comptable en pièce jointe, avec nosniff', async () => {
    sous(ADMIN, { supplier_invoices: [{ id: 1, kdrive_file_id: 42, kdrive_filename: 'f.pdf' }] })
    const res = await appeler(await charger(), { method: 'GET', query: { fileId: '42' } })
    expect(res.headers['Content-Disposition']).toMatch(/^attachment/)
    expect(res.headers['X-Content-Type-Options']).toBe('nosniff')
  })
})

describe('navigation kDrive', () => {
  it('refuse un jeton de dossier absent ou forgé', async () => {
    sous(MEMBRE, { projects: [{ id: 'p1', kdrive_folder_id: 100 }] })
    const res = await appeler(await import('../pages/api/projects/[id]/kdrive-listing'), {
      method: 'GET', query: { id: 'p1', folderToken: 'forge.forge' },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('routes financières et cron', () => {
  it('refuse à un membre la liste des factures clients', async () => {
    sous(MEMBRE)
    const res = await appeler(await import('../pages/api/customer-invoices/index'), { method: 'GET' })
    expect(res.statusCode).toBe(403)
  })

  it('refuse à un membre le déclenchement de la facturation de stockage', async () => {
    sous(MEMBRE)
    const res = await appeler(await import('../pages/api/storage-invoices/cron'), { method: 'GET' })
    expect(res.statusCode).toBe(403)
  })

  it('refuse à un anonyme la synchronisation Odoo', async () => {
    sous(ANONYME)
    const res = await appeler(await import('../pages/api/sync-odoo-clients'), { method: 'GET' })
    expect(res.statusCode).toBe(401)
  })
})

describe('écran mural public', () => {
  it('ne renvoie aucun champ interne, sans authentification', async () => {
    sous(ANONYME, { projects: [{
      id: 'p1', name: 'Folklor', client: 'Red Bull', deadline: '2026-09-01', responsible: 'Arnaud',
      delivery_type: 'Livraison', short_description: 'Bar', status: 'active', color_override: null,
    }] })
    const res = await appeler(await import('../pages/api/display-projects'), { method: 'GET' })
    expect(res.statusCode).toBe(200)
    const brut = JSON.stringify(res.body)
    for (const interdit of ['quote_data', 'notes', 'client_address', 'kdrive_folder_id']) {
      expect(brut).not.toContain(interdit)
    }
    expect(res.headers['Cache-Control']).toBe('no-store')
  })
})

describe('identité des abonnements push', () => {
  it('ignore le nom envoyé dans le corps et retient celui du JWT', async () => {
    sous(MEMBRE, { push_subscriptions: [] })   // Gabin
    const mod = await import('../pages/api/push/subscribe')
    const res = faireRes()
    await mod.default(faireReq({
      method: 'POST',
      headers: entetes,
      body: {
        user: 'Guillaume',                     // usurpation tentée
        subscription: { endpoint: 'https://push.example/abc', keys: { p256dh: 'k', auth: 'a' } },
      },
    }), res)
    expect(res.statusCode).toBe(200)
    const appel = base.from.mock.results.at(-1).value
    expect(appel._upserted.user_name).toBe('Gabin')
  })

  it('refuse un abonnement mal formé', async () => {
    sous(MEMBRE)
    const res = await appeler(await import('../pages/api/push/subscribe'), {
      method: 'POST', body: { subscription: { endpoint: 'pas-une-url' } },
    })
    expect(res.statusCode).toBe(400)
  })
})
