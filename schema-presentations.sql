-- ═══════════════════════════════════════════════════════════════════════════
-- Présentations client — le support envoyé avec l'offre
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Avant, chaque présentation se construisait à la main dans Claude Design : on
-- dupliquait un gabarit, on expliquait le projet, on téléversait les visuels,
-- puis on exportait un PDF qui ne revenait jamais dans le dossier du projet.
-- Le récit et les codes graphiques vivent désormais dans le dépôt
-- (lib/deck.js, lib/deckHtml.js) ; cette table garde le CONTENU d'une offre.
--
-- Un projet peut en avoir plusieurs : une v2 après un changement d'avis du
-- client n'écrase pas ce qui a déjà été envoyé. C'est la raison d'être de
-- `envoyee_le` — une présentation envoyée est une pièce du dossier, pas un
-- brouillon qu'on retouche.
--
-- `contenu` est le deck entier en JSON, exactement la forme que lib/deck.js
-- sait dérouler. Le stocker d'un bloc plutôt qu'en colonnes est assumé : la
-- structure du gabarit évoluera, et aucune de ses valeurs ne se requête.
CREATE TABLE IF NOT EXISTS presentations (
  id          BIGSERIAL PRIMARY KEY,
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  titre       TEXT,
  contenu     JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Le PDF déposé dans le dossier kDrive du projet, s'il l'a été.
  kdrive_id   TEXT,
  kdrive_nom  TEXT,
  envoyee_le  TIMESTAMPTZ,
  created_by  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS presentations_projet_idx ON presentations(project_id);

-- Une présentation reprend le budget de l'offre : mêmes lecteurs que l'offre,
-- par les routes API en service-role.
ALTER TABLE presentations ENABLE ROW LEVEL SECURITY;

-- Voir CLAUDE.md, « Migrations SQL » : depuis le 30 octobre 2026, une table
-- nouvelle n'est jointe par l'API de données que si elle porte ses GRANTs.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.presentations TO service_role;
GRANT USAGE, SELECT ON SEQUENCE presentations_id_seq TO service_role;

-- Ce qu'on a raconté du projet, et les visuels déposés.
--
-- Les consignes sont gardées parce qu'on y revient : une correction demandée
-- trois jours plus tard part du même récit, pas d'une page blanche. Les
-- fichiers vivent sur kDrive ; on ne garde ici que leur nom et leur
-- identifiant — c'est le NOM qui permet au modèle de les rattacher aux pièces.
ALTER TABLE presentations ADD COLUMN IF NOT EXISTS consignes TEXT;
ALTER TABLE presentations ADD COLUMN IF NOT EXISTS fichiers JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ── Rollback ───────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS presentations;
