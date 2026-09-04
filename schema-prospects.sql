-- ═══════════════════════════════════════════════════════════════════════════
-- Prospection commerciale — base SÉPARÉE des contacts clients
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Un prospect n'est pas un contact : on ne lui facture rien, on ne lui livre
-- rien, et ce qu'on veut savoir de lui n'a rien à voir. D'où deux tables plutôt
-- qu'un drapeau sur `contacts` — un drapeau aurait traîné ses colonnes de
-- facturation vides dans tous les écrans de démarchage, et inversement.
--
-- Le cycle s'arrête à la conversion : le prospect devient une société dans
-- `contacts`, ses personnes deviennent ses contacts, et son journal le suit.
-- La ligne de prospect n'est PAS supprimée — elle porte `converted_to_contact_id`
-- et sort des listes. C'est ce qui garde l'historique du démarchage : comment
-- ce client est arrivé, par quel canal, en combien de relances. Le jeter au
-- moment précis où il devient intéressant serait dommage.

-- ── Le prospect : une société qu'on démarche ───────────────────────────────
CREATE TABLE IF NOT EXISTS prospects (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  city          TEXT,
  street        TEXT,
  zip           TEXT,
  country       TEXT,
  website       TEXT,
  phone         TEXT,
  sector        TEXT,                       -- secteur d'activité, libre

  -- Étape du cycle. Contrainte volontaire : une liste fermée garde la liste
  -- des prospects exacte, là où un tag libre laisserait « Prospect » et
  -- « Client » coexister sur la même fiche.
  stage         TEXT NOT NULL DEFAULT 'a_contacter'
                CHECK (stage IN ('a_contacter','contacte','presentation','discussion','perdu')),

  -- D'où il vient. `source_detail` porte le « par qui » d'une recommandation,
  -- le nom du salon, la requête qui a mené au site.
  source        TEXT CHECK (source IN ('internet','linkedin','recommandation','appel_entrant','salon','client_existant','autre')),
  source_detail TEXT,

  owner         TEXT,                       -- qui suit ce prospect
  lost_reason   TEXT,                       -- pourquoi on l'a perdu
  notes         TEXT,

  converted_to_contact_id BIGINT REFERENCES contacts(id) ON DELETE SET NULL,
  converted_at  TIMESTAMPTZ,

  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS prospects_stage_idx     ON prospects(stage);
CREATE INDEX IF NOT EXISTS prospects_converted_idx ON prospects(converted_to_contact_id);

-- ── Les personnes d'un prospect ────────────────────────────────────────────
-- Volontairement PAS `contacts` : tant qu'on démarche, ces personnes n'ont ni
-- rôle de facturation ni société cliente. Elles y basculent à la conversion.
CREATE TABLE IF NOT EXISTS prospect_people (
  id          BIGSERIAL PRIMARY KEY,
  prospect_id BIGINT NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  role        TEXT,
  email       TEXT,
  phone       TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS prospect_people_prospect_idx ON prospect_people(prospect_id);

-- ── Le journal des échanges ────────────────────────────────────────────────
-- C'est la table qui portait tout le manque : sans elle, aucune trace de ce
-- qu'on a dit, quand, ni par quel canal.
--
-- La relance vit ICI et non sur le prospect : « appelé le 3, je rappelle le
-- 17 ». La prochaine relance d'un prospect est la plus proche non traitée. Un
-- champ posé sur la fiche est un champ qu'on oublie de mettre à jour ; une
-- ligne de journal, non — et elle garde la trace des relances déjà faites.
CREATE TABLE IF NOT EXISTS prospect_interactions (
  id              BIGSERIAL PRIMARY KEY,
  prospect_id     BIGINT NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  person_id       BIGINT REFERENCES prospect_people(id) ON DELETE SET NULL,

  occurred_on     DATE NOT NULL DEFAULT CURRENT_DATE,
  channel         TEXT NOT NULL
                  CHECK (channel IN ('telephone','email','linkedin','whatsapp','visite','courrier','autre')),
  direction       TEXT NOT NULL DEFAULT 'sortant' CHECK (direction IN ('sortant','entrant')),
  notes           TEXT,
  author          TEXT,

  follow_up_on    DATE,                     -- relance prévue
  follow_up_done  BOOLEAN DEFAULT false,    -- relance honorée (une autre ligne l'a suivie)

  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS prospect_interactions_prospect_idx ON prospect_interactions(prospect_id, occurred_on DESC);
-- Index partiel : les relances en attente sont ce qu'on interroge à chaque
-- ouverture de la liste, et elles sont une petite minorité des lignes.
CREATE INDEX IF NOT EXISTS prospect_interactions_relance_idx
  ON prospect_interactions(follow_up_on)
  WHERE follow_up_on IS NOT NULL AND follow_up_done IS NOT TRUE;

-- Accès par les routes API en service-role uniquement, comme contacts.
ALTER TABLE prospects             ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospect_people       ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospect_interactions ENABLE ROW LEVEL SECURITY;

-- ── Rollback ───────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS prospect_interactions;
-- DROP TABLE IF EXISTS prospect_people;
-- DROP TABLE IF EXISTS prospects;
