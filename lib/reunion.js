// Calculs de la réunion d'essai (/meeting/essai).
//
// La réunion de l'atelier passe en revue, dans l'ordre : ce qui est en
// retard, ce qui arrive cette semaine, ce qu'on attend de l'extérieur
// (commandes, sous-traitances), puis chaque projet à son statut. Rien ne se
// « génère » : la page lit l'état du moment.

import { dateDuJour } from './aujourdhui'
import { enRetard, groupesParStatut, livraisonEnRetard } from './fiche'
import { etatSousTraitance } from './sousTraitance'

const jour = d => (d ? String(d).slice(0, 10) : null)
const par = cle => (a, b) => (cle(a) || '9999').localeCompare(cle(b) || '9999')

/** Ce que les tâches ouvertes disent d'un projet : combien, combien en retard, la prochaine date. */
export function tachesParProjet(taches = [], aujourdhui = dateDuJour()) {
  const out = {}
  for (const t of taches) {
    if (t.status === 'completed' || !t.project_id) continue
    const k = String(t.project_id)
    const e = (out[k] ||= { ouvertes: 0, retard: 0, prochaine: null })
    e.ouvertes += 1
    if (enRetard(t, aujourdhui)) e.retard += 1
    else if (t.execution_date && (!e.prochaine || t.execution_date < e.prochaine.date)) e.prochaine = { date: t.execution_date, titre: t.title }
  }
  return out
}

export function briefReunion({ projets = [], taches = [], factures = new Set(), aujourdhui = dateDuJour() } = {}) {
  const actifs = projets.filter(p => p.status === 'active')
  const ouvertes = taches.filter(t => t.status !== 'completed')
  // Les tâches nées de la logistique sont des dates sur place, déjà portées
  // par le projet : elles ne se comptent pas deux fois parmi les retards.
  const tachesRetard = ouvertes
    .filter(t => !t.category_data?.source_logistics_uid && enRetard(t, aujourdhui))
    .sort(par(t => t.execution_date))
  const projetsRetard = actifs.filter(p => livraisonEnRetard(p, aujourdhui)).sort(par(p => jour(p.deadline)))
  const commandes = ouvertes.filter(t => t.category === 'commande' && !t.category_data?.received_at)
    .sort(par(t => t.category_data?.expected_date || t.execution_date))
  const st = ouvertes.filter(t => t.category === 'sous_traitance')
  const pretes = st.filter(t => etatSousTraitance(t) === 'pret')
  const chez = st.filter(t => etatSousTraitance(t) === 'chez').sort(par(t => t.category_data?.expected_pickup_date))
  const fin = new Date(`${aujourdhui}T12:00:00`); fin.setDate(fin.getDate() + 7)
  const dans7 = fin.toISOString().slice(0, 10)
  const livraisons = actifs.filter(p => { const d = jour(p.deadline); return d && d >= aujourdhui && d <= dans7 })
  return {
    retards: { projets: projetsRetard, taches: tachesRetard },
    commandes,
    sousTraitances: { pretes, chez },
    statuts: groupesParStatut(actifs, { factures }),
    parProjet: tachesParProjet(taches, aujourdhui),
    chiffres: {
      actifs: actifs.filter(p => !p.suspended).length,
      livraisons: livraisons.length,
      retard: projetsRetard.length + tachesRetard.length,
      commandes: commandes.length,
      sousTraitances: st.length,
    },
  }
}
