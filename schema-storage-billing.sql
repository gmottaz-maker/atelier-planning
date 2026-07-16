-- Facturation stockage : date de début de facturation par groupe + objet libre sur les factures.

-- « Facturable dès » : un groupe n'est facturé que pour les trimestres se
-- terminant à cette date ou après. BCV est déjà facturé pour 2026 → dès 2027.
ALTER TABLE storage_groups ADD COLUMN IF NOT EXISTS billable_from DATE;
UPDATE storage_groups SET billable_from = '2027-01-01' WHERE client = 'BCV';

-- Objet libre d'une facture (utilisé pour les factures sans projet, ex. stockage).
ALTER TABLE customer_invoices ADD COLUMN IF NOT EXISTS object TEXT;
