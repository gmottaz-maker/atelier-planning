-- Offre simple par projet (achats + main d'œuvre + logistique)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS quote_data JSONB;
