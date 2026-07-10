-- Ajoute le flag d'archivage aux contacts (idempotent).
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS contacts_archived_idx ON contacts(archived);
