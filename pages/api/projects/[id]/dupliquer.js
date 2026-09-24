// Duplication d'un projet entier.
//
// La copie se fait CÔTÉ SERVEUR, et pas en renvoyant le projet lu par le
// navigateur : `quote_data` porte les prix d'achat et les marges, il pèse à
// lui seul 60 % d'un projet, et le faire voyager deux fois pour le réécrire
// tel quel n'apporte rien. Le serveur possède déjà la donnée.
//
// Ce qui suit et ce qui ne suit pas est décidé dans `lib/duplicateDoc.js`,
// avec les raisons — et un test le garde.
import { getSupabaseServer } from '../../../../lib/supabase-server'
import { requireUser } from '../../../../lib/requireAdmin'
import { erreurApi } from '../../../../lib/apiError'
import { projectCopy } from '../../../../lib/duplicateDoc'

const supabase = getSupabaseServer()

export default async function handler(req, res) {
  const utilisateur = await requireUser(req, res)
  if (!utilisateur) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' })

  const { id } = req.query
  const nom = String(req.body?.name || '').trim()
  if (!nom) return res.status(400).json({ error: 'Un nom est requis pour la copie.' })

  const { data: source, error: lecture } = await supabase
    .from('projects').select('*').eq('id', id).maybeSingle()
  if (lecture) return erreurApi(req, res, 'internal', lecture, { route: 'projects/dupliquer' })
  if (!source) return res.status(404).json({ error: 'Projet introuvable' })

  // `numero` n'est dans aucune liste blanche d'écriture : la séquence Postgres
  // l'attribue à l'insert, jamais un max + 1, qui n'est pas concurrent.
  const { data, error } = await supabase
    .from('projects').insert(projectCopy(source, nom)).select().single()
  if (error) return erreurApi(req, res, 'internal', error, { route: 'projects/dupliquer' })

  try {
    await supabase.from('activity_log').insert({
      actor: utilisateur.name,
      action: 'project_created',
      entity_type: 'project',
      entity_id: String(data.id),
      entity_name: data.name,
      // D'où vient la copie : c'est la première question quand on retrouve
      // deux projets jumeaux six mois plus tard.
      metadata: { client: data.client, copie_de: source.numero || source.id },
    })
  } catch (_) { /* le journal ne doit jamais faire échouer la copie */ }

  return res.status(201).json(data)
}
