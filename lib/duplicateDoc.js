// Duplication d'une facture émise, d'une offre ou d'un projet entier.
//
// L'essentiel est ce qu'on NE recopie PAS : numéro, dates d'envoi et de
// paiement, statut, référence QR, lien vers la transaction bancaire. Une copie
// repart toujours d'un document neuf, sinon on se retrouverait avec deux
// factures portant le même numéro, ou une copie déjà marquée payée.

const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// Corps du POST /api/customer-invoices pour dupliquer une facture.
export function invoiceCopyBody(inv, today = new Date().toISOString().slice(0, 10)) {
  return {
    // Contenu repris tel quel
    project_id:      inv.project_id || null,
    client_name:     inv.client_name || '',
    client_address:  inv.client_address || null,
    object:          inv.object || null,
    amount:          inv.amount,
    amount_net:      inv.amount_net,
    vat_rate:        inv.vat_rate,
    vat_amount:      inv.vat_amount,
    currency:        inv.currency || 'CHF',
    iban_recipient:  inv.iban_recipient || null,
    notes:           inv.notes || null,
    quote_snapshot:  inv.quote_snapshot || null,
    detail_level:    inv.detail_level || 'detailed',
    discount_label:  inv.discount_label || null,
    discount_rate:   inv.discount_rate ?? null,
    discount_amount: inv.discount_amount ?? null,
    // Remis à neuf : le numéro et la référence QR sont regénérés côté serveur
    issue_date: today,
    due_date:   addDays(today, 30),
    status:     'created',
  }
}

// Copie du devis d'un projet vers un autre : on garde les positions, on repart
// en brouillon sans numéro ni date d'envoi.
export function offerCopy(quote) {
  const q = quote || {}
  return {
    management:     q.management     || [],
    items:          q.items          || [],
    subcontracting: q.subcontracting || [],
    logistics:      q.logistics      || [],
    general_margin: q.general_margin ?? '',
    status: 'brouillon',
    number: '',
  }
}

/**
 * Duplication d'un PROJET entier.
 *
 * Un chantier se refait : le même client, le même montage, la même offre, six
 * mois plus tard. Tout se recopie — c'est le but — et ce qui ne se recopie pas
 * tient en trois raisons, pas en préférences :
 *
 *  1. Ce qui identifie le projet. `numero` est attribué par une séquence
 *     Postgres, jamais choisi (cf. /heures) ; `name` est demandé à l'écran.
 *  2. Ce qui appartient au chantier d'ORIGINE et mentirait sur la copie :
 *     le dossier kDrive (deux projets qui le partagent mélangent leurs
 *     pièces, et la règle de la maison veut que ce dossier soit un GESTE),
 *     le numéro d'offre déjà envoyé, la synthèse — un condensé des mises à
 *     jour, qui elles ne suivent pas —, et la référence du client, qui est le
 *     numéro de SON bon de commande.
 *  3. L'avancement. Une copie recommence : phase remise à zéro, pause levée,
 *     offre en brouillon.
 *
 * Ne suivent pas non plus : tâches, mises à jour, fichiers, heures imputées,
 * coûts réels et présentations. Ce sont le TRAVAIL fait sur le projet
 * d'origine, pas sa définition — les recopier fabriquerait un historique qui
 * n'a jamais eu lieu.
 */
export const CHAMPS_PROJET_COPIES = [
  'client', 'description', 'short_description', 'deadline', 'delivery_type',
  'responsible', 'color_override', 'notes',
  'client_address', 'client_contact_id',
  'logistics_address', 'logistics_time', 'logistics_contact', 'logistics_notes',
  'disassembly_date', 'disassembly_address', 'disassembly_time', 'disassembly_contact', 'disassembly_notes',
  'logistics_data', 'site_visit_data', 'site_visit_summary',
]

export function projectCopy(projet, nom) {
  const p = projet || {}
  const copie = { name: String(nom || '').trim() }
  for (const champ of CHAMPS_PROJET_COPIES) copie[champ] = p[champ] ?? null

  // L'offre passe par `offerCopy` : même règle que la duplication d'offre d'un
  // projet à l'autre — on garde les positions, on repart en brouillon sans
  // numéro. Un projet sans offre reste sans offre.
  copie.quote_data = p.quote_data ? offerCopy(p.quote_data) : null

  // Une copie recommence.
  copie.status = 'active'
  copie.phase = null
  copie.suspended = false

  // Du chantier d'origine, et de lui seul.
  copie.kdrive_folder_id = null
  copie.reference = null
  copie.synthese = null
  copie.synthese_le = null
  copie.synthese_entrees = null

  return copie
}
