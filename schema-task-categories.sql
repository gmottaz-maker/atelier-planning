-- Stockage des champs spécifiques par catégorie de tâche
-- (Commande: articles, quantité, vendeur, dates, réception)
-- (Sous-traitance: sous-traitant, dépose, récup prévue, prêt, à l'atelier)
-- À exécuter dans Supabase → SQL Editor

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS category_data JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks (category);
