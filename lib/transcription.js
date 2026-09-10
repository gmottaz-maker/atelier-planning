// Transcription des messages vocaux déposés dans le dump.
//
// Claude ne lit pas l'audio : l'API Anthropic prend du texte, des images et des
// PDF, pas du son. Un vocal WhatsApp doit donc passer par un service dédié.
//
// La transcription est FACULTATIVE, et c'est délibéré : sans clé configurée,
// le vocal est stocké et réécoutable comme n'importe quelle pièce jointe — il
// sort simplement de la synthèse. Le jour où une clé apparaît dans
// l'environnement, les vocaux suivants sont transcrits sans rien changer au
// reste. Personne n'est bloqué en attendant une décision de compte.
//
// Groq héberge Whisper large-v3-turbo avec un palier gratuit ; OpenAI facture
// le même modèle à la minute. Les deux exposent la même route « audio /
// transcriptions », d'où un seul appel pour les deux.

import { fetchTimeout } from './fetchTimeout'

const SERVICES = [
  {
    nom: 'groq',
    cle: 'GROQ_API_KEY',
    url: 'https://api.groq.com/openai/v1/audio/transcriptions',
    modele: 'whisper-large-v3-turbo',
  },
  {
    nom: 'openai',
    cle: 'OPENAI_API_KEY',
    url: 'https://api.openai.com/v1/audio/transcriptions',
    modele: 'whisper-1',
  },
]

// 25 Mo est le plafond des deux services. Un vocal dépassant cette taille dure
// des heures : le refuser vaut mieux qu'un échec obscur après un long envoi.
export const MAX_AUDIO_OCTETS = 25 * 1024 * 1024

/** Le service configuré, ou null si aucune clé n'est posée. */
export function serviceTranscription(env = process.env) {
  return SERVICES.find(s => env[s.cle]) || null
}

export function transcriptionDisponible(env = process.env) {
  return !!serviceTranscription(env)
}

/**
 * Transcrit un buffer audio. Ne lève jamais : renvoie
 * { etat: 'ok'|'indisponible'|'echec', texte, raison }.
 */
export async function transcrire(buffer, { filename = 'audio.ogg', mime = 'audio/ogg', env = process.env, fetcher = fetchTimeout } = {}) {
  const service = serviceTranscription(env)
  if (!service) {
    return { etat: 'indisponible', texte: null, raison: 'Aucun service de transcription configuré' }
  }
  if (!buffer?.length) return { etat: 'echec', texte: null, raison: 'Audio vide' }
  if (buffer.length > MAX_AUDIO_OCTETS) {
    return { etat: 'echec', texte: null, raison: 'Message vocal trop long (max 25 Mo)' }
  }

  const form = new FormData()
  form.append('file', new Blob([buffer], { type: mime }), filename)
  form.append('model', service.modele)
  // Le français est forcé plutôt que deviné : sur un vocal court et bruité,
  // Whisper part régulièrement sur une autre langue et rend une traduction.
  form.append('language', 'fr')
  form.append('response_format', 'json')

  try {
    const r = await fetcher(service.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env[service.cle]}` },
      body: form,
    }, 60_000)

    if (!r.ok) {
      const corps = await r.text().catch(() => '')
      return { etat: 'echec', texte: null, raison: raisonLisible(r.status, corps) }
    }
    const data = await r.json()
    const texte = String(data?.text || '').trim()
    if (!texte) return { etat: 'echec', texte: null, raison: 'Transcription vide' }
    return { etat: 'ok', texte, raison: null }
  } catch (e) {
    return { etat: 'echec', texte: null, raison: e?.timeout ? 'Transcription trop longue' : 'Service de transcription injoignable' }
  }
}

/** Message court et actionnable, jamais le corps brut du service. */
export function raisonLisible(status, corps = '') {
  const c = String(corps)
  if (status === 401 || status === 403) return 'Clé de transcription refusée'
  if (status === 429 || /rate limit|quota/i.test(c)) return 'Quota de transcription atteint — réessaie plus tard'
  if (status === 413) return 'Message vocal trop long'
  if (status >= 500) return 'Service de transcription indisponible'
  return 'Transcription impossible'
}
