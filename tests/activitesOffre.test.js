import { describe, it, expect } from 'vitest'
import { activitesFacturables, activitesParFamille, ligneOffreActivite, libelleFamille, libelleSuitActivite } from '../lib/heures'

const ACT = [
  { code: 31, libelle: 'Peinture / vernis / sticker', famille: 'finitions', tarif_vente: 120, facturee_heure: true, actif: true },
  { code: 10, libelle: 'Gestion de projet', famille: 'gestion', tarif_vente: 140, facturee_heure: true, actif: true },
  { code: 20, libelle: 'CNC', famille: 'atelier', tarif_vente: null, facturee_heure: true, actif: true },
  { code: 51, libelle: 'Conduite', famille: 'logistique', tarif_vente: null, facturee_heure: false, actif: true },
  { code: 63, libelle: 'Divers', famille: 'interne', facturee_heure: false, actif: true },
  { code: 26, libelle: 'Ancienne', famille: 'atelier', tarif_vente: 100, facturee_heure: true, actif: false },
]

describe('activités proposées dans l\'offre', () => {
  it('ne propose ni la conduite, ni l\'interne, ni une activité désactivée', () => {
    expect(activitesFacturables(ACT).map(a => a.code)).toEqual([10, 20, 31])
  })

  it('range par famille, dans l\'ordre des codes', () => {
    const g = activitesParFamille(ACT)
    expect(g.map(x => x.famille)).toEqual(['gestion', 'atelier', 'finitions'])
    expect(g[0].libelle).toBe('Gestion')
  })

  it('supporte une réponse d\'API absente ou fautive', () => {
    expect(activitesFacturables(undefined)).toEqual([])
    expect(activitesFacturables({ error: 'x' })).toEqual([])
  })

  it('libelleFamille ne laisse jamais un trou', () => {
    expect(libelleFamille('chantier')).toBe('Chantier')
    expect(libelleFamille(null)).toBe('Autre')
  })
})

describe('ligneOffreActivite — la ligne qu\'une activité remplit', () => {
  it('porte le code, le libellé et le tarif de vente, en heures', () => {
    expect(ligneOffreActivite(ACT[0])).toEqual({
      description: 'Peinture / vernis / sticker', rate: '120', quantity: '', unit: 'heure(s)', activite: 31,
    })
  })

  it('laisse le prix VIDE quand l\'activité n\'a pas de tarif, plutôt que d\'en inventer un', () => {
    const l = ligneOffreActivite(ACT[2])
    expect(l.rate).toBe('')
    expect(l.activite).toBe(20)
  })
})

describe('libelleSuitActivite — le nom de l\'activité remplit, sans écraser', () => {
  it('remplit une ligne vide', () => {
    expect(libelleSuitActivite('', null)).toBe(true)
    expect(libelleSuitActivite('   ', 'Peinture')).toBe(true)
    expect(libelleSuitActivite(undefined, null)).toBe(true)
  })

  it('suit le changement de code tant que le texte est celui de l\'ancienne activité', () => {
    expect(libelleSuitActivite('Peinture / vernis / sticker', 'Peinture / vernis / sticker')).toBe(true)
  })

  it('ne touche pas à ce qu\'on a écrit pour le client', () => {
    expect(libelleSuitActivite('assemblage et collage des panneaux', 'Assemblage')).toBe(false)
    expect(libelleSuitActivite('gestion de projet générale, correspondances', null)).toBe(false)
  })
})
