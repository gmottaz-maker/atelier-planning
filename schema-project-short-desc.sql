-- Description courte pour la vue Atelier (display)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS short_description TEXT;
