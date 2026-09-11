-- ═══════════════════════════════════════════════════════════════════════════
-- Heures imputées : numéro de projet, activités, et la ligne d'heure
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Une heure imputée dit QUI, QUEL JOUR, DE QUAND À QUAND, SUR QUEL PROJET (ou
-- aucun) et POUR QUELLE ACTIVITÉ. La feuille imprimée, le scan, la rentabilité
-- par projet et l'export vers l'outil financier se construisent tous sur cette
-- ligne-là.
--
-- Rien à voir avec `work_entries`, qui garde les heures de PRÉSENCE (arrivée,
-- départ, pause). Présence et imputation répondent à deux questions : « étais-je
-- à l'atelier ? » et « sur quoi ai-je travaillé ? ». Les confronter servira plus
-- tard à repérer une journée à moitié imputée.

-- ── 1. Numéro de projet ────────────────────────────────────────────────────
-- Distinct de `projects.reference`, qui est la référence du CLIENT (son numéro
-- de commande, imprimé sur l'offre).
--
-- Il démarre à 100 : un projet a toujours trois chiffres, une activité un ou
-- deux. Sur une feuille manuscrite, une colonne projet et une colonne activité
-- inversées ne passent donc pas inaperçues.
--
-- Une SÉQUENCE plutôt qu'un calcul max + 1 : deux projets créés en même temps
-- ne peuvent pas recevoir le même numéro. La valeur par défaut de la colonne
-- l'attribue à chaque création, sans que le code ait à y penser.
CREATE SEQUENCE IF NOT EXISTS project_numero_seq START 100 MINVALUE 100;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS numero INTEGER;

-- Les projets existants sont numérotés dans leur ordre de création. Rejouable :
-- seuls ceux qui n'ont pas encore de numéro en reçoivent un.
WITH ordre AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS rang
    FROM projects WHERE numero IS NULL
)
UPDATE projects p
   SET numero = (SELECT COALESCE(MAX(numero), 99) FROM projects) + ordre.rang
  FROM ordre
 WHERE p.id = ordre.id;

SELECT setval('project_numero_seq', GREATEST((SELECT MAX(numero) FROM projects), 99));
ALTER TABLE projects ALTER COLUMN numero SET DEFAULT nextval('project_numero_seq');
ALTER TABLE projects ALTER COLUMN numero SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS projects_numero_unique ON projects(numero);

-- ── 2. Activités ───────────────────────────────────────────────────────────
-- Le CODE est la clé et ne change jamais : une feuille scannée en 2026 doit
-- vouloir dire la même chose en 2028. Une activité qui ne sert plus se
-- désactive (`actif`), elle ne se supprime pas et son code n'est pas repris.
CREATE TABLE IF NOT EXISTS activites (
  code       SMALLINT PRIMARY KEY CHECK (code BETWEEN 1 AND 99),
  libelle    TEXT NOT NULL CHECK (length(trim(libelle)) > 0),
  famille    TEXT NOT NULL CHECK (famille IN ('atelier', 'finitions', 'logistique', 'chantier', 'gestion', 'interne')),
  actif      BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Liste de départ. Les codes ont été renumérotés par dizaines de famille le
-- 11 septembre 2026 : voir schema-activites-renumerotation.sql.
INSERT INTO activites (code, libelle, famille) VALUES
  (1,  'Dessin / fichiers CNC',   'atelier'),
  (2,  'CNC',                     'atelier'),
  (3,  'Découpe laser',           'atelier'),
  (4,  'Débit / découpe',         'atelier'),
  (5,  'Assemblage',              'atelier'),
  (6,  'Soudure',                 'atelier'),
  (7,  'Ponçage / préparation',   'finitions'),
  (8,  'Peinture / vernis',       'finitions'),
  (9,  'Électricité / LED',       'finitions'),
  (10, 'Emballage / chargement',  'logistique'),
  (11, 'Conduite',                'logistique'),
  (12, 'Transport / manutention', 'logistique'),
  (13, 'Montage sur place',       'chantier'),
  (14, 'Démontage',               'chantier'),
  (15, 'Gestion de projet',       'gestion'),
  (20, 'Entretien / rangement',   'interne'),
  (21, 'Administratif',           'interne'),
  (22, 'Formation',               'interne')
ON CONFLICT (code) DO NOTHING;

-- ── 3. La ligne d'heure ────────────────────────────────────────────────────
-- `minutes` est CALCULÉE par la base : elle ne peut pas contredire les
-- horaires. `fin > debut` interdit les durées nulles ou négatives ; une nuit
-- à cheval sur minuit se saisit en deux lignes.
--
-- `project_id` est facultatif : l'entretien, l'administratif ou la formation
-- n'appartiennent à aucun projet, et ces heures doivent quand même sortir à
-- l'export. À la suppression d'un projet, ses heures restent (SET NULL) — ce
-- sont des données de rentabilité de l'entreprise, pas seulement du projet.
CREATE TABLE IF NOT EXISTS heures (
  id          BIGSERIAL PRIMARY KEY,
  user_name   TEXT NOT NULL,
  date        DATE NOT NULL,
  debut       TIME NOT NULL,
  fin         TIME NOT NULL,
  minutes     INTEGER GENERATED ALWAYS AS ((EXTRACT(EPOCH FROM (fin - debut)) / 60)::INTEGER) STORED,
  project_id  UUID REFERENCES projects(id) ON DELETE SET NULL,
  activite    SMALLINT NOT NULL REFERENCES activites(code),
  note        TEXT,
  source      TEXT NOT NULL DEFAULT 'saisie' CHECK (source IN ('saisie', 'scan')),
  created_by  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT heures_fin_apres_debut CHECK (fin > debut)
);

CREATE INDEX IF NOT EXISTS heures_jour_idx   ON heures(date, user_name);
CREATE INDEX IF NOT EXISTS heures_projet_idx ON heures(project_id) WHERE project_id IS NOT NULL;

-- Accès par les routes API en service-role uniquement, comme le reste.
ALTER TABLE activites ENABLE ROW LEVEL SECURITY;
ALTER TABLE heures    ENABLE ROW LEVEL SECURITY;

-- ── Vérifications à lire après exécution ───────────────────────────────────
--   SELECT numero, name, client FROM projects ORDER BY numero;
--   SELECT code, libelle, famille FROM activites ORDER BY code;

-- ── Rollback ───────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS heures;
-- DROP TABLE IF EXISTS activites;
-- DROP INDEX IF EXISTS projects_numero_unique;
-- ALTER TABLE projects DROP COLUMN IF EXISTS numero;
-- DROP SEQUENCE IF EXISTS project_numero_seq;
