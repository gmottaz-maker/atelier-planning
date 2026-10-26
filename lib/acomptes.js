// Factures d'acompte : ce qu'on demande d'avance, et ce qu'on déduit à la fin.
//
// Un acompte est une FACTURE À PART ENTIÈRE — même table, même numéro, même
// QR-bill, même PDF. Il est envoyé, payé, rapproché en banque et comptabilisé
// comme les autres. En faire un objet séparé aurait obligé à lui refabriquer
// chacune de ces vies.
//
// Ce qui le distingue tient en trois champs : `type`, la BASE (un pourcentage
// ou un montant fixe) et la VALEUR saisie. Le montant n'est pas stocké comme
// une donnée libre, il se RECALCULE depuis l'offre — c'est ce qui permet au
// serveur de le vérifier au lieu de croire le navigateur.
//
// ── Les trois règles arbitrées le 26 octobre 2026 ──────────────────────────
//
// 1. La TVA est due sur l'acompte. Il porte donc la sienne, et la facture
//    finale déduit l'acompte TTC (cf. `invoiceTotals`).
// 2. Un pourcentage porte sur le TOTAL HT de l'offre. La TVA vient par-dessus,
//    ce qui fait de l'acompte une facture ordinaire.
// 3. Le montant enregistré sur la facture finale est CE QUI RESTE À PAYER.
//    C'est ce que le client vire, donc ce que le rapprochement bancaire
//    retrouvera ; l'acompte, lui, a déjà été comptabilisé sur sa propre
//    facture.

export const BASES = ['pourcentage', 'montant']
export const TYPES = ['facture', 'acompte']

const num = v => { const n = parseFloat(v); return isNaN(n) ? NaN : n }
const r2  = n => Math.round(n * 100) / 100

/**
 * Montant HT d'un acompte, depuis la base saisie et le sous-total de l'offre.
 *
 * Rend `{ ok: false, erreur }` plutôt que zéro : un acompte à zéro est une
 * facture vide qu'on enverrait sans s'en apercevoir.
 */
export function montantAcompteHT({ base, valeur, sousTotalHT }) {
  const total = num(sousTotalHT)
  if (!Number.isFinite(total) || total <= 0) {
    return { ok: false, erreur: "L'offre n'a pas de montant : il n'y a rien à acompter" }
  }
  const v = num(valeur)
  if (!Number.isFinite(v) || v <= 0) return { ok: false, erreur: 'Valeur d’acompte invalide' }

  if (base === 'pourcentage') {
    if (v > 100) return { ok: false, erreur: 'Un acompte ne peut pas dépasser 100 % de l’offre' }
    return { ok: true, montant: r2(total * v / 100) }
  }
  if (base === 'montant') {
    if (v > total) return { ok: false, erreur: `Un acompte ne peut pas dépasser le total HT de l’offre (${total})` }
    return { ok: true, montant: r2(v) }
  }
  return { ok: false, erreur: `Base d’acompte inconnue : ${base}` }
}

/**
 * Les acomptes d'un projet qui se déduisent d'une facture finale.
 *
 * Une facture ANNULÉE ne se déduit pas — elle ne sera jamais payée. En
 * revanche un acompte simplement IMPAYÉ se déduit quand même : le client doit
 * le solde quoi qu'il arrive, et l'acompte reste une créance ouverte sur sa
 * propre facture. Le déduire deux fois, ou pas du tout, fausserait l'une ou
 * l'autre.
 *
 * `sauf` écarte la facture en cours d'édition : elle ne se déduit pas
 * d'elle-même.
 */
export function acomptesDuProjet(factures = [], { projectId, sauf = null } = {}) {
  return (factures || [])
    .filter(f => f.type === 'acompte')
    .filter(f => String(f.project_id) === String(projectId))
    .filter(f => f.status !== 'cancelled')
    .filter(f => sauf == null || String(f.id) !== String(sauf))
    .sort((a, b) => String(a.issue_date || '').localeCompare(String(b.issue_date || '')))
}

/** Ce que ces acomptes retirent de la facture finale, TTC. */
export function totalAcomptesTTC(acomptes = []) {
  return r2((acomptes || []).reduce((s, f) => s + (num(f.amount) || 0), 0))
}

/**
 * L'instantané figé des acomptes déduits, écrit sur la facture finale.
 *
 * Même raison que le forfait de transport qui recopie sa distance : une
 * facture est un document ÉMIS. Annuler un acompte six mois plus tard ne doit
 * pas réécrire ce que le client a reçu.
 */
export function figerDeductions(acomptes = []) {
  return (acomptes || []).map(f => ({
    id: f.id,
    numero: f.invoice_number,
    date: f.issue_date,
    montant: r2(num(f.amount) || 0),
  }))
}

/** Somme d'un instantané figé — ce que la facture déduit réellement. */
export function totalDeductions(deduits = []) {
  return r2((deduits || []).reduce((s, d) => s + (num(d.montant) || 0), 0))
}

/**
 * Ce qu'il reste à acompter, en HT. Sert à borner la saisie : deux acomptes
 * de 60 % ne doivent pas exister.
 */
export function resteAAcompterHT({ sousTotalHT, acomptes = [], tvaRate = 0 }) {
  const total = num(sousTotalHT) || 0
  // Les acomptes sont stockés TTC ; on revient au HT pour comparer à l'offre.
  const diviseur = 1 + (num(tvaRate) || 0) / 100
  const dejaHT = (acomptes || []).reduce((s, f) => s + (num(f.amount) || 0) / diviseur, 0)
  return r2(Math.max(0, total - dejaHT))
}
