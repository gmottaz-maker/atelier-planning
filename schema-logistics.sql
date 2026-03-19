-- Migration : champs logistiques sur les projets
-- À exécuter dans Supabase → SQL Editor

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS logistics_address TEXT,
  ADD COLUMN IF NOT EXISTS logistics_time TEXT,
  ADD COLUMN IF NOT EXISTS logistics_contact TEXT,
  ADD COLUMN IF NOT EXISTS logistics_notes TEXT;
