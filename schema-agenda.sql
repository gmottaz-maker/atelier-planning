-- ═══════════════════════════════════════════════════════════════════════════
-- Agenda — où passe le temps de l'atelier, demi-journée par demi-journée
-- ═══════════════════════════════════════════════════════════════════════════
--
-- UNE table pour tout ce qui occupe quelqu'un : production à l'atelier,
-- montage et démontage sur place, trajet, réunion, administratif, entretien.
-- Google Agenda tenait ça dans cinq calendriers séparés, sans lien avec les
-- projets ni avec les heures vendues ; c'est ce lien qui manquait, pas un
-- calendrier de plus.
--
-- ── Ce qui n'est PAS ici ───────────────────────────────────────────────────
--
-- Les ABSENCES restent dans `work_entries` : vacances, maladie, demi-journées
-- de congé. Elles disent « indisponible », pas « occupé à ceci » — et elles
-- sont déjà saisies dans `/schedule`, où chacun gère les siennes. Les jours
-- FÉRIÉS ne sont dans aucune table : ils se calculent (`lib/joursFeries.js`).
-- Les heures RÉELLEMENT faites restent dans `heures`. L'agenda dit le PRÉVU ;
-- `heures` dit le constaté. Les confronter est l'étape 5.

-- ── Les blocs ──────────────────────────────────────────────────────────────
--
-- Pas d'heure de début : une demi-journée, et c'est tout. Un atelier ne
-- commence pas une soudure à 9 h 15 parce qu'un calendrier l'a écrit, et un
-- horaire faux à la minute est un horaire qu'on cesse de lire.
--
-- Une journée entière est DEUX lignes, am et pm, et non une troisième valeur
-- `jour` : sans ça, chaque somme de demi-journées devrait traiter un cas
-- particulier, et chaque oubli de ce cas donnerait un total faux.
CREATE TABLE IF NOT EXISTS agenda (
  id          BIGSERIAL PRIMARY KEY,
  user_name   TEXT NOT NULL CHECK (length(trim(user_name)) > 0),
  date        DATE NOT NULL,
  demi        TEXT NOT NULL DEFAULT 'am' CHECK (demi IN ('am', 'pm')),

  -- Le type porte le SENS du bloc, et c'est lui qui décide de la couleur, du
  -- lieu attendu et de ce qui compte comme temps d'atelier. La liste est
  -- fermée : « montage » et « Montage ext. » dans la même colonne libre, et
  -- plus aucun filtre ne marche six mois plus tard (cf. economat_fournisseurs).
  type        TEXT NOT NULL CHECK (type IN (
                'production',   -- à l'atelier, sur un projet
                'montage',      -- sur place, chez le client
                'demontage',
                'trajet',
                'meeting',      -- visite, appel, point client
                'admin',        -- devis, factures, commandes
                'entretien',    -- machines, atelier, rangement
                'autre'
              )),

  -- Le projet est facultatif : l'administratif et l'entretien n'en ont pas.
  -- ON DELETE SET NULL plutôt que CASCADE : supprimer un projet ne doit pas
  -- faire disparaître en silence des demi-journées déjà vécues.
  project_id  UUID REFERENCES projects(id) ON DELETE SET NULL,

  -- L'activité vendue que ce bloc avance (10, 20, 40…). C'est elle qui relie
  -- le bloc aux heures de l'offre, donc à la jauge de charge : un bloc de
  -- production sans activité ne décharge rien. Clé étrangère SANS cascade,
  -- comme `heures` : la base refuse elle-même qu'on renumérote une activité
  -- utilisée.
  activite    INT REFERENCES activites(code),

  -- Durée prévue DANS la demi-journée, en minutes, par pas de 30. NULL = toute
  -- la demi-journée. C'est ce qui permet de poser « 30 min de ponçage léger »
  -- sans bloquer quatre heures : trois heures de peinture ne sont pas un bloc
  -- de trois heures, mais une demi-heure, un séchage, un ponçage, une reprise.
  minutes     INT CHECK (minutes IS NULL OR (minutes > 0 AND minutes % 30 = 0 AND minutes <= 300)),

  titre       TEXT,
  lieu        TEXT,
  note        TEXT,

  -- D'où vient le bloc : posé à la main, déduit d'un événement logistique de
  -- l'offre, ou proposé par le planificateur. Ce qui est proposé peut être
  -- replacé automatiquement ; ce qui est posé à la main, jamais sans le dire.
  source      TEXT NOT NULL DEFAULT 'main' CHECK (source IN ('main', 'offre', 'planificateur')),

  -- Figé : le planificateur ne le déplace pas, même s'il a tort. Un montage
  -- annoncé au client est une promesse, pas une préférence.
  fige        BOOLEAN NOT NULL DEFAULT false,

  created_by  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- La semaine d'une personne, et la journée de tout le monde : les deux seules
-- lectures de l'écran.
CREATE INDEX IF NOT EXISTS agenda_jour_idx    ON agenda(date, demi);
CREATE INDEX IF NOT EXISTS agenda_personne_idx ON agenda(user_name, date);
CREATE INDEX IF NOT EXISTS agenda_projet_idx   ON agenda(project_id) WHERE project_id IS NOT NULL;

-- Accès par les routes API en service-role, comme tout le reste. RLS activé
-- sans politique permissive : la clé anon ne lit rien.
ALTER TABLE agenda ENABLE ROW LEVEL SECURITY;

-- Depuis le 30 octobre 2026, une table neuve n'accorde plus rien au
-- service_role par héritage : sans ce GRANT, toutes les routes renvoient 500.
GRANT SELECT, INSERT, UPDATE, DELETE ON agenda TO service_role;
GRANT USAGE, SELECT ON SEQUENCE agenda_id_seq TO service_role;

-- ── Ce que remplace cette table ────────────────────────────────────────────
--
-- `work_slots` tenait le même rôle (une affectation par demi-journée) mais
-- sans type, sans activité, sans durée et sans lien avec les heures vendues :
-- il fallait ressaisir à la main ce que l'offre savait déjà. La table était
-- VIDE au 3 octobre 2026 — rien à reprendre.
--
-- À jouer après avoir vérifié que l'écran d'agenda tourne :
--
--   DROP TABLE IF EXISTS work_slots;
--
-- Rollback de ce fichier :
--
--   DROP TABLE IF EXISTS agenda;
