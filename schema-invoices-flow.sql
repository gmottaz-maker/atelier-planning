-- Flux de facturation : date d'envoi + niveau de détail (idempotent).
ALTER TABLE customer_invoices ADD COLUMN IF NOT EXISTS sent_at      TIMESTAMPTZ;
ALTER TABLE customer_invoices ADD COLUMN IF NOT EXISTS detail_level TEXT DEFAULT 'detailed'; -- 'detailed' | 'summary'
