-- Comptabilité suisse : plan comptable PME + correspondance catégorie → compte.

-- ── Plan comptable (extrait du plan comptable général PME suisse) ──
CREATE TABLE IF NOT EXISTS accounts (
  number     TEXT PRIMARY KEY,       -- ex. '1020'
  label      TEXT NOT NULL,
  kind       TEXT NOT NULL,          -- actif | passif | produit | charge
  vat_code   TEXT,                   -- code TVA par défaut (ex. 'TVA81', 'PREAL81', null)
  sort       INTEGER,
  archived   BOOLEAN DEFAULT false
);

INSERT INTO accounts (number, label, kind, vat_code, sort) VALUES
  -- 1 Actifs
  ('1000','Caisse','actif',NULL,10),
  ('1020','Banque','actif',NULL,20),
  ('1100','Créances clients (débiteurs)','actif',NULL,30),
  ('1170','Impôt préalable TVA — matériel et prestations','actif',NULL,40),
  ('1171','Impôt préalable TVA — investissements et autres charges','actif',NULL,50),
  ('1300','Charges payées d''avance','actif',NULL,60),
  ('1500','Machines et appareils','actif',NULL,70),
  ('1520','Mobilier et installations','actif',NULL,80),
  ('1530','Véhicules','actif',NULL,90),
  -- 2 Passifs
  ('2000','Dettes fournisseurs (créanciers)','passif',NULL,100),
  ('2030','Dettes envers collaborateurs (frais à rembourser)','passif',NULL,105),
  ('2200','TVA due','passif',NULL,110),
  ('2201','Décompte TVA','passif',NULL,120),
  ('2270','Charges sociales à payer','passif',NULL,130),
  ('2300','Passifs de régularisation','passif',NULL,140),
  ('2800','Capital social','passif',NULL,150),
  -- 3 Produits
  ('3200','Ventes de prestations / fabrication','produit','TVA81',200),
  ('3400','Prestations de services (stockage)','produit','TVA81',210),
  ('3805','Pertes sur clients','produit',NULL,220),
  -- 4 Charges de matériel
  ('4000','Achats de matériel','charge','PREAL81',300),
  ('4400','Charges de sous-traitance','charge','PREAL81',310),
  ('4900','Escomptes et rabais obtenus','charge',NULL,320),
  -- 5 Charges de personnel
  ('5000','Salaires','charge',NULL,400),
  ('5700','Charges sociales','charge',NULL,410),
  ('5800','Autres charges de personnel','charge',NULL,420),
  -- 6 Autres charges d'exploitation
  ('6000','Loyer','charge',NULL,500),
  ('6100','Entretien et réparations','charge','PREAL81',510),
  ('6200','Véhicules et transports','charge','PREAL81',520),
  ('6300','Assurances','charge',NULL,530),
  ('6400','Énergie et évacuation','charge','PREAL81',540),
  ('6500','Administration et bureau','charge','PREAL81',550),
  ('6510','Téléphone et internet','charge','PREAL81',560),
  ('6570','Informatique et logiciels','charge','PREAL81',570),
  ('6600','Publicité et marketing','charge','PREAL81',580),
  ('6700','Autres charges d''exploitation','charge','PREAL81',590),
  ('6800','Amortissements','charge',NULL,600),
  ('6900','Charges financières','charge',NULL,610),
  ('6950','Produits financiers','produit',NULL,620)
ON CONFLICT (number) DO NOTHING;

-- ── Correspondance catégorie → compte ──
-- scope : 'supplier' (factures fournisseurs) | 'expense' (frais) | 'sale' (ventes)
CREATE TABLE IF NOT EXISTS account_mappings (
  id         BIGSERIAL PRIMARY KEY,
  scope      TEXT NOT NULL,
  category   TEXT NOT NULL,          -- catégorie libre de la pièce ('' = défaut du scope)
  account    TEXT NOT NULL REFERENCES accounts(number),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (scope, category)
);

-- Défauts (catégorie vide = fallback du scope)
INSERT INTO account_mappings (scope, category, account) VALUES
  ('supplier','', '4000'),
  ('expense','',  '6700'),
  ('sale','',     '3200')
ON CONFLICT (scope, category) DO NOTHING;

ALTER TABLE accounts         ENABLE ROW LEVEL SECURITY;  -- accès via routes API service-role
ALTER TABLE account_mappings ENABLE ROW LEVEL SECURITY;
