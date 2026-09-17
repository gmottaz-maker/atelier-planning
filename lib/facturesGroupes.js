// Regroupement des factures émises par client.
//
// Même raison que pour les offres (`lib/offres.js`) : la liste était plate et
// triée par date, si bien que les quatre factures d'un même client se
// retrouvaient éparpillées entre celles de six autres — alors qu'on ouvre cette
// page en pensant à un client, pas à une date.
//
// Ce qu'un groupe additionne n'est PAS ce qu'additionne un groupe d'offres :
// une offre acceptée est de l'argent espéré, une facture payée est de l'argent
// reçu. Trois sommes, donc, qui répondent à trois questions différentes —
// combien ce client me doit-il, combien a-t-il payé, combien est en retard.
import { effectiveStatus } from './customerStatus'

export const SANS_CLIENT = 'Sans client'

export function grouperFacturesParClient(factures, today) {
  const groupes = new Map()
  for (const f of factures || []) {
    // Les espaces autour du nom sont ignorés : « Manor SA » saisi une fois avec
    // une espace de trop créerait sinon un second groupe fantôme.
    const nom = String(f?.client_name || '').trim() || SANS_CLIENT
    if (!groupes.has(nom)) groupes.set(nom, [])
    groupes.get(nom).push(f)
  }

  return [...groupes.entries()]
    .map(([client, items]) => {
      const somme = garde => items.reduce((t, f) => (garde(f) ? t + (Number(f.amount) || 0) : t), 0)
      const statut = f => effectiveStatus(f, today)
      return {
        client,
        items,
        // Une facture annulée ne compte nulle part : elle n'est ni due, ni
        // payée, ni en retard. La compter dans « facturé » gonflerait le total
        // d'un montant que personne n'attend.
        facture: somme(f => statut(f) !== 'cancelled'),
        paye:    somme(f => statut(f) === 'paid'),
        retard:  somme(f => statut(f) === 'overdue'),
      }
    })
    .sort((a, b) => {
      if (a.client === SANS_CLIENT) return 1
      if (b.client === SANS_CLIENT) return -1
      return a.client.localeCompare(b.client, 'fr')
    })
}
