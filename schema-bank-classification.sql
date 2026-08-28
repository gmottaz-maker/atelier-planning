-- Classement des mouvements bancaires SANS pièce : salaires, virements
-- internes, frais bancaires, impôts.
--
-- Le rapprochement cherche une pièce en face de chaque mouvement (facture
-- fournisseur, facture émise, frais). Un salaire ou un virement entre comptes
-- n'en a aucune : ces lignes restaient indéfiniment « à matcher », et surtout
-- ne produisaient AUCUNE écriture au journal comptable.
--
-- La colonne porte la NATURE du mouvement. Le compte, lui, vit dans
-- account_mappings (scope 'bank') pour rester modifiable depuis la page Compta,
-- comme les catégories de frais et de fournisseurs.

ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS classification      TEXT,
  ADD COLUMN IF NOT EXISTS classified_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS classified_by       TEXT;

-- Une transaction est soit rapprochée à une pièce, soit classée par nature,
-- jamais les deux : la contrainte évite qu'un mouvement compte deux fois au
-- journal.
ALTER TABLE bank_transactions
  DROP CONSTRAINT IF EXISTS bank_tx_piece_ou_nature;
ALTER TABLE bank_transactions
  ADD CONSTRAINT bank_tx_piece_ou_nature
  CHECK (matched_to_type IS NULL OR classification IS NULL);

CREATE INDEX IF NOT EXISTS bank_transactions_classification_idx
  ON bank_transactions (classification) WHERE classification IS NOT NULL;

-- Comptes par défaut (plan comptable suisse PME). Modifiables dans Compta →
-- correspondance catégorie → compte ; ces lignes ne sont qu'un point de départ,
-- à confirmer avec la fiduciaire.
INSERT INTO account_mappings (scope, category, account) VALUES
  ('bank', 'salaire',           '5000'),   -- charges de personnel
  ('bank', 'transfert_interne', '1090'),   -- compte de virement
  ('bank', 'frais_bancaires',   '6940'),   -- charges financières
  ('bank', 'impots',            '8900'),   -- impôts directs
  ('bank', 'autre',             '6700')    -- autres charges d'exploitation
ON CONFLICT (scope, category) DO NOTHING;

-- Rollback :
--   ALTER TABLE bank_transactions DROP CONSTRAINT IF EXISTS bank_tx_piece_ou_nature;
--   ALTER TABLE bank_transactions
--     DROP COLUMN IF EXISTS classification,
--     DROP COLUMN IF EXISTS classified_at,
--     DROP COLUMN IF EXISTS classified_by;
--   DELETE FROM account_mappings WHERE scope = 'bank';
