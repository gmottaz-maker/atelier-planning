-- Référence du projet (réf. client / commande) imprimée sur l'offre et la facture.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS reference TEXT;
