-- ═══════════════════════════════════════════════════════════════════════════
-- Factures d'acompte
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Un acompte est une FACTURE À PART ENTIÈRE : même table, même séquence de
-- numéros, même QR-bill, même PDF. Il est envoyé, payé, rapproché en banque et
-- comptabilisé comme les autres. En faire un objet séparé aurait obligé à lui
-- refabriquer chacune de ces vies.
--
-- Trois champs suffisent à le distinguer, plus un pour ce que la facture
-- finale déduit.

ALTER TABLE customer_invoices
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'facture';

-- Les listes fermées sont doublées d'un CHECK en base : c'est une divergence
-- de vocabulaire entre code et base qui avait rendu les factures clientes
-- irrapprochables pendant des mois.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_invoices_type_chk') THEN
    ALTER TABLE customer_invoices
      ADD CONSTRAINT customer_invoices_type_chk CHECK (type IN ('facture', 'acompte'));
  END IF;
END $$;

-- Sur quoi porte l'acompte, et la valeur saisie. Le MONTANT n'est pas stocké
-- ici : il se recalcule depuis l'offre (`quote_snapshot`) à chaque validation
-- serveur. C'est ce qui permet de refuser un montant que le navigateur aurait
-- fabriqué.
ALTER TABLE customer_invoices
  ADD COLUMN IF NOT EXISTS acompte_base   TEXT,
  ADD COLUMN IF NOT EXISTS acompte_valeur NUMERIC(12, 2);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_invoices_acompte_chk') THEN
    ALTER TABLE customer_invoices ADD CONSTRAINT customer_invoices_acompte_chk CHECK (
      -- Un acompte dit toujours sur quoi il porte ; une facture ordinaire ne
      -- porte aucun de ces deux champs.
      (type = 'acompte' AND acompte_base IN ('pourcentage', 'montant') AND acompte_valeur > 0)
      OR (type = 'facture' AND acompte_base IS NULL AND acompte_valeur IS NULL)
    );
  END IF;
END $$;

-- Ce que la facture finale déduit, FIGÉ au moment de l'émission :
-- [{ id, numero, date, montant }]. Même raison que le forfait de transport qui
-- recopie sa distance — une facture est un document émis, et annuler un
-- acompte six mois plus tard ne doit pas réécrire ce que le client a reçu.
ALTER TABLE customer_invoices
  ADD COLUMN IF NOT EXISTS acomptes_deduits JSONB;

-- « Quels acomptes ce projet a-t-il déjà ? » est la question posée à chaque
-- ouverture d'une facture.
CREATE INDEX IF NOT EXISTS customer_invoices_acomptes_idx
  ON customer_invoices(project_id, type) WHERE type = 'acompte';

-- Rollback :
--   DROP INDEX IF EXISTS customer_invoices_acomptes_idx;
--   ALTER TABLE customer_invoices
--     DROP CONSTRAINT IF EXISTS customer_invoices_acompte_chk,
--     DROP CONSTRAINT IF EXISTS customer_invoices_type_chk,
--     DROP COLUMN IF EXISTS acomptes_deduits,
--     DROP COLUMN IF EXISTS acompte_valeur,
--     DROP COLUMN IF EXISTS acompte_base,
--     DROP COLUMN IF EXISTS type;
