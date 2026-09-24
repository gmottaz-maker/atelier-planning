import { describe, it, expect } from 'vitest'
import { invoiceCopyBody, offerCopy, projectCopy } from '../lib/duplicateDoc'

const paid = {
  id: 12, invoice_number: '2026-002', qr_reference: '2100000000031394714300',
  project_id: 'p1', client_name: 'DIAGEO Suisse', client_address: 'Rue X 1',
  object: 'MJF 2026', amount: 70798.15, amount_net: 65493.2, vat_rate: 8.1, vat_amount: 5304.95,
  currency: 'CHF', iban_recipient: 'CH93…', notes: 'Merci', detail_level: 'summary',
  discount_label: 'Remise', discount_rate: 5, discount_amount: 100,
  quote_snapshot: { items: [{ name: 'Bar', purchases: [], labor: [] }] },
  issue_date: '2026-07-14', due_date: '2026-08-13',
  status: 'paid', sent_at: '2026-08-10T10:00:00Z', paid_at: '2026-08-10', paid_transaction_id: 44,
}

describe('invoiceCopyBody', () => {
  const copy = invoiceCopyBody(paid, '2026-08-20')

  it('reprend le contenu facturable', () => {
    expect(copy.client_name).toBe('DIAGEO Suisse')
    expect(copy.amount).toBe(70798.15)
    expect(copy.quote_snapshot).toEqual(paid.quote_snapshot)
    expect(copy.object).toBe('MJF 2026')
    expect(copy.detail_level).toBe('summary')
  })

  it('reprend l\'escompte', () => {
    expect(copy.discount_label).toBe('Remise')
    expect(copy.discount_rate).toBe(5)
    expect(copy.discount_amount).toBe(100)
  })

  it('ne recopie JAMAIS le numéro ni la référence QR', () => {
    expect(copy.invoice_number).toBeUndefined()
    expect(copy.qr_reference).toBeUndefined()
  })

  it('ne recopie pas l\'état de paiement', () => {
    expect(copy.status).toBe('created')
    expect(copy.sent_at).toBeUndefined()
    expect(copy.paid_at).toBeUndefined()
    expect(copy.paid_transaction_id).toBeUndefined()
  })

  it('repart des dates du jour, échéance à 30 jours', () => {
    expect(copy.issue_date).toBe('2026-08-20')
    expect(copy.due_date).toBe('2026-09-19')
  })
})

describe('offerCopy', () => {
  const src = {
    management: [{ item: 'Projet' }], items: [{ name: 'Bar' }],
    subcontracting: [], logistics: [{ trajet: 'Montage' }], general_margin: '20',
    status: 'accepte', number: '2026-014', sent_date: '2026-05-01', archived: true,
  }
  const copy = offerCopy(src)

  it('garde les positions et la marge', () => {
    expect(copy.items).toEqual(src.items)
    expect(copy.management).toEqual(src.management)
    expect(copy.logistics).toEqual(src.logistics)
    expect(copy.general_margin).toBe('20')
  })

  it('repart en brouillon, sans numéro, sans date d\'envoi ni archivage', () => {
    expect(copy.status).toBe('brouillon')
    expect(copy.number).toBe('')
    expect(copy.sent_date).toBeUndefined()
    expect(copy.archived).toBeUndefined()
  })

  it('tolère un devis vide', () => {
    expect(offerCopy(null).items).toEqual([])
    expect(offerCopy(undefined).status).toBe('brouillon')
  })
})

