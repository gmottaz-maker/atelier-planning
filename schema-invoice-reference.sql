-- Référence propre à une facture émise.
--
-- Jusqu'ici, la référence imprimée venait du PROJET (`projects.reference`, la
-- réf. client ou le numéro de commande). Ça suffit quand une commande donne une
-- facture ; ça ne suffit plus dès qu'un chantier est facturé en acompte et en
-- solde, ou qu'un client renvoie un bon de commande par livraison. La facture
-- porte donc la sienne, et retombe sur celle du projet quand elle est vide.
ALTER TABLE customer_invoices ADD COLUMN IF NOT EXISTS reference TEXT;

-- ── Rollback ───────────────────────────────────────────────────────────────
-- ALTER TABLE customer_invoices DROP COLUMN reference;
