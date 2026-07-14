-- NPA / code postal des contacts (pour composer l'adresse postale).
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS zip TEXT;
