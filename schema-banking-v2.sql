-- Évolutions banking v2 : TVA + mode de paiement sur frais
-- ─────────────────────────────────────────────────────────────────────────────

-- TVA sur factures fournisseurs
ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS amount_net  NUMERIC(12, 2);
ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS vat_rate    NUMERIC(5, 2);  -- ex: 8.1, 2.6, 0
ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS vat_amount  NUMERIC(12, 2);

-- TVA sur factures émises
ALTER TABLE customer_invoices ADD COLUMN IF NOT EXISTS amount_net  NUMERIC(12, 2);
ALTER TABLE customer_invoices ADD COLUMN IF NOT EXISTS vat_rate    NUMERIC(5, 2);
ALTER TABLE customer_invoices ADD COLUMN IF NOT EXISTS vat_amount  NUMERIC(12, 2);

-- Mode de paiement sur les frais (perso à rembourser vs carte société)
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'personal';
-- valeurs: 'personal' (carte/compte perso, à rembourser) | 'company' (carte société)

CREATE INDEX IF NOT EXISTS expenses_payment_method_idx ON expenses(payment_method, date DESC);

-- TVA sur les frais / justificatifs
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS amount_net  NUMERIC(12, 2);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS vat_rate    NUMERIC(5, 2);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS vat_amount  NUMERIC(12, 2);

-- Détail TVA multi-taux (ex: [{ "rate": 8.1, "net": 50, "vat": 4.05 }, { "rate": 2.6, "net": 20, "vat": 0.52 }])
ALTER TABLE expenses          ADD COLUMN IF NOT EXISTS vat_breakdown JSONB;
ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS vat_breakdown JSONB;
