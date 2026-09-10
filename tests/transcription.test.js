import { describe, it, expect } from 'vitest'
import { transcrire, serviceTranscription, transcriptionDisponible, raisonLisible, MAX_AUDIO_OCTETS } from '../lib/transcription'
import { typeReel, validerFichier, TYPES_DUMP, TYPES_AUTORISES } from '../lib/fileType'

const audio = Buffer.from('OggS' + '\0'.repeat(32))

describe('serviceTranscription', () => {
  it('sans clé, aucun service', () => {
    expect(serviceTranscription({})).toBe(null)
    expect(transcriptionDisponible({})).toBe(false)
  })
  it('Groq d\'abord, OpenAI en repli', () => {
    expect(serviceTranscription({ GROQ_API_KEY: 'k' }).nom).toBe('groq')
    expect(serviceTranscription({ OPENAI_API_KEY: 'k' }).nom).toBe('openai')
    expect(serviceTranscription({ GROQ_API_KEY: 'k', OPENAI_API_KEY: 'k' }).nom).toBe('groq')
  })
})

describe('transcrire', () => {
  it('sans clé : indisponible, et surtout pas une erreur', async () => {
    const r = await transcrire(audio, { env: {} })
    expect(r.etat).toBe('indisponible')
    expect(r.texte).toBe(null)
  })

  it('rend le texte quand le service répond', async () => {
    const r = await transcrire(audio, {
      env: { GROQ_API_KEY: 'k' },
      fetcher: async () => ({ ok: true, json: async () => ({ text: '  le client rappelle jeudi  ' }) }),
    })
    expect(r).toEqual({ etat: 'ok', texte: 'le client rappelle jeudi', raison: null })
  })

  it('force le français plutôt que de le laisser deviner', async () => {
    let envoye = null
    await transcrire(audio, {
      env: { GROQ_API_KEY: 'k' },
      fetcher: async (url, opts) => { envoye = opts.body; return { ok: true, json: async () => ({ text: 'x' }) } },
    })
    expect(envoye.get('language')).toBe('fr')
    expect(envoye.get('model')).toBe('whisper-large-v3-turbo')
  })

  it('ne laisse jamais fuir le corps brut du service', async () => {
    const r = await transcrire(audio, {
      env: { GROQ_API_KEY: 'k' },
      fetcher: async () => ({ ok: false, status: 401, text: async () => '{"error":{"message":"Invalid API Key sk-abc123"}}' }),
    })
    expect(r.etat).toBe('echec')
    expect(r.raison).toBe('Clé de transcription refusée')
    expect(r.raison).not.toContain('sk-abc')
  })

  it('ne lève pas quand le service est injoignable', async () => {
    const r = await transcrire(audio, {
      env: { GROQ_API_KEY: 'k' },
      fetcher: async () => { throw new Error('ECONNRESET') },
    })
    expect(r.etat).toBe('echec')
  })

  it('refuse un fichier au-delà du plafond du service', async () => {
    const r = await transcrire(Buffer.alloc(MAX_AUDIO_OCTETS + 1), { env: { GROQ_API_KEY: 'k' } })
    expect(r.etat).toBe('echec')
    expect(r.raison).toMatch(/trop long/)
  })

  it('distingue le quota du refus définitif', () => {
    expect(raisonLisible(429, '')).toMatch(/Quota/)
    expect(raisonLisible(500, '')).toMatch(/indisponible/)
    expect(raisonLisible(403, '')).toMatch(/refusée/)
  })
})

describe('types de fichiers du dump', () => {
  it('reconnaît un Ogg à sa signature', () => {
    expect(typeReel(audio)).toBe('audio/ogg')
  })
  it('reconnaît un MP3 étiqueté ID3', () => {
    expect(typeReel(Buffer.from('ID3' + '\0'.repeat(32)))).toBe('audio/mpeg')
  })
  it('reconnaît un WAV sans le confondre avec un WebP', () => {
    const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.alloc(16)])
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(16)])
    expect(typeReel(wav)).toBe('audio/wav')
    expect(typeReel(webp)).toBe('image/webp')
  })
  it('ne prend pas une vidéo mp4 pour un message vocal', () => {
    const video = Buffer.concat([Buffer.alloc(4), Buffer.from('ftypisom'), Buffer.alloc(16)])
    expect(typeReel(video)).toBe(null)
  })
  it('accepte l\'audio dans le dump, jamais dans les justificatifs', () => {
    expect(validerFichier(audio, { types: TYPES_DUMP }).ok).toBe(true)
    const refus = validerFichier(audio, { types: TYPES_AUTORISES })
    expect(refus.ok).toBe(false)
    expect(refus.status).toBe(415)
  })
})
