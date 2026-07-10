-- Base contacts (clients + fournisseurs) — sociétés & personnes
CREATE TABLE IF NOT EXISTS contacts (
  id          BIGSERIAL PRIMARY KEY,
  kind        TEXT NOT NULL DEFAULT 'person',      -- 'company' | 'person'
  name        TEXT NOT NULL,
  parent_id   BIGINT REFERENCES contacts(id) ON DELETE SET NULL,
  is_customer BOOLEAN DEFAULT false,               -- je lui vends
  is_supplier BOOLEAN DEFAULT false,               -- j'achète chez lui
  email       TEXT,
  phone       TEXT,
  street      TEXT,
  city        TEXT,
  state       TEXT,
  country     TEXT,
  vat_number  TEXT,
  website     TEXT,
  tags        TEXT[] DEFAULT '{}',                 -- catégories libres (assurance, fiduciaire, matériel…)
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS contacts_parent_idx ON contacts(parent_id);
CREATE INDEX IF NOT EXISTS contacts_kind_idx   ON contacts(kind);
CREATE INDEX IF NOT EXISTS contacts_tags_idx   ON contacts USING GIN (tags);
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;  -- accès via routes API service-role uniquement
