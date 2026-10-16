// La jauge de charge : ce qu'on doit faire, contre le temps qu'il reste.
//
// ADMIN. Elle rassemble les heures de toute l'équipe, les congés de chacun et
// les heures vendues de chaque offre — c'est le même périmètre que l'export
// des heures, qui est admin pour les mêmes raisons.
//
// Tout le calcul vit dans `lib/capacite.js`, testé sans base ni réseau. Cette
// route ne fait que rassembler les ingrédients : si elle se met à décider
// quelque chose, c'est qu'il faut le remonter dans la lib.
import { getSupabaseServer } from '../../lib/supabase-server'
import { requireAdmin } from '../../lib/requireAdmin'
import { erreurApi } from '../../lib/apiError'
import { dateDuJour } from '../../lib/aujourdhui'
import { datesFeriees } from '../../lib/joursFeries'
import { categorieOffre } from '../../lib/quoteStatus'
import { capacitePersonne, resteProjet, cumuler, verdict, parEcheance, versDate, fenetre } from '../../lib/capacite'

const supabase = getSupabaseServer()

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return
  if (req.method !== 'GET') return res.status(405).json({ error: 'Méthode non autorisée' })

  // La fenêtre se résout dans la lib (`fenetre`), qui sait aussi quoi refuser
  // des dates demandées. Il faut la connaître AVANT les requêtes : c'est elle
  // qui dit quelle année de contrats lire et à partir de quand les congés
  // comptent. Les échéances, elles, ne sont connues qu'après — d'où le second
  // appel plus bas, une fois les projets lus.
  const du = fenetre({ aujourdhui: dateDuJour(), duDemande: String(req.query.du || '') }).du
  const annee = Number(du.slice(0, 4))

  const [projets, activites, heures, reglages, absences, competences] = await Promise.all([
    supabase.from('projects').select('id, numero, name, client, deadline, status, suspended, quote_data').eq('status', 'active'),
    supabase.from('activites').select('code, libelle, famille, facturee_heure'),
    supabase.from('heures').select('project_id, activite, minutes').not('project_id', 'is', null),
    supabase.from('work_settings').select('user_name, year, weekly_hours').eq('year', annee),
    supabase.from('work_entries').select('user_name, date, type').gte('date', du),
    supabase.from('app_settings').select('value').eq('key', 'competences').maybeSingle(),
  ])
  const souci = projets.error || activites.error || heures.error || reglages.error || absences.error
  if (souci) return erreurApi(req, res, 'internal', souci, { route: 'capacite' })

  const comp = competences.data?.value || {}
  const cat = p => categorieOffre(p.quote_data)

  // Un projet EN PAUSE ne consomme rien : c'est tout l'intérêt de la pause.
  // Un projet dont l'offre est REFUSÉE non plus.
  const retenus = (projets.data || []).filter(p => !p.suspended && cat(p) !== 'refuse')

  const parProjet = retenus.map(p => {
    const siennes = (heures.data || []).filter(h => h.project_id === p.id)
    return {
      id: p.id, numero: p.numero, name: p.name, client: p.client, deadline: p.deadline,
      offre: cat(p),
      reste: resteProjet(p, siennes, activites.data || []),
    }
  })

  // ENGAGÉ : l'offre est acceptée, le travail est dû. POTENTIEL : elle est
  // envoyée ou à corriger — ces heures n'existent pas encore, mais ce sont
  // elles qui disent s'il faut dire oui au prochain client.
  const engages = parProjet.filter(p => p.offre === 'accepte')

  // Chacun est planifié d'après SON contrat. Une personne sans réglage n'a
  // pas de capacité : inventer une semaine de 42 h pour quelqu'un dont on ne
  // sait rien ferait tenir des projets qui ne tiennent pas.
  const parNom = Object.fromEntries((reglages.data || []).map(r => [r.user_name, r]))
  const noms = Object.keys(parNom)

  // L'horizon, maintenant que les échéances engagées sont connues. `?au=`
  // permet de poser la question sur une autre date — « et si on devait tout
  // livrer avant Noël ? ».
  const periode = fenetre({
    aujourdhui: dateDuJour(),
    echeances: engages.map(p => p.deadline),
    duDemande: String(req.query.du || ''),
    auDemande: String(req.query.au || ''),
  })
  const au = periode.au
  // Les fériés de toutes les années traversées : une fenêtre qui passe le
  // Nouvel An retomberait sinon sur des jours fériés comptés comme ouvrés.
  const feries = datesFeriees(annee, Number(au.slice(0, 4)))

  const personnes = noms.map(nom =>
    capacitePersonne(nom, du, au, { reglages: parNom[nom], absences: absences.data || [], feries }))

  const besoinsEngages = cumuler(engages.map(p => p.reste))
  const besoinsTous    = cumuler(parProjet.map(p => p.reste))

  return res.status(200).json({
    periode,
    personnes,
    competences: comp,
    activites: activites.data || [],
    projets: parProjet,
    engage: {
      heures: besoinsEngages.total,
      sansCode: besoinsEngages.sansCode,
      parActivite: besoinsEngages.parActivite,
      verdict: verdict(besoinsEngages.parActivite, personnes, comp),
    },
    avecPotentiel: {
      heures: besoinsTous.total,
      verdict: verdict(besoinsTous.parActivite, personnes, comp),
    },
    // Le mur : la première échéance qui ne tient pas. C'est là qu'il faut
    // agir — tous les paliers suivants en découlent.
    echeancier: parEcheance(engages, {
      du, personnes: noms, competences: comp,
      reglages: parNom, absences: absences.data || [], feries,
    }),
  })
}
