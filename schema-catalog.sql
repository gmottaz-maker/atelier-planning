-- Catalogue de produits : articles (matériaux, km, achats divers…) et heures
-- (montage, démontage, facturation…), réutilisables dans les offres/factures.
CREATE TABLE IF NOT EXISTS catalog_items (
  id             BIGSERIAL PRIMARY KEY,
  type           TEXT NOT NULL DEFAULT 'article',   -- 'article' | 'heure'
  name           TEXT NOT NULL,
  unit           TEXT,                              -- unité : heure(s), km, m², pce…
  vat_rate       NUMERIC,                           -- TVA %
  purchase_price NUMERIC,                           -- prix d'achat (coût)
  margin         NUMERIC,                           -- marge spécifique %
  sale_price     NUMERIC,                           -- prix de vente / tarif
  vendor         TEXT,                              -- vendeur / fournisseur
  notes          TEXT,                              -- infos diverses
  archived       BOOLEAN DEFAULT false,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS catalog_items_type_idx ON catalog_items(type);
CREATE INDEX IF NOT EXISTS catalog_items_name_idx ON catalog_items(name);

-- Accès via routes API service-role uniquement (comme contacts).
ALTER TABLE catalog_items ENABLE ROW LEVEL SECURITY;
