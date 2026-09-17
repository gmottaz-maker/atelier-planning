// Transcription d'un dicté ou d'un vocal, pour les écrans qui prennent du texte.
//
// On dicte un projet bien plus volontiers qu'on ne le tape : la présentation
// client se raconte en deux minutes de voix et en quinze minutes de clavier.
// Le son n'est PAS conservé — il sert à produire du texte, que l'écran met dans
// la zone de saisie, où il se corrige.
//
// Sans clé de transcription configurée, la route le dit franchement (503) :
// l'écran propose alors la dictée du système, qui écrit directement dans le
// champ et ne dépend de personne.
import { requireUser } from '../../lib/requireAdmin'
import { transcrire, transcriptionDisponible } from '../../lib/transcription'
import { validerFichier, typeDictee, TYPES_DICTEE } from '../../lib/fileType'
import { MAX_FICHIER_OCTETS } from '../../lib/uploadLimit'

export const config = { api: { bodyParser: { sizeLimit: '4.5mb' } }, maxDuration: 120 }

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' })

  if (!transcriptionDisponible()) {
    return res.status(503).json({
      error: 'Transcription indisponible : aucune clé GROQ_API_KEY ni OPENAI_API_KEY configurée',
      indisponible: true,
    })
  }

  const { base64, filename, mime } = req.body || {}
  if (!base64) return res.status(400).json({ error: 'base64 requis' })

  const buffer = Buffer.from(base64, 'base64')
  // Le type est déduit du CONTENU, pas de ce qu'annonce le navigateur : un
  // enregistrement du micro arrive en webm sous Chrome, en mp4 sous Safari, et
  // un vocal WhatsApp en ogg.
  const check = validerFichier(buffer, { maxOctets: MAX_FICHIER_OCTETS, types: TYPES_DICTEE, sniffer: typeDictee })
  if (!check.ok) return res.status(check.status).json({ error: check.error })

  const t = await transcrire(buffer, { filename: filename || 'dictee.webm', mime: check.mime || mime })
  if (t.etat !== 'ok') return res.status(502).json({ error: t.raison || 'Transcription impossible' })

  return res.status(200).json({ texte: t.texte })
}
