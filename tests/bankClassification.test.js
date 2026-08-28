import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { NATURES, estNatureValide, nature, estTraitee } from '../lib/bankClassification'
import { buildJournal, accountFor } from '../lib/comptaJournal'

// Salaires et virements entre comptes n'ont aucune pièce en face : ils
// restaient « à matcher » indéfiniment et — plus grave — ne produisaient
// AUCUNE écriture au journal. Le compte de résultat était incomplet.

const tx = (o = {}) => ({
  id: 1, amount: -4200, booking_date: '2026-08-25',
  description: 'SALAIRE AOUT', counterparty_name: 'Arnaud', reference: 'SAL-08', ...o,
})
// buildJournal renvoie { lines, totalDebit, … } — on ne teste que les lignes.
const journal = (bankTx, mappings = []) => buildJournal({ bankTx, mappings }).lines

describe('natures', () => {
  it('valide les clés connues et rejette le reste', () => {
    for (const n of NATURES) expect(estNatureValide(n.cle)).toBe(true)
    for (const x of ['', null, undefined, 'facture', 'SALAIRE']) expect(estNatureValide(x)).toBe(false)
  })

  it('donne un compte par défaut à chaque nature', () => {
    for (const n of NATURES) expect(n.compteDefaut).toMatch(/^\d{4}$/)
  })

  // `account_mappings.account` est une clé étrangère vers `accounts(number)` :
  // un compte par défaut absent du plan fait échouer la migration entière.
  // C'est arrivé — 1090, 6940 et 8900 n'existaient pas, et le script a été
  // annulé en bloc. Ce test tient les deux fichiers ensemble.
  it('chaque compte par défaut est garanti par la migration', () => {
    const sql = readFileSync(new URL('../schema-bank-classification.sql', import.meta.url), 'utf8')
    // Comptes que la migration crée, plus ceux qu'elle déclare déjà présents.
    const crees = [...sql.matchAll(/^\s*\('(\d{4})',\s*'[^']*',\s*'(?:actif|passif|produit|charge)'/gm)].map(m => m[1])
    const mappes = [...sql.matchAll(/\('bank',\s*'(\w+)',\s*'(\d{4})'\)/g)]
    // Toute nature du code doit avoir sa ligne de mapping dans la migration…
    for (const n of NATURES) {
      const ligne = mappes.find(m => m[1] === n.cle)
      expect(ligne, `nature « ${n.cle} » absente de la migration`).toBeTruthy()
      // …et le compte doit être le même des deux côtés.
      expect(ligne[2], `compte divergent pour « ${n.cle} »`).toBe(n.compteDefaut)
    }
    // Les comptes hors plan initial doivent être créés par la migration.
    const dejaAuPlan = ['5000', '6900', '6700']
    for (const n of NATURES) {
      if (dejaAuPlan.includes(n.compteDefaut)) continue
      expect(crees, `le compte ${n.compteDefaut} n'est créé nulle part`).toContain(n.compteDefaut)
    }
  })
})

describe('estTraitee — ce qui sort de « à matcher »', () => {
  it('une pièce rapprochée, ou une nature, suffisent', () => {
    expect(estTraitee({ matched_to_type: 'expense' })).toBe(true)
    expect(estTraitee({ classification: 'salaire' })).toBe(true)
  })
  it('une transaction nue reste à traiter', () => {
    expect(estTraitee({})).toBe(false)
    expect(estTraitee({ matched_to_type: null, classification: null })).toBe(false)
  })
})

describe('accountFor — le défaut de l’appelant prime sur le repli générique', () => {
  it('utilise le mapping quand il existe', () => {
    expect(accountFor([{ scope: 'bank', category: 'salaire', account: '5200' }], 'bank', 'salaire', '5000')).toBe('5200')
  })
  it('retombe sur le défaut fourni, pas sur « autres charges »', () => {
    // Sans ce paramètre, un salaire atterrissait en 6700.
    expect(accountFor([], 'bank', 'salaire', '5000')).toBe('5000')
  })
  it('garde le repli historique quand aucun défaut n’est donné', () => {
    expect(accountFor([], 'expense', 'divers')).toBe('6700')
  })
})

describe('journal — les mouvements sans pièce entrent enfin', () => {
  it('un salaire débite les charges de personnel et crédite la banque', () => {
    const [l] = journal([tx({ classification: 'salaire' })])
    expect(l.debit).toBe('5000')
    expect(l.credit).toBe('1020')
    expect(l.montant).toBe(4200)
    expect(l.libelle).toMatch(/^Salaire —/)
    expect(l.tiers).toBe('Arnaud')
  })

  it('un virement interne passe par le compte de virement, hors résultat', () => {
    const [l] = journal([tx({ classification: 'transfert_interne', amount: -1500, description: 'VIREMENT' })])
    expect(l.debit).toBe('1090')
    expect(l.credit).toBe('1020')
    // Surtout pas un compte de charge : ce n'est pas une dépense.
    expect(l.debit.startsWith('6')).toBe(false)
  })

  it('inverse l’écriture pour une entrée — remboursement, virement reçu', () => {
    const [l] = journal([tx({ classification: 'impots', amount: 320, description: 'REMB IMPOT' })])
    expect(l.debit).toBe('1020')
    expect(l.credit).toBe('8900')
    expect(l.montant).toBe(320)
  })

  it('respecte le compte choisi dans Compta', () => {
    const [l] = journal([tx({ classification: 'salaire' })], [{ scope: 'bank', category: 'salaire', account: '5200' }])
    expect(l.debit).toBe('5200')
  })

  it('ignore une nature inconnue plutôt que d’inventer un compte', () => {
    expect(journal([tx({ classification: 'nimporte_quoi' })])).toHaveLength(0)
  })

  it('n’écrit rien pour une transaction ni rapprochée ni classée', () => {
    expect(journal([tx()])).toHaveLength(0)
  })

  it('ne compte pas deux fois : une pièce rapprochée ignore la nature', () => {
    // La base interdit d'avoir les deux ; si ça arrivait malgré tout, la
    // branche « pièce » gagne et il n'y a qu'une écriture.
    const lignes = journal([tx({ matched_to_type: 'supplier_invoice', matched_to_id: 7, classification: 'salaire' })])
    expect(lignes).toHaveLength(1)
    expect(lignes[0].credit).toBe('1020')
    expect(lignes[0].debit).toBe('2000')
  })
})
