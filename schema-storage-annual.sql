-- Mode de facturation d'un groupe de stockage : trimestriel (défaut) ou annuel.
-- En annuel, un montant de palettes est facturé une fois pour l'année
-- (annual_billed_pallets pour annual_year) ; les trimestres ne facturent alors
-- que le SURPLUS éventuel (palettes actuelles − palettes déjà facturées à l'année).
ALTER TABLE storage_groups ADD COLUMN IF NOT EXISTS billing_mode          TEXT DEFAULT 'quarterly';
ALTER TABLE storage_groups ADD COLUMN IF NOT EXISTS annual_billed_pallets NUMERIC;
ALTER TABLE storage_groups ADD COLUMN IF NOT EXISTS annual_year           INTEGER;
