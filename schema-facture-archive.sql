-- Archivage MANUEL d'une facture cliente (19 novembre 2026).
--
-- L'archivage des factures était entièrement DÉRIVÉ (lib/autoArchive.js) :
-- payée, et le mois du paiement révolu. La règle ne sait donc ranger que ce
-- qui finit par être payé — une facture annulée ou un brouillon jamais envoyé
-- restaient dans la liste courante à vie. Au 19 novembre 2026 : 4 annulées et
-- 11 brouillons sur 50.
--
-- `archived_at` prime sur la règle automatique, comme `quote_data.archived`
-- prime déjà pour une offre. NULL = pas rangée à la main ; la règle s'applique.
--
-- Pas de GRANT : la table existe déjà et porte ses droits.
ALTER TABLE customer_invoices ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

COMMENT ON COLUMN customer_invoices.archived_at IS
  'Rangée à la main le… ; prime sur l''archivage automatique de fin de mois.';

-- Rollback :
-- ALTER TABLE customer_invoices DROP COLUMN IF EXISTS archived_at;
