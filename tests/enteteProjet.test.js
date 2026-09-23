import { describe, it, expect } from 'vitest'
import { chargeUtileEntete, TYPES_LIVRAISON } from '../lib/projectHelpers'

const PROJET = {
  id: 'p1', numero: 132, name: 'Event Verbier', client: 'Kando', deadline: '2026-12-17',
  delivery_type: 'Livraison', responsible: 'Arnaud', status: 'active', suspended: false,
  quote_data: { items: [{ name: 'Comptoir' }] },
  site_visit_data: { acces: 'par la cour' },
  site_visit_summary: 'résumé',
  logistics_data: [{ type: 'montage', address: 'Verbier' }],
  logistics_address: 'Verbier',
}

describe('chargeUtileEntete — modifier l\'en-tête sans abîmer le reste', () => {
  it('envoie le projet entier : un envoi partiel effacerait l\'échéance', () => {
    const corps = chargeUtileEntete(PROJET, { name: 'Event Verbier 2026' })
    expect(corps.name).toBe('Event Verbier 2026')
    // La route écrit `deadline: deadline || null` — l'absence vaut effacement.
    expect(corps.deadline).toBeNull()
    expect(corps.client).toBe('Kando')
    expect(corps.logistics_address).toBe('Verbier')
  })

  it('garde l\'échéance quand le formulaire la porte', () => {
    expect(chargeUtileEntete(PROJET, { deadline: '2027-01-09' }).deadline).toBe('2027-01-09')
  })

  it('une date vidée efface bien l\'échéance', () => {
    expect(chargeUtileEntete(PROJET, { deadline: '' }).deadline).toBeNull()
  })

  it('ne renvoie NI l\'offre, NI la fiche de visite, NI la logistique', () => {
    const corps = chargeUtileEntete(PROJET, { deadline: '2026-12-17' })
    expect(corps.quote_data).toBeUndefined()
    expect(corps.site_visit_data).toBeUndefined()
    expect(corps.site_visit_summary).toBeUndefined()
    expect(corps.logistics_data).toBeUndefined()
  })

  it('le formulaire a le dernier mot sur le projet chargé', () => {
    const corps = chargeUtileEntete(PROJET, { status: 'archived', suspended: true, phase: 'termine', deadline: '2026-12-17' })
    expect(corps.status).toBe('archived')
    expect(corps.suspended).toBe(true)
    expect(corps.phase).toBe('termine')
  })

  it('supporte un projet ou un formulaire absent', () => {
    expect(chargeUtileEntete(null, null).deadline).toBeNull()
    expect(chargeUtileEntete(PROJET, null).name).toBe('Event Verbier')
  })

  it('les modes de livraison sont la liste partagée avec la liste des projets', () => {
    expect(TYPES_LIVRAISON).toContain('Montage sur place')
    expect(TYPES_LIVRAISON[0]).toBe('Livraison')
  })
})
