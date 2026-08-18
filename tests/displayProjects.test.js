import { describe, it, expect } from 'vitest'
import { PUBLIC_FIELDS } from '../pages/api/display-projects'

// L'écran mural est public : cette liste blanche est la seule barrière entre
// la base et internet. Le test échoue si quelqu'un y ajoute un champ interne.
describe('DTO public de l\'écran mural', () => {
  const SENSIBLES = [
    'quote_data', 'notes', 'client_address', 'reference', 'description',
    'logistics_address', 'logistics_contact', 'logistics_notes', 'logistics_time',
    'site_visit_notes', 'site_visit_date', 'kdrive_folder_id', 'kdrive_folder_path',
    'budget', 'invoice_status',
  ]

  it('ne contient aucun champ interne', () => {
    for (const champ of SENSIBLES) expect(PUBLIC_FIELDS).not.toContain(champ)
  })

  it('ne contient rien qui ressemble à un prix, une note ou un chemin de fichier', () => {
    const suspects = PUBLIC_FIELDS.filter(f =>
      /quote|price|prix|marge|margin|budget|note|address|adresse|contact|kdrive|token|secret/i.test(f))
    expect(suspects).toEqual([])
  })

  it('couvre exactement ce que la page affiche', () => {
    expect([...PUBLIC_FIELDS].sort()).toEqual([
      'client', 'color_override', 'deadline', 'delivery_type',
      'id', 'name', 'responsible', 'short_description', 'status',
    ])
  })
})
