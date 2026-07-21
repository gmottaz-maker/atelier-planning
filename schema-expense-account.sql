-- Catégorie comptable des justificatifs + apprentissage commerçant → compte.
--
-- Le ticket porte un compte de charge du plan comptable (4000, 6570, …), ce qui
-- l'envoie directement dans le journal et le décompte TVA. Une table mémorise
-- l'association commerçant → compte : à chaque attribution/correction, le
-- prochain ticket du même commerçant est pré-catégorisé tout seul.

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS account TEXT REFERENCES accounts(number);

CREATE TABLE IF NOT EXISTS merchant_accounts (
  merchant_key   TEXT PRIMARY KEY,          -- nom du commerçant normalisé
  merchant_label TEXT,                       -- dernier libellé lisible vu
  account        TEXT NOT NULL REFERENCES accounts(number),
  uses           INTEGER DEFAULT 1,          -- nombre d'attributions (fiabilité)
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE merchant_accounts ENABLE ROW LEVEL SECURITY;  -- accès via routes service-role
