import { getSupabaseServer } from '../../../lib/supabase-server'
import { requireUser } from '../../../lib/requireAdmin'
import { erreurApi } from '../../../lib/apiError'

async function logActivity(actor, action, project) {
  if (!actor) return
  const supabase = getSupabaseServer()
  try {
    await supabase.from('activity_log').insert({
      actor,
      action,
      entity_type: 'project',
      entity_id: project?.id ? String(project.id) : null,
      entity_name: project?.name || null,
      metadata: project?.client ? { client: project.client } : null,
    })
  } catch (_) {}
}

export default async function handler(req, res) {
  const supabase = getSupabaseServer()

  // Lecture réservée aux utilisateurs connectés : ce select renvoie les notes,
  // adresses, contacts et `quote_data` (prix d'achat, marges). L'écran mural
  // public passe par /api/display-projects, qui n'expose qu'un DTO réduit.
  const user = await requireUser(req, res)
  if (!user) return

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('deadline', { ascending: true })
    if (error) return erreurApi(req, res, 'internal', error, { route: 'projects/index' })

    // `?light=1` : le devis complet est retiré, seul son statut reste.
    // `quote_data` pèse 60 % de cette réponse et porte les prix d'achat et les
    // marges. Les listes n'en affichent qu'un mot — et la barre latérale
    // charge cette route sur CHAQUE page. Le format est conservé
    // (`quote_data.status`) pour que les appelants n'aient rien à changer.
    if (req.query.light === '1') {
      return res.status(200).json((data || []).map(({ quote_data, ...p }) => ({
        ...p,
        quote_data: quote_data?.status ? { status: quote_data.status } : null,
      })))
    }
    return res.status(200).json(data)
  }

  const actor = user.name

  if (req.method === 'POST') {
    const {
      name, client, description, short_description, deadline, delivery_type, responsible, color_override, notes,
      logistics_address, logistics_time, logistics_contact, logistics_notes,
      disassembly_date, disassembly_address, disassembly_time, disassembly_contact, disassembly_notes,
      kdrive_folder_id,
      client_address, client_contact_id, reference, phase,
    } = req.body

    if (!name || !client) {
      return res.status(400).json({ error: 'Nom et client requis' })
    }

    const { data, error } = await supabase.from('projects').insert([{
      name, client, description, short_description, delivery_type, responsible, color_override, notes,
      deadline: deadline || null,
      client_address: client_address || null,
      client_contact_id: client_contact_id || null,
      reference: reference || null,
      phase: phase || null,
      logistics_address, logistics_time, logistics_contact, logistics_notes,
      disassembly_date: disassembly_date || null,
      disassembly_address, disassembly_time, disassembly_contact, disassembly_notes,
      kdrive_folder_id: kdrive_folder_id || null,
      status: 'active',
    }]).select()

    if (error) return erreurApi(req, res, 'internal', error, { route: 'projects/index' })
    await logActivity(actor, 'project_created', data[0])
    return res.status(201).json(data[0])
  }

  return res.status(405).json({ error: 'Méthode non autorisée' })
}
