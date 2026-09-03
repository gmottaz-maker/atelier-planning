import { describe, it, expect, vi, beforeEach } from 'vitest'
import { faireRes, faireReq, connecter, ANONYME, MEMBRE, ADMIN } from './helpers/routeHarness'

// Ce test existe parce qu'un `level` non déclaré traînait au point d'appel de
// buildDevisHtml : reste du couple détaillé/résumé abandonné. Le build ne dit
// rien d'un identifiant libre, et aucun test n'exerçait cette route — l'envoi
// d'offre échouait donc en production sur « level is not defined », alors que
// le téléchargement du même PDF passait par un autre appel, correct lui.
//
// On simule le rendu PDF et le réseau, mais TOUT le corps de la route est le
// code de production : c'est ce qui aurait attrapé le bug.
let base = null
const proxy = new Proxy({}, { get: (_, prop) => base?.[prop] })
vi.mock('../lib/supabase-server', () => ({ getSupabaseServer: () => proxy }))
vi.mock('../lib/htmlToPdf', () => ({ htmlToPdf: async () => Buffer.from('%PDF-factice') }))

const envois = []
vi.mock('../lib/fetchTimeout', () => ({
  fetchTimeout: async (url, options) => {
    envois.push({ url, corps: JSON.parse(options.body) })
    return { ok: true, status: 200, json: async () => ({ id: 'msg_1' }) }
  },
}))

let entetes = {}
beforeEach(() => {
  const c = connecter(ANONYME); base = c.base; entetes = c.headers; envois.length = 0
  // La route refuse de partir sans clé Resend. Ce n'est pas l'objet du test :
  // on lui en donne une, l'envoi lui-même étant simulé.
  process.env.RESEND_API_KEY = 'cle-de-test'
})

const sous = (qui, tables = {}) => { const c = connecter(qui, { tables }); base = c.base; entetes = c.headers }

const appeler = async (options = {}) => {
  const mod = await import('../pages/api/send-document')
  const res = faireRes()
  await mod.default(faireReq({ ...options, headers: { ...entetes, ...(options.headers || {}) } }), res)
  return res
}

const PROJET = {
  projects: [{ id: 7, name: 'Pop up Manor GE', client: 'Manor SA', quote_data: { status: 'brouillon', management: [], items: [], subcontracting: [], logistics: [] } }],
  app_settings: [{ key: 'company_info', value: { name: 'Amazing Lab', email: 'hello@amazinglab.ch' } }],
}
const CORPS = { type: 'devis', id: 7, subject: 'Offre Pop up Manor', message: 'Bonjour', to: 'client@exemple.ch' }

describe('POST /api/send-document — envoi d\'une offre', () => {
  it('génère le PDF et l\'envoie', async () => {
    sous(ADMIN, PROJET)
    const res = await appeler({ method: 'POST', body: CORPS })
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ ok: true })
    expect(envois).toHaveLength(1)
    expect(envois[0].url).toContain('api.resend.com')
    expect(envois[0].corps.attachments[0].content).toBeTruthy()
  })

  // Le symptôme exact vu en production : la génération du PDF part en 500 avec
  // le message de l'exception.
  it('n\'échoue pas sur « Génération du PDF impossible »', async () => {
    sous(ADMIN, PROJET)
    const res = await appeler({ method: 'POST', body: CORPS })
    expect(String(res.body?.error || '')).not.toContain('Génération du PDF')
    expect(String(res.body?.error || '')).not.toContain('is not defined')
  })

  it('reste réservé à l\'admin', async () => {
    const anon = await appeler({ method: 'POST', body: CORPS })
    expect(anon.statusCode).toBe(401)
    sous(MEMBRE, PROJET)
    const membre = await appeler({ method: 'POST', body: CORPS })
    expect(membre.statusCode).toBe(403)
  })

  it('refuse un type inconnu, un destinataire invalide ou un objet vide', async () => {
    sous(ADMIN, PROJET)
    expect((await appeler({ method: 'POST', body: { ...CORPS, type: 'bon_de_livraison' } })).statusCode).toBe(400)
    expect((await appeler({ method: 'POST', body: { ...CORPS, to: 'pas-une-adresse' } })).statusCode).toBe(400)
    expect((await appeler({ method: 'POST', body: { ...CORPS, subject: '' } })).statusCode).toBe(400)
  })

  it('répond 404 sur un projet introuvable', async () => {
    sous(ADMIN, PROJET)
    const res = await appeler({ method: 'POST', body: { ...CORPS, id: 999 } })
    expect(res.statusCode).toBe(404)
  })
})
