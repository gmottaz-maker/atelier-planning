// Fait construire — ou corriger — la présentation par Claude.
//
// Un seul geste : on raconte le projet, on a déposé les visuels, et le modèle
// en fait la présentation complète. Le même endroit sert aux corrections : une
// phrase (« inverse les deux pièces », « le comptoir fait 2,80 m »), et il
// renvoie le document entier retouché.
//
// Le budget n'est jamais fabriqué par le modèle : il est recalculé ici depuis
// l'offre du projet et posé après coup (lib/deckRedaction.js, `validerSortie`).
import { getSupabaseServer } from '../../../../lib/supabase-server'
import { requireUser } from '../../../../lib/requireAdmin'
import { erreurApi } from '../../../../lib/apiError'
import { classerErreurSynthese } from '../../../../lib/scanErreur'
import { genererDeck } from '../../../../lib/deckRedaction'
import { budgetDepuisDevis } from '../../../../lib/presentation'
import { trous } from '../../../../lib/deck'

export const config = { maxDuration: 300 }

const supabase = getSupabaseServer()

export default async function handler(req, res) {
  const utilisateur = await requireUser(req, res)
  if (!utilisateur) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(503).json({ error: 'Génération indisponible : ANTHROPIC_API_KEY non configurée' })

  const { id } = req.query
  const consignes = String(req.body?.consignes || '').slice(0, 30000)
  const correction = String(req.body?.correction || '').slice(0, 4000)

  const { data: presentation, error } = await supabase
    .from('presentations').select('id, project_id, contenu, consignes, fichiers').eq('id', id).maybeSingle()
  if (error) return erreurApi(req, res, 'internal', error, { route: 'presentations/[id]/generation' })
  if (!presentation) return res.status(404).json({ error: 'Présentation introuvable' })

  const { data: projet } = await supabase
    .from('projects').select('id, numero, name, client, deadline, quote_data, synthese').eq('id', presentation.project_id).maybeSingle()
  if (!projet) return res.status(404).json({ error: 'Projet introuvable' })

  const { data: reglages } = await supabase
    .from('app_settings').select('value').eq('key', 'company_info').maybeSingle()
  const societe = reglages?.value || {}

  // Une correction part du document actuel ; une génération part du récit.
  const recit = consignes || presentation.consignes || ''

  let contenu
  try {
    contenu = await genererDeck({
      consignes: recit,
      correction,
      deckActuel: correction ? (presentation.contenu || null) : null,
      fichiers: Array.isArray(presentation.fichiers) ? presentation.fichiers : [],
      budget: budgetDepuisDevis(projet),
      projet,
      synthese: projet.synthese || '',
      contact: [utilisateur.email, societe.phone].filter(Boolean).join(' — '),
      apiKey,
    })
  } catch (e) {
    // Crédit épuisé, modèle retiré, surcharge : le message dit quoi faire. La
    // présentation en place n'est pas touchée.
    const { passager, message } = classerErreurSynthese(e)
    return res.status(passager ? 503 : 502).json({ error: message, passager })
  }

  const maj = { contenu, updated_at: new Date().toISOString() }
  if (recit && recit !== presentation.consignes) maj.consignes = recit

  const { data, error: majErr } = await supabase.from('presentations')
    .update(maj).eq('id', id).select('id, contenu, consignes, fichiers, updated_at').maybeSingle()
  if (majErr) return erreurApi(req, res, 'internal', majErr, { route: 'presentations/[id]/generation' })

  return res.status(200).json({ ...data, trous: trous(contenu) })
}
