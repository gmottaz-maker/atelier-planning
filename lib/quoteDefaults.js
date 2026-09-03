// Tarifs et marge par défaut d'une offre neuve.
//
// Réglables dans /settings → « Offre », écriture admin, partagés par toute
// l'équipe via `app_settings` sous la clé `quote_defaults` — comme les
// coefficients de peinture, et pour la même raison : un tarif qu'on ajuste doit
// profiter à tous, pas rester dans le navigateur de celui qui l'a saisi.
//
// Ces valeurs REMPLISSENT une offre vierge, elles ne la contraignent pas.
// Chaque ligne reste modifiable ensuite, et surtout : le tarif est COPIÉ dans
// `quote_data` à la création. Changer un réglage ne retouche donc aucune offre
// existante — ce serait sinon une réécriture rétroactive de devis déjà envoyés.

import { genRowUid } from './quoteLines'

// L'ordre est celui du panneau de réglages. `defaut` est la valeur qui a servi
// jusqu'ici en dur dans le code, reprise telle quelle pour ne rien changer aux
// offres créées avant l'existence de ce réglage.
export const REGLAGES_OFFRE = [
  { cle: 'taux_projet',      label: 'Gestion de projet',       unite: 'CHF / heure', defaut: '120' },
  { cle: 'taux_visuel',      label: 'Visuels & développement', unite: 'CHF / heure', defaut: '140' },
  { cle: 'taux_visite',      label: 'Visite sur place',        unite: 'CHF / heure', defaut: '100' },
  { cle: 'taux_main_oeuvre', label: "Main d'œuvre",            unite: 'CHF / heure', defaut: '100' },
  { cle: 'taux_montage',     label: 'Montage',                 unite: 'CHF / heure', defaut: '100' },
  { cle: 'taux_demontage',   label: 'Démontage',               unite: 'CHF / heure', defaut: '100' },
  { cle: 'taux_km',          label: 'Trajet',                  unite: 'CHF / km',    defaut: '3'   },
  { cle: 'marge_generale',   label: 'Marge générale',          unite: '%',           defaut: '20'  },
]

export const DEFAUTS_OFFRE = Object.fromEntries(REGLAGES_OFFRE.map(r => [r.cle, r.defaut]))

// Un réglage absent, vide, illisible ou négatif retombe sur sa valeur d'origine :
// un enregistrement corrompu ne doit pas produire une offre à 0 CHF de l'heure.
// Zéro EST accepté en revanche — une marge à 0 % est un choix légitime, et un
// tarif à 0 aussi (prestation offerte). C'est la même règle que
// normaliserComplexites() pour les coefficients de peinture.
export function normaliserReglagesOffre(brut) {
  const out = {}
  for (const r of REGLAGES_OFFRE) {
    const v = brut?.[r.cle]
    const n = (typeof v === 'string' || typeof v === 'number') ? parseFloat(v) : NaN
    out[r.cle] = Number.isFinite(n) && n >= 0 ? String(v).trim() : r.defaut
  }
  return out
}

// Devis vierge : gestion de projet et logistique pré-remplies, aux tarifs
// réglés. Les quantités restent vides — c'est le chiffrage qui les pose.
export function defaultQuote(reglages) {
  const t = normaliserReglagesOffre(reglages)
  return {
    management: [
      { _uid: genRowUid(), item: 'Projet',                  description: 'Gestion de projet générale, correspondances, commandes', rate: t.taux_projet, quantity: '', unit: 'heure(s)' },
      { _uid: genRowUid(), item: 'Visuels & développement', description: 'Création de visuels, plans et développement tests',       rate: t.taux_visuel, quantity: '', unit: 'heure(s)' },
      { _uid: genRowUid(), item: 'Visite sur place',        description: 'Visite sur place',                                        rate: t.taux_visite, quantity: '', unit: 'heure(s)' },
    ],
    items: [],
    subcontracting: [],
    logistics: [
      { _uid: genRowUid(), trajet: 'Trajet',    description: '', rate: t.taux_km,        quantity: '', unit: 'km',       margin: '' },
      { _uid: genRowUid(), trajet: 'Montage',   description: '', rate: t.taux_montage,   quantity: '', unit: 'heure(s)', margin: '' },
      { _uid: genRowUid(), trajet: 'Démontage', description: '', rate: t.taux_demontage, quantity: '', unit: 'heure(s)', margin: '' },
    ],
    general_margin: t.marge_generale,
    status: 'brouillon',
    number: '',
  }
}
