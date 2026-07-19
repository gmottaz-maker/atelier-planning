-- Factures fournisseurs : paiement transmis à la banque.
--
-- Flux : pending → sent_to_bank (ordre transmis, date de paiement annoncée,
-- éventuellement future) → paid (confirmé par un débit du relevé CAMT, avec la
-- date réelle du paiement).
--
-- `status` est un TEXT libre (cf. schema-banking.sql) : la valeur
-- 'sent_to_bank' ne demande aucune contrainte supplémentaire.

ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS scheduled_payment_date DATE;        -- date de paiement annoncée à la banque
ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS sent_to_bank_at        TIMESTAMPTZ; -- horodatage de la transmission

-- Retrouver les ordres transmis en attente d'exécution au rapprochement CAMT
CREATE INDEX IF NOT EXISTS supplier_invoices_scheduled_payment_idx
  ON supplier_invoices(scheduled_payment_date)
  WHERE status = 'sent_to_bank';
