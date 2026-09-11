import { describe, it, expect } from 'vitest'
import {
  joursAImprimer, dateLongue, codeFeuille, projetsLegende, feuilleHtml, feuillesHtml, LIGNES_PAR_FEUILLE,
} from '../lib/feuilleHeures'

const PROJETS = [
  { numero: 124, name: 'Canapé Margherita', client: 'Coca-Cola HBC Schweiz AG', status: 'active' },
  { numero: 146, name: 'Cubes - The W.Day', client: 'The W. Day', status: 'active' },
  { numero: 140, name: 'DJ Desk Alaïa', client: 'Red Bull AG', status: 'active', suspended: true },
  { numero: 101, name: 'Watches and Wonders', client: 'Rolex', status: 'archived' },
]
const ACTIVITES = [
  { code: 23, libelle: 'Assemblage', famille: 'atelier', actif: true },
  { code: 10, libelle: 'Gestion de projet', famille: 'gestion', actif: true },
  { code: 31, libelle: 'Peinture / vernis / sticker', famille: 'finitions', actif: true },
  { code: 25, libelle: 'Réparations', famille: 'atelier', actif: false },
  { code: 63, libelle: 'Divers', famille: 'interne', actif: true },
]

describe('joursAImprimer', () => {
  it('ne garde que lundi, mardi, jeudi, vendredi', () => {
    expect(joursAImprimer('2026-09-14', '2026-09-20')).toEqual(['2026-09-14', '2026-09-15', '2026-09-17', '2026-09-18'])
  })
  it('rend vide une période sans jour travaillé, ou invalide', () => {
    expect(joursAImprimer('2026-09-19', '2026-09-20')).toEqual([])   // samedi, dimanche
    expect(joursAImprimer('2026-09-18', '2026-09-14')).toEqual([])
    expect(joursAImprimer('14.09.2026', '2026-09-18')).toEqual([])
  })
  // On travaille parfois un mercredi ou un samedi : la feuille de ce jour-là
  // doit pouvoir sortir.
  it('imprime toujours un jour demandé seul, même non travaillé', () => {
    expect(joursAImprimer('2026-09-16', '2026-09-16')).toEqual(['2026-09-16'])   // mercredi
    expect(joursAImprimer('2026-09-19', '2026-09-19')).toEqual(['2026-09-19'])   // samedi
  })
  it('imprime chaque jour de la période quand on le demande', () => {
    expect(joursAImprimer('2026-09-14', '2026-09-20', { tous: true })).toHaveLength(7)
  })
  it('traverse le changement d\'heure', () => {
    expect(joursAImprimer('2026-10-23', '2026-10-26')).toEqual(['2026-10-23', '2026-10-26'])
  })
})

describe('en-tête imprimé', () => {
  it('écrit la date en toutes lettres', () => {
    expect(dateLongue('2026-09-17')).toBe('jeudi 17 septembre 2026')
  })
  it('donne à chaque feuille un code lisible par le scan', () => {
    expect(codeFeuille('Arnaud', '2026-09-17')).toBe('H·2026-09-17·ARNAUD')
  })
})

describe('légende des projets', () => {
  it('garde les projets en cours, hors pause, les plus récents d\'abord', () => {
    expect(projetsLegende(PROJETS).map(p => p.numero)).toEqual([146, 124])
  })
})

describe('feuilleHtml', () => {
  const html = feuilleHtml({ personne: 'Arnaud', date: '2026-09-17', projets: PROJETS, activites: ACTIVITES })

  it('imprime nom, date et code de feuille', () => {
    expect(html).toContain('Arnaud')
    expect(html).toContain('jeudi 17 septembre 2026')
    expect(html).toContain('H·2026-09-17·ARNAUD')
  })
  it('a ses lignes, avec 3 cases pour le projet et 2 pour l\'activité', () => {
    expect(html.match(/class="num"/g)).toHaveLength(LIGNES_PAR_FEUILLE)
    // par ligne : 4 + 4 cases d'horaire, 3 de projet, 2 d'activité
    expect(html.match(/class="case"/g)).toHaveLength(LIGNES_PAR_FEUILLE * 13)
  })
  it('liste les projets en cours avec leur numéro, mais pas ceux en pause ni archivés', () => {
    expect(html).toContain('<b>146</b>')
    expect(html).toContain('Canapé Margherita')
    expect(html).not.toContain('DJ Desk Alaïa')
    expect(html).not.toContain('Watches and Wonders')
  })
  it('range les activités par famille, dans l\'ordre du travail, sans les inactives', () => {
    expect(html.indexOf('>Gestion<')).toBeLessThan(html.indexOf('>Atelier<'))
    expect(html.indexOf('>Atelier<')).toBeLessThan(html.indexOf('>Finitions<'))
    expect(html).toContain('<b>63</b>Divers')
    expect(html).not.toContain('Réparations')
  })
  it('échappe ce qui vient de la base', () => {
    const piege = feuilleHtml({ personne: '<script>x</script>', date: '2026-09-17', projets: [], activites: [] })
    expect(piege).not.toContain('<script>x')
    expect(piege).toContain('&lt;script&gt;')
  })
  it('signale les projets qui ne tiennent pas dans la légende', () => {
    const beaucoup = Array.from({ length: 45 }, (_, i) => ({ numero: 100 + i, name: `P${i}`, status: 'active' }))
    expect(feuilleHtml({ personne: 'A', date: '2026-09-17', projets: beaucoup, activites: [] })).toContain('… et 5 autres')
  })
})

describe('feuillesHtml', () => {
  it('une feuille par personne et par jour, rangées jour par jour', () => {
    const html = feuillesHtml({ personnes: ['Arnaud', 'Guillaume'], jours: ['2026-09-17', '2026-09-18'], projets: [], activites: [] })
    expect(html.match(/class="feuille"/g)).toHaveLength(4)
    const ordre = [...html.matchAll(/H·(\d{4}-\d{2}-\d{2})·(\w+)/g)].map(m => `${m[1]} ${m[2]}`)
    expect(ordre).toEqual(['2026-09-17 ARNAUD', '2026-09-17 GUILLAUME', '2026-09-18 ARNAUD', '2026-09-18 GUILLAUME'])
  })
  it('prend ses marges de @page', () => {
    expect(feuillesHtml({ personnes: ['A'], jours: ['2026-09-17'] })).toMatch(/@page \{ size: A4; margin: 10mm; \}/)
  })
})
