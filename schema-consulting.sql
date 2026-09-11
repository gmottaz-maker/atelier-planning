-- ═══════════════════════════════════════════════════════════════════════════
-- Consulting : une heure peut viser un CLIENT plutôt qu'un projet
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Le temps passé à conseiller un client hors de tout projet ne se facture pas
-- directement. On le note contre le client ; il s'accumule en un solde, qu'on
-- compense ensuite dans une offre par une ligne masquée (lib/consulting.js).
--
-- Rattaché à la FICHE du client (contacts), pas à son nom écrit : 19 projets
-- sur 48 n'avaient qu'un nom en texte, avec « Telmont » et « TelmonT » pour la
-- même maison. Un nom ne se rapproche pas de façon fiable ; une fiche, oui.
--
-- Une heure va à un projet OU à un client, jamais aux deux : une heure de
-- projet appartient déjà au client du projet.
ALTER TABLE heures ADD COLUMN IF NOT EXISTS contact_id BIGINT REFERENCES contacts(id) ON DELETE SET NULL;

ALTER TABLE heures DROP CONSTRAINT IF EXISTS heures_projet_ou_client;
ALTER TABLE heures ADD CONSTRAINT heures_projet_ou_client CHECK (project_id IS NULL OR contact_id IS NULL);

CREATE INDEX IF NOT EXISTS heures_contact_idx ON heures(contact_id) WHERE contact_id IS NOT NULL;

-- ── Rollback ───────────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS heures_contact_idx;
-- ALTER TABLE heures DROP CONSTRAINT IF EXISTS heures_projet_ou_client;
-- ALTER TABLE heures DROP COLUMN IF EXISTS contact_id;
