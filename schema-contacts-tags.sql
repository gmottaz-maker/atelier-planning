-- Ajoute les colonnes tags + website à la table contacts existante (idempotent).
-- À exécuter dans le SQL Editor Supabase si la table a déjà été créée sans ces colonnes.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS tags    TEXT[] DEFAULT '{}';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS website TEXT;
CREATE INDEX IF NOT EXISTS contacts_tags_idx ON contacts USING GIN (tags);
