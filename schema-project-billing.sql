-- Destinataire de facturation d'un projet (offre + facture) : contact choisi
-- dans la base contacts + adresse postale composée (société, personne, adresse).
ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_address    TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_contact_id BIGINT;
