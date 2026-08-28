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

-- ── 1. Les deux comptes qui manquent au plan ────────────────────────────────
-- `account_mappings.account` référence `accounts(number)` : les mappings de
-- l'étape 3 échouent si ces comptes n'existent pas. Les trois autres natures
-- utilisent des comptes déjà présents — 5000 Salaires, 6900 Charges
-- financières, 6700 Autres charges d'exploitation.
INSERT INTO accounts (number, label, kind, vat_code, sort) VALUES
  -- Entre 1020 Banque (20) et 1100 Débiteurs (30).
  ('1090', 'Compte de virement (transferts internes)', 'actif', NULL, 25),
  -- Après 6950 Produits financiers (620).
  ('8900', 'Impôts directs', 'charge', NULL, 700)
ON CONFLICT (number) DO NOTHING;

-- ── 2. La nature du mouvement ───────────────────────────────────────────────
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

-- ── 3. Comptes par défaut ───────────────────────────────────────────────────
-- Modifiables dans Compta → correspondance catégorie → compte. Point de départ
-- à confirmer avec la fiduciaire.
INSERT INTO account_mappings (scope, category, account) VALUES
  ('bank', 'salaire',           '5000'),   -- Salaires (existant)
  ('bank', 'transfert_interne', '1090'),   -- Compte de virement (créé ci-dessus)
  ('bank', 'frais_bancaires',   '6900'),   -- Charges financières (existant)
  ('bank', 'impots',            '8900'),   -- Impôts directs (créé ci-dessus)
  ('bank', 'autre',             '6700')    -- Autres charges d'exploitation (existant)
ON CONFLICT (scope, category) DO NOTHING;

-- Rollback :
--   ALTER TABLE bank_transactions DROP CONSTRAINT IF EXISTS bank_tx_piece_ou_nature;
--   ALTER TABLE bank_transactions
--     DROP COLUMN IF EXISTS classification,
--     DROP COLUMN IF EXISTS classified_at,
--     DROP COLUMN IF EXISTS classified_by;
--   DELETE FROM account_mappings WHERE scope = 'bank';
--   DELETE FROM accounts WHERE number IN ('1090', '8900');
