// Lecture d'une page web déposée dans le dump d'un projet.
//
// Le serveur va chercher lui-même l'URL fournie par l'utilisateur : c'est
// exactement la forme d'une SSRF. Sans garde-fou, un collègue collant
// `http://169.254.169.254/…` ferait lire à Maze les identifiants de la
// machine qui l'héberge, et `http://localhost:5432` sonderait le réseau
// interne de l'hébergeur. D'où :
//   — schéma http/https seulement, ports 80/443 seulement ;
//   — l'hôte est résolu AVANT l'appel, et toute adresse privée, locale ou
//     réservée est refusée ;
//   — les redirections ne sont pas suivies aveuglément : chaque saut repasse
//     par la même validation ;
//   — la réponse est plafonnée en taille et en temps.
//
// Reste une fenêtre théorique de « DNS rebinding » entre la résolution et
// l'appel. La refermer imposerait de se connecter à l'IP validée en portant
// le nom d'hôte dans l'en-tête, ce que `fetch` ne permet pas ici ; le risque
// est jugé acceptable pour une URL collée par un membre de l'équipe.

import { promises as dns } from 'node:dns'
import { fetchTimeout } from './fetchTimeout'

export const MAX_OCTETS_PAGE = 2 * 1024 * 1024
export const MAX_EXTRAIT = 6000
const MAX_REDIRECTIONS = 3

/** Une chaîne qui ressemble à un lien, ou null. */
export function extraireUrl(texte) {
  const t = String(texte || '').trim()
  if (!t) return null
  const m = t.match(/https?:\/\/[^\s<>"']+/i)
  return m ? m[0].replace(/[.,;:)\]]+$/, '') : null
}

/** Le texte n'est-il QUE un lien ? (dépôt d'URL vs note qui en cite une) */
export function estSeulementUnLien(texte) {
  const t = String(texte || '').trim()
  if (!t) return false
  const url = extraireUrl(t)
  return !!url && url === t
}

/** Adresse IP interne, locale ou réservée — jamais joignable depuis Maze. */
export function adressePrivee(ip) {
  const a = String(ip || '')
  if (a.includes(':')) {
    const v6 = a.toLowerCase()
    if (v6 === '::' || v6 === '::1') return true
    if (/^f[cd]/.test(v6)) return true                       // unique local fc00::/7
    if (/^fe[89ab]/.test(v6)) return true                    // lien-local fe80::/10
    // IPv4 encapsulée (::ffff:10.0.0.1) : on rejuge sur la partie v4.
    const v4 = v6.match(/(\d{1,3}(?:\.\d{1,3}){3})$/)
    return v4 ? adressePrivee(v4[1]) : false
  }
  const o = a.split('.').map(Number)
  if (o.length !== 4 || o.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true
  const [p, d] = o
  if (p === 0 || p === 10 || p === 127) return true
  if (p === 169 && d === 254) return true                    // lien-local / métadonnées cloud
  if (p === 172 && d >= 16 && d <= 31) return true
  if (p === 192 && d === 168) return true
  if (p === 100 && d >= 64 && d <= 127) return true          // CGNAT
  if (p >= 224) return true                                  // multicast + réservé
  return false
}

/** Valide la forme de l'URL. Renvoie { ok, url } ou { ok: false, raison }. */
export function urlAcceptable(brut) {
  let u
  try { u = new URL(String(brut || '')) } catch { return { ok: false, raison: 'Lien illisible' } }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, raison: 'Seuls les liens http et https sont acceptés' }
  }
  if (u.port && u.port !== '80' && u.port !== '443') {
    return { ok: false, raison: 'Port non autorisé' }
  }
  return { ok: true, url: u }
}

/** Vérifie que l'hôte ne pointe pas vers le réseau interne. */
export async function hoteJoignable(hostname, resoudre = dns.lookup) {
  let adresses
  try {
    adresses = await resoudre(hostname, { all: true })
  } catch {
    return { ok: false, raison: 'Domaine introuvable' }
  }
  const liste = Array.isArray(adresses) ? adresses : [adresses]
  if (liste.length === 0) return { ok: false, raison: 'Domaine introuvable' }
  // TOUTES les adresses doivent être publiques : un domaine qui en renvoie une
  // privée parmi d'autres est un contournement, pas un hasard.
  if (liste.some(a => adressePrivee(a.address))) {
    return { ok: false, raison: 'Adresse interne refusée' }
  }
  return { ok: true }
}

/** Titre de la page et texte lisible, débarrassés du balisage. */
export function extraireTexte(html) {
  const brut = String(html || '')
  const titre = (brut.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '')
    .replace(/\s+/g, ' ').trim().slice(0, 200)
  const texte = brut
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_EXTRAIT)
  return { titre: titre || null, texte: texte || null }
}

/**
 * Récupère titre et extrait d'une page. Ne lève jamais : un lien illisible
 * reste un lien déposé, il vaut mieux le garder sans résumé que de refuser
 * l'entrée entière.
 */
export async function lireLien(brut, { fetcher = fetchTimeout, resoudre = dns.lookup } = {}) {
  const forme = urlAcceptable(brut)
  if (!forme.ok) return { url: String(brut || ''), titre: null, extrait: null, raison: forme.raison }

  let url = forme.url
  for (let saut = 0; saut <= MAX_REDIRECTIONS; saut++) {
    const hote = await hoteJoignable(url.hostname, resoudre)
    if (!hote.ok) return { url: url.href, titre: null, extrait: null, raison: hote.raison }

    let r
    try {
      r = await fetcher(url.href, {
        redirect: 'manual',
        headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'Maze/1.0 (+atelier-planning)' },
      }, 8000)
    } catch (e) {
      return { url: url.href, titre: null, extrait: null, raison: 'Page injoignable' }
    }

    if (r.status >= 300 && r.status < 400) {
      const suite = r.headers?.get?.('location')
      if (!suite) return { url: url.href, titre: null, extrait: null, raison: 'Redirection sans destination' }
      const forme2 = urlAcceptable(new URL(suite, url).href)
      if (!forme2.ok) return { url: url.href, titre: null, extrait: null, raison: forme2.raison }
      url = forme2.url
      continue
    }

    if (!r.ok) return { url: url.href, titre: null, extrait: null, raison: `Page indisponible (${r.status})` }

    const type = r.headers?.get?.('content-type') || ''
    if (!/text\/html|text\/plain|application\/xhtml/i.test(type)) {
      return { url: url.href, titre: null, extrait: null, raison: 'Page non textuelle' }
    }

    const html = await lirePlafonne(r)
    const { titre, texte } = extraireTexte(html)
    return { url: url.href, titre, extrait: texte, raison: null }
  }
  return { url: url.href, titre: null, extrait: null, raison: 'Trop de redirections' }
}

/** Lit le corps en s'arrêtant net au plafond, sans le charger entier en mémoire. */
async function lirePlafonne(reponse) {
  if (!reponse.body?.getReader) {
    const t = await reponse.text()
    return t.slice(0, MAX_OCTETS_PAGE)
  }
  const lecteur = reponse.body.getReader()
  const morceaux = []
  let total = 0
  while (total < MAX_OCTETS_PAGE) {
    const { done, value } = await lecteur.read()
    if (done) break
    morceaux.push(value)
    total += value.length
  }
  try { await lecteur.cancel() } catch { /* flux déjà clos */ }
  return Buffer.concat(morceaux.map(m => Buffer.from(m))).subarray(0, MAX_OCTETS_PAGE).toString('utf8')
}
