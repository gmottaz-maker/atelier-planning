import { describe, it, expect } from 'vitest'
import { OUTILS, etatsOutils } from '../lib/outils'

describe('index des outils', () => {
  it('dit ce que l’économat attend, sans compter les articles rangés', () => {
    const economat = { articles: [
      { etat: 'commander' }, { etat: 'commander' }, { etat: 'bas' }, { etat: 'commande' }, { etat: 'ok' },
      { etat: 'commander', archived: true },
    ] }
    expect(etatsOutils({ economat })['/outils/economat']).toEqual({ texte: '2 à commander · 1 stock bas · 1 commandé', alerte: true })
  })
  it('un économat tout vert le dit', () => {
    expect(etatsOutils({ economat: { articles: [{ etat: 'ok' }, { etat: 'ok' }] } })['/outils/economat']).toEqual({ texte: '2 articles, tout est en stock', alerte: false })
  })
  it('ne dit rien tant que les données ne sont pas là', () => {
    const e = etatsOutils()
    expect(e['/outils/economat']).toBeUndefined()
    expect(e['/outils/annuaire']).toBeUndefined()
    expect(etatsOutils({ annuaire: { entrees: [{}, {}, {}] } })['/outils/annuaire'].texte).toBe('3 adresses')
  })
  it('chaque outil a une page qui existe', async () => {
    const fs = await import('node:fs')
    for (const o of OUTILS) expect(fs.existsSync(`pages${o.href}.js`)).toBe(true)
  })
})
