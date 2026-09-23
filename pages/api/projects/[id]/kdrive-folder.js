// Créer le dossier kDrive d'un projet — sur demande, jamais tout seul.
//
// Le dossier se fabriquait au premier dépôt de fichier, en silence. Résultat :
// des dossiers vides pour des projets qui n'en avaient pas besoin — une
// intervention d'une heure n'a pas de fichier. C'est donc devenu un geste :
// soit on choisit un dossier existant (sélecteur de la fiche projet), soit on
// demande sa création ici.
import { getSupabaseServer } from '../../../../lib/supabase-server'
import { requireUser } from '../../../../lib/requireAdmin'
import { erreurApi } from '../../../../lib/apiError'
import { ensureProjectFolder } from '../../../../lib/kdrive'

const supabase = getSupabaseServer()

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' })

  const { id } = req.query
  const { data: projet, error } = await supabase
    .from('projects').select('id, name, client, kdrive_folder_id').eq('id', id).maybeSingle()
  if (error) return erreurApi(req, res, 'internal', error, { route: 'projects/[id]/kdrive-folder' })
  if (!projet) return res.status(404).json({ error: 'Projet introuvable' })

  // Déjà lié : on renvoie le dossier en place plutôt que d'en créer un second.
  if (projet.kdrive_folder_id) return res.status(200).json({ kdrive_folder_id: projet.kdrive_folder_id, cree: false })

  let dossier
  try {
    dossier = await ensureProjectFolder(projet.client, projet.name)
  } catch (e) {
    console.error('kdrive-folder:', e.message)
    return res.status(502).json({ error: 'Création du dossier impossible sur kDrive' })
  }

  const { error: majErr } = await supabase.from('projects').update({ kdrive_folder_id: dossier }).eq('id', id)
  if (majErr) return erreurApi(req, res, 'internal', majErr, { route: 'projects/[id]/kdrive-folder' })
  return res.status(200).json({ kdrive_folder_id: dossier, cree: true })
}
