-- Phase de travail d'un projet (en_cours / demontage / termine).
-- Vide = « En préparation ». Une phase définie neutralise le « en retard ».
ALTER TABLE projects ADD COLUMN IF NOT EXISTS phase TEXT;
