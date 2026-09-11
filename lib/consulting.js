// Consulting : le temps passé à conseiller un client hors de tout projet.
//
// Il ne se facture pas directement. Il s'accumule en un SOLDE par client, qu'on
// compense ensuite dans une offre par une ligne de Gestion MASQUÉE : invisible
// sur le document, comprise dans le prix (cf. le masquage, CLAUDE.md).
//
// Seule l'activité 14 (Consulting) alimente le solde. La relation client (13)
// est du temps passé AVEC le client, pas du conseil : elle ne se récupère pas.
//
// Une compensation est CONSOMMÉE dès qu'elle figure dans une offre, sauf si
// l'offre est refusée : la même heure ne sert pas dans deux offres ouvertes,
// et une offre refusée rend ses heures au solde.
import { normaliserDevis } from './quoteLines'

// Écrit en dur, et c'est permis : un code d'activité ne change jamais.
export const CODE_CONSULTING = 14
export const LIBELLE_COMPENSATION = 'Compensation consulting'

const enHeures = u => ['h', 'heure', 'heures', 'heure(s)'].includes(String(u || '').trim().toLowerCase())

/** Minutes de compensation portées par une offre — les lignes marquées `compensation`. */
export function compensationDevis(raw) {
  let minutes = 0
  for (const r of normaliserDevis(raw).management) {
    if (r?.compensation !== true) continue
    const h = Number(String(r.quantity ?? '').replace(',', '.'))
    if (Number.isFinite(h) && h > 0 && (!r.unit || enHeures(r.unit))) minutes += Math.round(h * 60)
  }
  return minutes
}

/** Minutes qui comptent : une offre refusée rend les siennes au solde. */
export const compensationConsommee = raw => (raw?.status === 'refuse' ? 0 : compensationDevis(raw))

/**
 * Solde d'un client : minutes de consulting notées contre lui, moins les
 * minutes déjà compensées dans ses offres non refusées.
 *
 * `exclure` : le projet dont l'offre est à l'écran. Sa compensation se lit sur
 * la version NON enregistrée, par l'appelant — la compter ici aussi la
 * retrancherait deux fois.
 */
export function soldeConsulting({ heures = [], projets = [], exclure = null } = {}) {
  const consulte = heures
    .filter(h => Number(h.activite) === CODE_CONSULTING && !h.project_id)
    .reduce((s, h) => s + (Number(h.minutes) || 0), 0)
  let compense = 0
  const parProjet = []
  for (const p of projets) {
    if (exclure != null && String(p.id) === String(exclure)) continue
    const minutes = compensationConsommee(p.quote_data)
    if (!minutes) continue
    compense += minutes
    parProjet.push({ id: p.id, numero: p.numero ?? null, name: p.name, statut: p.quote_data?.status || null, minutes })
  }
  return { consulte, compense, solde: consulte - compense, parProjet }
}

/** Soldes de tous les clients qui ont du consulting ou des compensations. */
export function soldesParClient({ heures = [], projets = [] } = {}) {
  const ids = new Set([
    ...heures.map(h => String(h.contact_id)),
    ...projets.map(p => String(p.client_contact_id)),
  ].filter(x => x && x !== 'null' && x !== 'undefined'))
  return [...ids].map(id => ({
    contact_id: Number(id),
    ...soldeConsulting({
      heures: heures.filter(h => String(h.contact_id) === id),
      projets: projets.filter(p => String(p.client_contact_id) === id),
    }),
  })).filter(s => s.consulte || s.compense)
    .sort((a, b) => b.solde - a.solde)
}

/**
 * La ligne à glisser dans l'offre : Gestion, masquée, au tarif du consulting.
 * La quantité est en heures décimales (90 min → 1.5) ; elle reste modifiable
 * dans l'éditeur — on peut compenser moins que le solde.
 */
export function ligneCompensation({ minutes, tarif }) {
  return {
    item: LIBELLE_COMPENSATION,
    description: '',
    rate: tarif == null || tarif === '' ? '' : String(tarif),
    quantity: String(Math.round(minutes / 60 * 100) / 100),
    unit: 'heure(s)',
    discount: '',
    discount_amount: '',
    hidden: true,
    compensation: true,
    activite: CODE_CONSULTING,
  }
}
