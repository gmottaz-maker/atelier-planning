// Nature d'un mouvement bancaire sans pièce.
//
// Le rapprochement cherche une facture ou un frais en face de chaque ligne.
// Un salaire et un virement entre comptes n'en ont aucun : ils restaient « à
// matcher » indéfiniment, et ne produisaient aucune écriture au journal.
//
// Le compte n'est PAS figé ici : il vient d'`account_mappings` (scope 'bank'),
// modifiable depuis la page Compta. Les valeurs ci-dessous sont les défauts.
//
// Elles doivent exister dans la table `accounts` — `account_mappings.account`
// est une clé étrangère. Trois comptes étaient déjà au plan (5000, 6900, 6700) ;
// schema-bank-classification.sql crée les deux autres (1090, 8900). Un test
// vérifie que cette liste et la migration ne divergent pas.

export const NATURES = [
  {
    cle: 'salaire',
    label: 'Salaire',
    compteDefaut: '5000',
    sens: 'debit',
    aide: 'Un versement par employé. Charge de personnel.',
  },
  {
    cle: 'transfert_interne',
    label: 'Virement interne',
    compteDefaut: '1090',
    sens: 'debit',
    // Un seul compte est importé : la jambe d'arrivée n'apparaît jamais. Le
    // solde de 1090 n'a donc AUCUNE raison de revenir à zéro — il représente ce
    // qui a été déplacé vers l'autre compte. Ne pas en faire un contrôle
    // d'équilibre : ce serait une alerte permanente et fausse.
    aide: 'Déplacement entre vos comptes. N’entre pas au compte de résultat.',
  },
  {
    cle: 'frais_bancaires',
    label: 'Frais bancaires',
    compteDefaut: '6900',
    sens: 'debit',
    aide: 'Tenue de compte, commissions, frais de carte.',
  },
  {
    cle: 'impots',
    label: 'Impôts et taxes',
    compteDefaut: '8900',
    sens: 'debit',
    aide: 'Acomptes et soldes d’impôts directs.',
  },
  {
    cle: 'autre',
    label: 'Autre (sans pièce)',
    compteDefaut: '6700',
    sens: 'debit',
    aide: 'À n’utiliser que si rien d’autre ne convient.',
  },
]

const PAR_CLE = new Map(NATURES.map(n => [n.cle, n]))

export const CLES_NATURE = NATURES.map(n => n.cle)
export const estNatureValide = (cle) => PAR_CLE.has(cle)
export const nature = (cle) => PAR_CLE.get(cle) || null
export const libelleNature = (cle) => PAR_CLE.get(cle)?.label || cle || ''

/**
 * Une transaction est « traitée » si elle porte une pièce OU une nature.
 * C'est ce qui la fait sortir de la liste « à matcher ».
 */
export const estTraitee = (tx) => !!(tx?.matched_to_type || tx?.classification)
