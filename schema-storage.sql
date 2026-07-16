-- Stockage client : inventaire + groupes de facturation (par marque/projet).

-- Groupes de facturation : un par (client, marque/projet), avec le nombre de
-- palettes (équivalent palette, pas de 0.5). 1 palette = 1 m² = 20 CHF/mois.
CREATE TABLE IF NOT EXISTS storage_groups (
  id         BIGSERIAL PRIMARY KEY,
  client     TEXT NOT NULL,
  brand      TEXT NOT NULL,          -- marque ou projet
  pallets    NUMERIC DEFAULT 0,
  archived   BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS storage_groups_client_idx ON storage_groups(client);

-- Inventaire : articles stockés (détail, pour le suivi).
CREATE TABLE IF NOT EXISTS storage_items (
  id         BIGSERIAL PRIMARY KEY,
  client     TEXT NOT NULL,
  brand      TEXT,                   -- marque/projet
  name       TEXT NOT NULL,
  quantity   NUMERIC,
  dim_l      NUMERIC,                -- cm
  dim_w      NUMERIC,
  dim_h      NUMERIC,
  weight     NUMERIC,                -- kg
  photo_path TEXT,                   -- objet bucket storage-photos
  notes      TEXT,
  tags       TEXT[] DEFAULT '{}',
  archived   BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS storage_items_client_idx ON storage_items(client);

ALTER TABLE storage_groups ENABLE ROW LEVEL SECURITY;  -- accès via routes API service-role
ALTER TABLE storage_items  ENABLE ROW LEVEL SECURITY;
