// Les visuels d'une présentation : dépôt et retrait.
//
// On dépose tout d'un coup, avec les noms tels qu'ils sortent de Fusion ou du
// rendu — « vitrine_3d.png », « vitrine_ia.png », « stand_3d.png ». Le NOM est
// ce qui permet au modèle de rattacher chaque image à sa pièce : il n'est donc
// pas nettoyé au-delà de ce que kDrive exige.
import { getSupabaseServer } from '../../../../lib/supabase-server'
import { requireUser } from '../../../../lib/requireAdmin'
import { erreurApi } from '../../../../lib/apiError'
import { upload, SANS_DOSSIER } from '../../../../lib/kdrive'
import { validerFichier, nomSur } from '../../../../lib/fileType'
import { MAX_FICHIER_OCTETS } from '../../../../lib/uploadLimit'

export const config = { api: { bodyParser: { sizeLimit: '4.5mb' } } }

// Un visuel est une image : un PDF ne s'afficherait pas dans un cadre, et on
// s'en apercevrait à l'export.
const TYPES_VISUEL = ['image/jpeg', 'image/png', 'image/webp']

const supabase = getSupabaseServer()

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return
  const { id } = req.query

  const { data: presentation, error } = await supabase
    .from('presentations').select('id, project_id, fichiers').eq('id', id).maybeSingle()
  if (error) return erreurApi(req, res, 'internal', error, { route: 'presentations/[id]/fichiers' })
  if (!presentation) return res.status(404).json({ error: 'Présentation introuvable' })
  const fichiers = Array.isArray(presentation.fichiers) ? presentation.fichiers : []

  if (req.method === 'POST') {
    const { base64, filename } = req.body || {}
    if (!base64 || !filename) return res.status(400).json({ error: 'base64 et filename requis' })

    const buffer = Buffer.from(base64, 'base64')
    const check = validerFichier(buffer, { maxOctets: MAX_FICHIER_OCTETS, types: TYPES_VISUEL })
    if (!check.ok) return res.status(check.status).json({ error: check.error })

    const { data: projet } = await supabase
      .from('projects').select('id, client, name, kdrive_folder_id').eq('id', presentation.project_id).maybeSingle()
    if (!projet) return res.status(404).json({ error: 'Projet introuvable' })

    // Le dossier du projet, tel qu'il a été CHOISI. Sans dossier, on ne dépose
    // pas et on le dit — on n'en fabrique pas un au passage.
    const dossier = projet.kdrive_folder_id
    if (!dossier) return res.status(409).json({ error: SANS_DOSSIER })

    let depose
    try {
      depose = await upload(dossier, nomSur(`presentation_${Date.now()}_${filename}`, check.mime), buffer, check.mime)
    } catch (e) {
      console.error('presentation fichiers:', e)
      return res.status(502).json({ error: 'Dépôt du visuel impossible' })
    }

    // `nom` est le nom D'ORIGINE, pas celui de kDrive : c'est celui que la
    // personne a écrit, donc celui qu'elle emploiera en parlant des pièces.
    const entree = { nom: String(filename).slice(0, 200), kdrive_id: depose.id, kdrive_nom: depose.name, mime: check.mime }
    const suite = [...fichiers.filter(f => f.nom !== entree.nom), entree]

    const { error: majErr } = await supabase.from('presentations')
      .update({ fichiers: suite, updated_at: new Date().toISOString() }).eq('id', id)
    if (majErr) return erreurApi(req, res, 'internal', majErr, { route: 'presentations/[id]/fichiers' })
    return res.status(200).json({ fichiers: suite })
  }

  if (req.method === 'DELETE') {
    // Le fichier reste sur kDrive : il est dans le dossier du projet, où il a
    // sa place même s'il ne sert pas dans cette présentation.
    const nom = String(req.body?.nom || '')
    const suite = fichiers.filter(f => f.nom !== nom)
    const { error: majErr } = await supabase.from('presentations')
      .update({ fichiers: suite, updated_at: new Date().toISOString() }).eq('id', id)
    if (majErr) return erreurApi(req, res, 'internal', majErr, { route: 'presentations/[id]/fichiers' })
    return res.status(200).json({ fichiers: suite })
  }

  return res.status(405).json({ error: 'Méthode non autorisée' })
}
