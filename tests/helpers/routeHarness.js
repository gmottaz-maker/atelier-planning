// Banc d'essai pour exercer une route API sans base ni réseau.
//
// Les tests d'autorisation ne valent que s'ils appellent le VRAI handler : une
// liste blanche recopiée dans un test ne prouve rien sur le code livré. On
// simule donc Supabase et l'identité, puis on invoque le handler tel quel.
import { vi } from 'vitest'

/** Réponse HTTP factice, qui enregistre ce que la route a produit. */
export function faireRes() {
  const res = {
    statusCode: null, body: null, headers: {}, ended: false,
    setHeader(k, v) { this.headers[k] = v; return this },
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; this.ended = true; return this },
    send(b) { this.body = b; this.ended = true; return this },
    end() { this.ended = true; return this },
  }
  return res
}

export function faireReq({ method = 'GET', query = {}, body = {}, headers = {} } = {}) {
  return { method, query, body, headers }
}

/**
 * Constructeur de client Supabase simulé.
 *
 * `tables` : { nomTable: [lignes] }. Les filtres `.eq()` / `.in()` / `.not()`
 * sont appliqués pour de vrai, sinon un test de filtrage ne testerait rien.
 * `rpc` : { nomFonction: (args) => data }.
 */
export function faireSupabase({ tables = {}, rpc = {}, erreurs = {}, comptes = {} } = {}) {
  const requete = (nom) => {
    let lignes = [...(tables[nom] || [])]
    const filtres = []
    const q = {
      select() { return q },
      order() { return q },
      limit(n) { lignes = lignes.slice(0, n); return q },
      eq(col, val) { filtres.push(r => String(r[col]) === String(val)); return q },
      neq(col, val) { filtres.push(r => String(r[col]) !== String(val)); return q },
      in(col, vals) { filtres.push(r => vals.map(String).includes(String(r[col]))); return q },
      is(col, val) { filtres.push(r => (val === null ? r[col] == null : r[col] === val)); return q },
      not(col, op, val) {
        filtres.push(op === 'is' && val === null ? r => r[col] != null : r => String(r[col]) !== String(val))
        return q
      },
      like(col, motif) {
        const re = new RegExp('^' + String(motif).replace(/%/g, '.*') + '$')
        filtres.push(r => re.test(String(r[col] ?? '')))
        return q
      },
      appliquer() { return lignes.filter(r => filtres.every(f => f(r))) },
      maybeSingle() { const l = q.appliquer(); return Promise.resolve({ data: l[0] ?? null, error: erreurs[nom] ?? null }) },
      single() {
        const l = q.appliquer()
        return Promise.resolve(l[0]
          ? { data: l[0], error: erreurs[nom] ?? null }
          : { data: null, error: erreurs[nom] ?? { message: 'no rows' } })
      },
      insert(v) { const arr = Array.isArray(v) ? v : [v]; tables[nom] = [...(tables[nom] || []), ...arr]; q._inserted = arr; return q },
      update(v) { q._updated = v; return q },
      upsert(v) { q._upserted = v; return q },
      delete() { q._deleted = true; return q },
      then(resolve) { return Promise.resolve({ data: q.appliquer(), error: erreurs[nom] ?? null }).then(resolve) },
    }
    return q
  }

  return {
    // `auth.getUser` est le point d'entrée réel de getVerifiedUser : en le
    // simulant ici plutôt qu'en remplaçant requireAdmin, toute la chaîne
    // d'autorisation (requireUser, requireAdmin, requireCronOrAdmin) reste le
    // code de production. Remplacer un export ne change d'ailleurs pas les
    // appels internes au module.
    auth: {
      getUser: async (token) => {
        const u = comptes[token]
        return u ? { data: { user: { id: u.id, email: u.email, user_metadata: {} } }, error: null }
                 : { data: { user: null }, error: { message: 'invalid token' } }
      },
    },
    from: vi.fn(requete),
    rpc: vi.fn((nom, args) => Promise.resolve(
      nom in rpc
        ? { data: rpc[nom](args), error: null }
        : { data: null, error: { message: `Could not find the function public.${nom} in the schema cache` } }
    )),
    storage: { from: () => ({ upload: async () => ({ error: null }), remove: async () => ({ error: null }) }) },
  }
}

export const ANONYME = null
export const MEMBRE  = { id: 'u-gabin', email: 'gabin@amazinglab.ch', name: 'Gabin', role: 'member' }
export const AUTRE   = { id: 'u-arnaud', email: 'arnaud@amazinglab.ch', name: 'Arnaud', role: 'member' }
export const ADMIN   = { id: 'u-guillaume', email: 'guillaume@amazinglab.ch', name: 'Guillaume', role: 'admin' }

/**
 * Construit une base simulée où `utilisateur` est authentifié, et renvoie
 * l'en-tête à passer à la route. Le jeton est unique par test : getVerifiedUser
 * met les jetons vérifiés en cache pendant 5 minutes, un jeton partagé ferait
 * fuiter l'identité d'un test à l'autre.
 */
let compteur = 0
export function connecter(utilisateur, options = {}) {
  const jeton = `jeton-test-${++compteur}`
  const base = faireSupabase({
    ...options,
    comptes: utilisateur ? { [jeton]: utilisateur } : {},
    tables: {
      ...(options.tables || {}),
      profiles: utilisateur ? [{ id: utilisateur.id, name: utilisateur.name, role: utilisateur.role }] : [],
    },
  })
  const headers = utilisateur ? { authorization: `Bearer ${jeton}` } : {}
  return { base, headers }
}
