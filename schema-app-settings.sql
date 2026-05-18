-- Paramètres applicatifs génériques (clé/valeur JSONB)
-- À exécuter dans Supabase → SQL Editor

CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acces public app_settings" ON app_settings FOR ALL USING (true);

-- Valeur par défaut pour la liste des responsables de projet
INSERT INTO app_settings (key, value)
VALUES ('responsibles', '["Arnaud", "Guillaume", "Gabin", "non défini"]'::jsonb)
ON CONFLICT (key) DO NOTHING;
