import { describe, it, expect } from 'vitest'
import { suiteAMemoriser, cheminApresConnexion } from '../lib/suiteConnexion'

describe('destination après connexion', () => {
  it('garde un chemin interne, avec sa requête et son ancre', () => {
    expect(suiteAMemoriser('/e/a1b2c3d4e5f6')).toBe('/e/a1b2c3d4e5f6')
    expect(suiteAMemoriser('/outils/economat?etat=commander')).toBe('/outils/economat?etat=commander')
    expect(cheminApresConnexion('/e/a1b2c3d4e5f6')).toBe('/e/a1b2c3d4e5f6')
  })

  it('ne mémorise ni l\'accueil ni la page de connexion', () => {
    // Se souvenir de /login ferait boucler la connexion sur elle-même.
    expect(suiteAMemoriser('/')).toBeNull()
    expect(suiteAMemoriser('/login')).toBeNull()
    expect(suiteAMemoriser('/login?suite=%2Foutils')).toBeNull()
    expect(suiteAMemoriser('')).toBeNull()
  })

  it('refuse tout ce qui sortirait de Maze', () => {
    // `//evil.ch` est une URL ABSOLUE pour le navigateur, pas un chemin :
    // c'est précisément ce qu'un startsWith('/') laisse passer. Le `\\` est
    // replié en `/` par certains navigateurs, d'où `/\\evil.ch`.
    for (const piege of ['//evil.ch', '/\\evil.ch', 'https://evil.ch', 'javascript:alert(1)']) {
      expect(cheminApresConnexion(piege), piege).toBe('/')
      expect(suiteAMemoriser(piege), piege).toBeNull()
    }
  })

  it('refuse aussi un chemin interne qui TRANSPORTE une adresse', () => {
    // `/x?u=https://evil.ch/` est un chemin parfaitement interne, et il n'y a
    // aucune raison qu'une destination d'économat en contienne une. On préfère
    // retomber sur l'accueil que raisonner sur ce que la page en fera.
    expect(cheminApresConnexion('/x?u=https://evil.ch/')).toBe('/')
    expect(suiteAMemoriser('/x?u=https://evil.ch/')).toBeNull()
  })

  it('retombe sur l\'accueil devant n\'importe quoi', () => {
    expect(cheminApresConnexion(undefined)).toBe('/')
    expect(cheminApresConnexion(['/a', '/b'])).toBe('/')
    expect(cheminApresConnexion('')).toBe('/')
  })
})
