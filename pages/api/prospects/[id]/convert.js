// Conversion d'un prospect en client.
//
// C'est le moment que Guillaume a décrit : « il devient client quand on a pu
// discuter d'un projet et valider une offre ». L'opération crée la société dans
// `contacts`, y recopie les personnes, et sort le prospect des listes.
//
// Le journal NE bouge PAS. Il reste attaché au prospect, dont la ligne survit
// avec `converted_to_contact_id` : c'est ce lien qui permet à la fiche cliente
// d'afficher l'historique du démarchage. Supprimer le prospect « puisqu'il est
// devenu client » effacerait précisément ce qui explique pourquoi ce client
// existe — par quel canal, en combien de relances, sur quelle recommandation.
//
// Non atomique, faute de fonction PostgreSQL dédiée : l'ordre des écritures est
// donc choisi pour qu'un échec en cours de route laisse un état RATTRAPABLE.
// La société est créée en premier ; si le marquage échoue ensuite, le prospect
// reste dans la liste et une seconde tentative est sans danger — le garde-fou
// du début refuse une conversion déjà faite.
import { getSupabaseServer } from '../../../../lib/supabase-server'
import { requireAdmin } from '../../../../lib/requireAdmin'
import { erreurApi } from '../../../../lib/apiError'

const supabase = getSupabaseServer()

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' })

  const { id } = req.query
  if (!id) return res.status(400).json({ error: 'id requis' })

  const { data: p, error: eLire } = await supabase
    .from('prospects').select('*, prospect_people(*)').eq('id', id).maybeSingle()
  if (eLire) return erreurApi(req, res, 'internal', eLire, { route: 'prospects/convert' })
  if (!p) return res.status(404).json({ error: 'Prospect introuvable' })
  if (p.converted_to_contact_id) {
    return res.status(409).json({ error: 'Ce prospect est déjà devenu client.', contact_id: p.converted_to_contact_id })
  }

  // 1. La société. Les tags reprennent « Client » pour qu'elle apparaisse dans
  //    les filtres de l'annuaire comme les autres.
  const { data: societe, error: eSoc } = await supabase.from('contacts').insert({
    kind: 'company',
    name: p.name,
    street: p.street, zip: p.zip, city: p.city, country: p.country,
    website: p.website, phone: p.phone,
    tags: ['Client'],
    is_customer: true,
    notes: p.notes,
  }).select().single()
  if (eSoc) return erreurApi(req, res, 'internal', eSoc, { route: 'prospects/convert' })

  // 2. Les personnes. Un échec ici ne perd rien : elles restent sur le
  //    prospect, et se recopient à la main depuis la fiche.
  const personnes = (p.prospect_people || []).map(x => ({
    kind: 'person', parent_id: societe.id, name: x.name,
    email: x.email, phone: x.phone, notes: [x.role, x.notes].filter(Boolean).join(' — ') || null,
  }))
  if (personnes.length) {
    const { error: ePers } = await supabase.from('contacts').insert(personnes)
    if (ePers) console.warn('convert: personnes non recopiées —', ePers.message)
  }

  // 3. Le prospect sort des listes, sans disparaître.
  const { error: eMaj } = await supabase.from('prospects').update({
    converted_to_contact_id: societe.id,
    converted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (eMaj) {
    // La société existe déjà : on le DIT plutôt que de laisser croire à un
    // échec complet, sans quoi une seconde tentative créerait un doublon.
    return erreurApi(req, res, 'internal', eMaj, { route: 'prospects/convert' },
      `La société « ${societe.name} » a bien été créée dans les contacts, mais le prospect n'a pas pu être marqué converti. `
      + `Rouvre la fiche : si le prospect est toujours dans la liste, supprime la société créée avant de réessayer.`)
  }

  return res.status(200).json({ ok: true, contact_id: societe.id, contact: societe, personnes: personnes.length })
}
