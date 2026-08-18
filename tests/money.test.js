import { describe, it, expect } from 'vitest'
import { fmtCHF, fmtCHF0, fmtNombre } from '../lib/money'

// Ce module existe parce que Intl.NumberFormat('fr-CH') donne un séparateur de
// milliers DIFFÉRENT selon la version d'ICU embarquée dans Node : la CI et la
// machine de développement ne produisaient pas le même texte, et le séparateur
// imprimé sur une facture dépendait de la version que Vercel exécutait.
describe('formatage des montants', () => {
  it('groupe les milliers par apostrophe, à la suisse', () => {
    expect(fmtCHF(1000)).toBe("1'000,00")
    expect(fmtCHF(1234.5)).toBe("1'234,50")
    expect(fmtCHF(39008.94)).toBe("39'008,94")
    expect(fmtCHF(1234567.89)).toBe("1'234'567,89")
  })

  it('ne groupe pas en dessous de mille', () => {
    expect(fmtCHF(575.91)).toBe('575,91')
    expect(fmtCHF(0)).toBe('0,00')
    expect(fmtCHF(999.99)).toBe('999,99')
  })

  it('arrondit à deux décimales', () => {
    expect(fmtCHF(2.344)).toBe('2,34')
    expect(fmtCHF(2.346)).toBe('2,35')
    // 1.005 vaut en réalité 1,00499… en binaire, donc arrondit à 1,00.
    // Intl.NumberFormat faisait exactement pareil : ce n'est pas une
    // régression, et les montants sont de toute façon arrondis au centime
    // en amont (lib/invoiceTotals.js).
    expect(fmtCHF(1.005)).toBe('1,00')
  })

  it('marque les négatifs, sans produire de « −0,00 »', () => {
    expect(fmtCHF(-1500)).toBe("−1'500,00")
    expect(fmtCHF(-0)).toBe('0,00')
    expect(fmtCHF(-0.001)).toBe('0,00')
  })

  it('traite une valeur absente comme zéro plutôt que « NaN »', () => {
    expect(fmtCHF(null)).toBe('0,00')
    expect(fmtCHF(undefined)).toBe('0,00')
    expect(fmtCHF('abc')).toBe('0,00')
    expect(fmtCHF(Infinity)).toBe('0,00')
  })

  it('accepte une chaîne numérique — les montants viennent souvent de formulaires', () => {
    expect(fmtCHF('1234.5')).toBe("1'234,50")
  })

  it('sait formater sans décimales pour les vues d\'ensemble', () => {
    expect(fmtCHF0(1234.6)).toBe("1'235")
    expect(fmtCHF0(999)).toBe('999')
  })

  it('ne dépend pas de la locale du système', () => {
    // Le test échouerait si l'implémentation repassait par Intl.
    const avant = process.env.LANG
    process.env.LANG = 'en_US.UTF-8'
    expect(fmtCHF(1000)).toBe("1'000,00")
    process.env.LANG = avant
  })

  it('expose le formatage générique', () => {
    expect(fmtNombre(1234.567, 3)).toBe("1'234,567")
    expect(fmtNombre(1234, 0)).toBe("1'234")
  })
})
