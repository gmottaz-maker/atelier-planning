-- ─── Intégrité financière ───────────────────────────────────────────────────
--
-- Trois problèmes, tous liés à des opérations multi-tables ou concurrentes :
--
--  1. Le rapprochement bancaire faisait DEUX UPDATE successifs (transaction,
--     puis facture). Si le second échouait, l'erreur était seulement écrite
--     dans les logs : la transaction restait marquée rapprochée et la facture
--     impayée. Rien ne signalait l'incohérence.
--  2. Les numéros de facture venaient d'un SELECT max + 1 côté application.
--     Deux créations simultanées lisent le même maximum et produisent le même
--     numéro.
--  3. La génération des factures de stockage se protégeait des doublons avec
--     `object + client_name` lus juste avant l'insertion. Deux déclenchements
--     concurrents du cron passent tous deux la vérification.
--
-- Idempotent : peut être rejoué. À exécuter AVANT de déployer le code — celui-ci
-- retombe sur l'ancien comportement si ces objets sont absents, mais en le
-- signalant dans les logs.
--
-- ROLLBACK : voir la fin du fichier.

-- ⚠ À EXÉCUTER D'ABORD — les index uniques échouent si des doublons existent
-- déjà. Les deux requêtes doivent renvoyer ZÉRO ligne ; sinon corriger les
-- données avant de rejouer ce script.
--
--   -- doublons de rapprochement (deux transactions sur la même facture)
--   SELECT matched_to_type, matched_to_id, count(*) FROM bank_transactions
--    WHERE matched_to_type IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1;
--
--   -- doublons de facture de stockage (même trimestre, même client)
--   SELECT object, client_name, count(*) FROM customer_invoices
--    WHERE object LIKE 'Stockage%' GROUP BY 1,2 HAVING count(*) > 1;

-- ── 1. Rapprochement atomique ───────────────────────────────────────────────

-- Une facture ne peut être payée que par une seule transaction. L'index est
-- partiel : les transactions non rapprochées ont matched_to_id NULL.
CREATE UNIQUE INDEX IF NOT EXISTS bank_tx_match_unique
  ON bank_transactions (matched_to_type, matched_to_id)
  WHERE matched_to_type IS NOT NULL AND matched_to_id IS NOT NULL;

CREATE OR REPLACE FUNCTION reconcile_match(
  p_tx_id        BIGINT,
  p_type         TEXT,
  p_candidate_id BIGINT,
  p_paid_at      DATE,
  p_matched_by   TEXT,
  p_score        NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_deja   TEXT;
  v_table  TEXT;
  v_lignes INT;
BEGIN
  -- Verrouille la transaction : deux imports concurrents ne peuvent pas
  -- rapprocher la même ligne.
  SELECT matched_to_type INTO v_deja
    FROM bank_transactions WHERE id = p_tx_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'transaction_absente');
  END IF;
  IF v_deja IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'deja_rapprochee');
  END IF;

  v_table := CASE p_type
    WHEN 'supplier_invoice' THEN 'supplier_invoices'
    WHEN 'customer_invoice' THEN 'customer_invoices'
    ELSE NULL
  END;

  -- Solde d'abord la facture : si elle est déjà payée par une autre
  -- transaction, on sort AVANT de toucher à la transaction bancaire.
  IF v_table IS NOT NULL THEN
    EXECUTE format(
      'UPDATE %I SET status = ''paid'', paid_transaction_id = $1, paid_at = $2
         WHERE id = $3 AND status <> ''paid''', v_table)
      USING p_tx_id, p_paid_at, p_candidate_id;
    GET DIAGNOSTICS v_lignes = ROW_COUNT;
    IF v_lignes = 0 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'facture_absente_ou_deja_payee');
    END IF;
  END IF;

  UPDATE bank_transactions SET
    matched_to_type  = p_type,
    matched_to_id    = p_candidate_id,
    matched_at       = NOW(),
    matched_by       = p_matched_by,
    match_confidence = p_score
  WHERE id = p_tx_id;

  -- Les deux écritures sont dans la même transaction : une erreur ici annule
  -- aussi le passage au statut payé.
  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION reconcile_match(BIGINT, TEXT, BIGINT, DATE, TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;

-- ── 2. Numérotation des factures ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invoice_counters (
  year INT PRIMARY KEY,
  seq  INT NOT NULL DEFAULT 0
);

-- Amorce depuis l'existant : sans ça le premier appel renverrait 001 et
-- entrerait en collision avec les factures déjà émises.
INSERT INTO invoice_counters (year, seq)
SELECT split_part(invoice_number, '-', 1)::INT,
       MAX(NULLIF(split_part(invoice_number, '-', 2), '')::INT)
  FROM customer_invoices
 WHERE invoice_number ~ '^\d{4}-\d+$'
 GROUP BY 1
    ON CONFLICT (year) DO UPDATE SET seq = GREATEST(invoice_counters.seq, EXCLUDED.seq);

-- (customer_invoices.invoice_number est déjà UNIQUE dans schema-banking.sql :
--  la contrainte transforme une collision en erreur plutôt qu'en doublon.)

-- Incrément atomique : l'UPDATE de l'upsert verrouille la ligne de l'année, les
-- appels concurrents s'y sérialisent.
CREATE OR REPLACE FUNCTION next_invoice_number(p_year INT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE v_seq INT;
BEGIN
  INSERT INTO invoice_counters (year, seq) VALUES (p_year, 1)
    ON CONFLICT (year) DO UPDATE SET seq = invoice_counters.seq + 1
    RETURNING seq INTO v_seq;
  RETURN p_year || '-' || lpad(v_seq::TEXT, 3, '0');
END $$;

REVOKE ALL ON FUNCTION next_invoice_number(INT) FROM PUBLIC, anon, authenticated;
ALTER TABLE invoice_counters ENABLE ROW LEVEL SECURITY;

-- ── 3. Idempotence des factures de stockage ─────────────────────────────────

ALTER TABLE customer_invoices
  ADD COLUMN IF NOT EXISTS storage_billing_key TEXT;

-- Renseigne la clé des factures de stockage déjà émises, déduite de leur objet
-- (« Stockage — T2 2026 ») et du client.
UPDATE customer_invoices
   SET storage_billing_key = regexp_replace(object, '^Stockage — T(\d) (\d{4})$', '\2-Q\1') || '-' || client_name
 WHERE storage_billing_key IS NULL
   AND object ~ '^Stockage — T\d \d{4}$';

CREATE UNIQUE INDEX IF NOT EXISTS customer_invoices_storage_key_unique
  ON customer_invoices (storage_billing_key)
  WHERE storage_billing_key IS NOT NULL;

-- Vérifications à lire après exécution :
--   SELECT year, seq FROM invoice_counters ORDER BY year;
--   SELECT storage_billing_key, client_name FROM customer_invoices
--    WHERE storage_billing_key IS NOT NULL ORDER BY 1;
--
-- ROLLBACK :
--   DROP FUNCTION IF EXISTS reconcile_match(BIGINT, TEXT, BIGINT, DATE, TEXT, NUMERIC);
--   DROP FUNCTION IF EXISTS next_invoice_number(INT);
--   DROP INDEX IF EXISTS bank_tx_match_unique;
--   DROP INDEX IF EXISTS customer_invoices_storage_key_unique;
--   DROP TABLE IF EXISTS invoice_counters;
--   ALTER TABLE customer_invoices DROP COLUMN IF EXISTS storage_billing_key;
