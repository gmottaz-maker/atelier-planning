-- Atelier Planning — Schéma Supabase
-- Coller ce SQL dans : Supabase → SQL Editor → New query → Run

CREATE TABLE IF NOT EXISTS projects (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name          TEXT NOT NULL,
  client        TEXT NOT NULL,
  description   TEXT,
  deadline      DATE NOT NULL,
  delivery_type TEXT DEFAULT 'Livraison',
  responsible   TEXT DEFAULT 'Arnaud',
  color_override TEXT,          -- null = auto, sinon ex: '#3b82f6'
  notes         TEXT,
  status        TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour trier par deadline rapidement
CREATE INDEX IF NOT EXISTS idx_projects_deadline ON projects (deadline);
CREATE INDEX IF NOT EXISTS idx_projects_status   ON projects (status);

-- Activer la sécurité par ligne (Row Level Security)
-- Pour un usage interne simple, on autorise tout en public (pas de auth)
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Accès public lecture" ON projects
  FOR SELECT USING (true);

CREATE POLICY "Accès public écriture" ON projects
  FOR ALL USING (true);

-- Données de test (optionnel — à supprimer en prod)
INSERT INTO projects (name, client, description, deadline, delivery_type, responsible, status)
VALUES
  ('Bar comptoir 3m', 'Hôtel Grand Lac', 'Bar en chêne massif + LED', CURRENT_DATE + 5, 'Montage sur place', 'Arnaud', 'active'),
  ('Présentoir bijoux', 'Maison Dorée', '4 colonnes acrylique rétroéclairées', CURRENT_DATE + 12, 'Livraison', 'Gabin', 'active'),
  ('Stand événement', 'Festival Lumières', 'Stand 4x3m structure alu + habillage', CURRENT_DATE + 21, 'Montage sur place', 'Arnaud & Gabin', 'active');
