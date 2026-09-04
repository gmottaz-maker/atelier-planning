-- ═══════════════════════════════════════════════════════════════════════════
-- Prospection : les champs du fichier de démarchage
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Complète schema-prospects.sql avec ce que portait le classeur
-- « Amazing_Lab_Prospection_enrichie_v3.xlsx » et que la table ne savait pas
-- ranger. Idempotent, additif, sans effet sur l'existant.

-- ── Sur le prospect ────────────────────────────────────────────────────────

-- La ZONE n'est pas la ville : la moitié des lignes couvrent un pays ou une
-- région (« Suisse », « Suisse romande », « Nyon / Genève »). `city` reste pour
-- l'adresse précise, quand on l'a.
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS zone TEXT;

-- Priorité et potentiel sont les deux axes de tri du fichier : par quoi
-- commencer, et ce qu'il y a à gagner. Listes fermées, comme les étapes — un
-- « A ++ » saisi un jour de fatigue casserait le tri en silence.
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS priority  TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS potential TEXT;

DO $$ BEGIN
  ALTER TABLE prospects ADD CONSTRAINT prospects_priority_chk
    CHECK (priority IS NULL OR priority IN ('A+','A','B','C'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE prospects ADD CONSTRAINT prospects_potential_chk
    CHECK (potential IS NULL OR potential IN ('Très fort','Fort','À qualifier','Faible'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Ce qu'on va dire, et à qui. `angle` = « pourquoi Amazing Lab » pour cette
-- société ; `services` = les prestations à mettre en avant ; `target_role` = la
-- fonction à viser quand on ne connaît encore personne — c'est la colonne qui
-- transforme une liste de noms d'entreprises en liste d'appels à passer.
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS angle       TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS services    TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS target_role TEXT;

CREATE INDEX IF NOT EXISTS prospects_priority_idx ON prospects(priority);

-- ── Sur les personnes ──────────────────────────────────────────────────────

-- LinkedIn est un canal de démarchage à part entière ici, pas une curiosité :
-- pour la moitié des contacts identifiés, c'est la SEULE voie connue.
ALTER TABLE prospect_people ADD COLUMN IF NOT EXISTS linkedin TEXT;

-- « Confiance contact » du fichier. Ce n'est pas de la coquetterie : plusieurs
-- fiches disent « double check nécessaire » sur l'intitulé de poste, et
-- appeler quelqu'un en l'appelant par un titre qu'il n'a plus coûte l'entretien.
ALTER TABLE prospect_people ADD COLUMN IF NOT EXISTS confidence TEXT;

-- ── Rollback ───────────────────────────────────────────────────────────────
-- ALTER TABLE prospects DROP COLUMN IF EXISTS zone, DROP COLUMN IF EXISTS priority,
--   DROP COLUMN IF EXISTS potential, DROP COLUMN IF EXISTS angle,
--   DROP COLUMN IF EXISTS services, DROP COLUMN IF EXISTS target_role;
-- ALTER TABLE prospect_people DROP COLUMN IF EXISTS linkedin, DROP COLUMN IF EXISTS confidence;
