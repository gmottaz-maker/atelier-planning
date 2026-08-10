-- Escompte / remise sur l'ensemble d'une facture émise.
-- Distinct des escomptes par ligne du devis : celui-ci s'applique au
-- sous-total HT, avant TVA (remise commerciale, geste, acompte déduit…).
--   discount_label  : libellé imprimé sur le PDF (ex. « Remise fidélité »)
--   discount_rate   : % appliqué au sous-total HT
--   discount_amount : montant fixe en CHF, appliqué après le %

ALTER TABLE customer_invoices ADD COLUMN IF NOT EXISTS discount_label  TEXT;
ALTER TABLE customer_invoices ADD COLUMN IF NOT EXISTS discount_rate   NUMERIC(5, 2);
ALTER TABLE customer_invoices ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12, 2);
