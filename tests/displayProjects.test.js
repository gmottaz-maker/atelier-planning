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
      'id', 'name', 'numero', 'responsible', 'short_description', 'status',
    ])
  })
})

// ── Filtrage ────────────────────────────────────────────────────────────────
// La route est appelée pour de vrai : seuls Supabase et l'identité sont simulés.
import { vi } from 'vitest'
import { faireRes, faireReq, faireSupabase } from './helpers/routeHarness'

let base = null
vi.mock('../lib/supabase-server', () => ({ getSupabaseServer: () => base }))

const appeler = async (projects) => {
  base = faireSupabase({ tables: { projects } })
  const mod = await import('../pages/api/display-projects')
  const res = faireRes()
  await mod.default(faireReq({ method: 'GET' }), res)
  return res
}

const ACCEPTEE = { status: 'accepte' }

describe('écran mural — projets affichés', () => {
  it('ne montre que les offres acceptées', async () => {
    const res = await appeler([
      { id: 1, name: 'Acceptée',  status: 'active', quote_data: ACCEPTEE },
      { id: 2, name: 'Envoyée',   status: 'active', quote_data: { status: 'envoye' } },
      { id: 3, name: 'Brouillon', status: 'active', quote_data: { status: 'brouillon' } },
      { id: 4, name: 'Refusée',   status: 'active', quote_data: { status: 'refuse' } },
      { id: 5, name: 'À corriger', status: 'active', quote_data: { status: 'a_corriger' } },
    ])
    expect(res.body.map(p => p.name)).toEqual(['Acceptée'])
  })

  it('écarte un projet sans offre du tout', async () => {
    const res = await appeler([
      { id: 6, name: 'Sans offre', status: 'active', quote_data: null },
      { id: 7, name: 'Vide',       status: 'active', quote_data: {} },
    ])
    expect(res.body).toEqual([])
  })

  it('masque les projets en pause, même acceptés', async () => {
    const res = await appeler([
      { id: 8, name: 'En cours', status: 'active', suspended: false, quote_data: ACCEPTEE },
      { id: 9, name: 'En pause', status: 'active', suspended: true,  quote_data: ACCEPTEE },
    ])
    expect(res.body.map(p => p.name)).toEqual(['En cours'])
  })

  // `suspended` est apparu après coup : une ligne plus ancienne peut valoir
  // NULL. Un filtre `= false` l'aurait fait disparaître de l'écran.
  it('garde un projet dont `suspended` est vide', async () => {
    const res = await appeler([{ id: 10, name: 'Ancien', status: 'active', suspended: null, quote_data: ACCEPTEE }])
    expect(res.body.map(p => p.name)).toEqual(['Ancien'])
  })

  it('n\'affiche toujours que les projets actifs', async () => {
    const res = await appeler([
      { id: 11, name: 'Archivé', status: 'archived', quote_data: ACCEPTEE },
      { id: 12, name: 'Actif',   status: 'active',   quote_data: ACCEPTEE },
    ])
    expect(res.body.map(p => p.name)).toEqual(['Actif'])
  })

  // Filtrer sur l'offre ne doit pas la publier : `quote_data` porte les prix
  // d'achat et les marges.
  it('ne rend public ni l\'offre ni la pause', () => {
    expect(PUBLIC_FIELDS).not.toContain('quote_data')
    expect(PUBLIC_FIELDS).not.toContain('suspended')
  })
})