// ── Duplication d'un projet entier ───────────────────────────────────────────
const projet = {
  id: 'p1', numero: 142, name: 'Bar Nespresso Montreux', client: 'Nespresso SA',
  description: 'Bar éphémère', short_description: 'Bar', deadline: '2026-07-01',
  delivery_type: 'montage', responsible: 'Arnaud', color_override: '#123456',
  notes: 'Accès par la cour', client_address: 'Av. de Chillon 1', client_contact_id: 9,
  logistics_address: 'Quai 3', logistics_time: '07:00', logistics_contact: 'Marc',
  logistics_notes: 'Monte-charge', disassembly_date: '2026-07-20',
  disassembly_address: 'Quai 3', disassembly_time: '18:00', disassembly_contact: 'Marc',
  disassembly_notes: 'Laisser propre',
  logistics_data: { vehicule: 'master' }, site_visit_data: { ok: true }, site_visit_summary: 'RAS',
  quote_data: { management: [{ item: 'Projet' }], items: [], subcontracting: [], logistics: [],
    general_margin: '20', status: 'accepte', number: '2026-014' },
  kdrive_folder_id: 'kd-999', reference: 'BC-4471',
  phase: 'termine', suspended: true, status: 'archived',
  synthese: 'Tout s\'est bien passé', synthese_le: '2026-07-21T10:00:00Z', synthese_entrees: 12,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-07-21T00:00:00Z',
}

describe('projectCopy', () => {
  const copie = projectCopy(projet, '  Bar Nespresso Lausanne  ')

  it('prend le nom demandé, débarrassé de ses espaces', () => {
    expect(copie.name).toBe('Bar Nespresso Lausanne')
  })

  it('ne choisit ni identifiant ni numéro — la base les attribue', () => {
    expect(copie.id).toBeUndefined()
    expect(copie.numero).toBeUndefined()
    expect(copie.created_at).toBeUndefined()
    expect(copie.updated_at).toBeUndefined()
  })

  it('recopie tout ce qui définit le chantier', () => {
    expect(copie.client).toBe('Nespresso SA')
    expect(copie.responsible).toBe('Arnaud')
    expect(copie.notes).toBe('Accès par la cour')
    expect(copie.client_contact_id).toBe(9)
    expect(copie.logistics_contact).toBe('Marc')
    expect(copie.disassembly_notes).toBe('Laisser propre')
    expect(copie.logistics_data).toEqual({ vehicule: 'master' })
    expect(copie.site_visit_data).toEqual({ ok: true })
    expect(copie.site_visit_summary).toBe('RAS')
    expect(copie.deadline).toBe('2026-07-01')
    expect(copie.color_override).toBe('#123456')
  })

  it('reprend les positions de l\'offre, mais en brouillon et sans numéro', () => {
    // Deux offres ne portent jamais le même numéro, et une copie n'a été
    // acceptée par personne.
    expect(copie.quote_data.management).toEqual([{ item: 'Projet' }])
    expect(copie.quote_data.general_margin).toBe('20')
    expect(copie.quote_data.status).toBe('brouillon')
    expect(copie.quote_data.number).toBe('')
  })

  it('un projet sans offre reste sans offre', () => {
    expect(projectCopy({ name: 'x' }, 'y').quote_data).toBeNull()
  })

  it('ne partage JAMAIS le dossier kDrive de l\'original', () => {
    // Deux projets sur un même dossier mélangent leurs pièces — et la règle de
    // la maison veut que ce dossier soit un geste, jamais une conséquence.
    expect(copie.kdrive_folder_id).toBeNull()
  })

  it('laisse derrière ce qui appartient au chantier d\'origine', () => {
    expect(copie.reference).toBeNull()          // le bon de commande du client
    expect(copie.synthese).toBeNull()           // un condensé de mises à jour qui ne suivent pas
    expect(copie.synthese_le).toBeNull()
    expect(copie.synthese_entrees).toBeNull()
  })

  it('recommence : active, sans phase, sans pause', () => {
    expect(copie.status).toBe('active')
    expect(copie.phase).toBeNull()
    expect(copie.suspended).toBe(false)
  })

  it('n\'invente rien pour un projet presque vide', () => {
    const nu = projectCopy({ client: 'X' }, 'Neuf')
    expect(nu.name).toBe('Neuf')
    expect(nu.client).toBe('X')
    for (const champ of ['notes', 'deadline', 'logistics_data', 'site_visit_summary']) {
      expect(nu[champ], champ).toBeNull()
    }
  })
})
