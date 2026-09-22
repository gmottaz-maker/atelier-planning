import { describe, it, expect } from 'vitest'
import { dimensionsReduites, LARGEUR_MAX } from '../lib/imageReduite'

describe('dimensionsReduites', () => {
  it('ramène le plus grand côté à la limite, en gardant les proportions', () => {
    expect(dimensionsReduites(4000, 3000)).toEqual({ largeur: 2000, hauteur: 1500, reduite: true })
    expect(dimensionsReduites(3000, 4000)).toEqual({ largeur: 1500, hauteur: 2000, reduite: true })
  })

  it('n\'agrandit pas une image déjà petite : on ne fabrique pas de pixels', () => {
    expect(dimensionsReduites(800, 600)).toEqual({ largeur: 800, hauteur: 600, reduite: false })
    expect(dimensionsReduites(LARGEUR_MAX, 900).reduite).toBe(false)
  })

  it('supporte une image illisible sans rien casser', () => {
    expect(dimensionsReduites(0, 0)).toEqual({ largeur: 0, hauteur: 0, reduite: false })
    expect(dimensionsReduites(undefined, null).reduite).toBe(false)
  })

  it('un panorama très large est ramené par sa largeur', () => {
    expect(dimensionsReduites(6000, 1000)).toEqual({ largeur: 2000, hauteur: 333, reduite: true })
  })
})
