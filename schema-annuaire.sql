-- ═══════════════════════════════════════════════════════════════════════════
-- Annuaire — qui fait quoi, et où l'on commande
-- ═══════════════════════════════════════════════════════════════════════════
--
-- « Le thermolaquage, on le fait faire chez qui, déjà ? » Cette question se
-- pose deux fois par an, se répond en fouillant d'anciennes factures ou en
-- demandant à Arnaud, et la réponse repart avec celui qui la connaît.
--
-- BASE SÉPARÉE DE `contacts`, et non un drapeau dessus — même arbitrage que
-- pour les prospects. Les 113 contacts marqués « fournisseur » sont des
-- contreparties COMPTABLES : l'AVS, la fiduciaire, l'ECA, un transporteur, une
-- agence d'intérim. Ce qu'on veut savoir ici — qui travaille bien, quelle
-- technique, où commander telle pièce — n'a rien à voir, et l'annuaire serait
-- noyé dans une liste qu'on ne choisit pas. Inversement, un annuaire n'a ni
-- numéro de TVA, ni adresse de facturation, ni facture.
--
-- Une entrée peut n'être qu'un SITE INTERNET : c'est le cas le plus fréquent
-- pour une pièce qu'on recommande deux fois par an. Seul le nom est exigé.

CREATE TABLE IF NOT EXISTS annuaire_categories (
  id         BIGSERIAL PRIMARY KEY,
  nom        TEXT NOT NULL CHECK (length(trim(nom)) > 0),

  -- Auto-référence, comme les catégories du catalogue : le schéma n'impose
  -- aucune profondeur, l'écran en montre deux. CASCADE — supprimer « CNC »
  -- emporte « fraises » ; l'écran annonce le décompte avant de l'exécuter.
  parent_id  BIGINT REFERENCES annuaire_categories(id) ON DELETE CASCADE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS annuaire_categories_parent_idx ON annuaire_categories(parent_id);

CREATE TABLE IF NOT EXISTS annuaire (
  id          BIGSERIAL PRIMARY KEY,
  nom         TEXT NOT NULL CHECK (length(trim(nom)) > 0),
  -- Ce qu'ils font, en une ligne : « thermolaquage sur acier et alu »,
  -- « fraises et outils CNC ». C'est ce qu'on lit en premier, et ce qu'on
  -- cherche quand on ne se souvient pas du nom.
  quoi        TEXT,
  site        TEXT,
  email       TEXT,
  telephone   TEXT,
  contact_nom TEXT,
  adresse     TEXT,
  ville       TEXT,
  -- Le détail qui ne tient pas sur une ligne : délais, minimum de commande,
  -- ce qu'ils ratent, le nom du gars à l'atelier.
  notes       TEXT,
  archived    BOOLEAN NOT NULL DEFAULT false,
  created_by  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Plusieurs catégories par entrée : un tôlier qui fait aussi le thermolaquage
-- se range sous les deux, et se retrouve depuis l'une comme depuis l'autre.
CREATE TABLE IF NOT EXISTS annuaire_liens (
  entree_id    BIGINT NOT NULL REFERENCES annuaire(id) ON DELETE CASCADE,
  categorie_id BIGINT NOT NULL REFERENCES annuaire_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (entree_id, categorie_id)
);
CREATE INDEX IF NOT EXISTS annuaire_liens_categorie_idx ON annuaire_liens(categorie_id);

ALTER TABLE annuaire            ENABLE ROW LEVEL SECURITY;
ALTER TABLE annuaire_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE annuaire_liens      ENABLE ROW LEVEL SECURITY;

-- Depuis le 30 octobre 2026, Supabase n'ouvre plus l'API de données aux tables
-- nouvelles sans GRANT explicite : sans ces lignes, un rejeu du schéma depuis
-- zéro rendrait ces tables injoignables, même en service-role. Rien pour
-- `anon` ni `authenticated` : tout passe par les routes API.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.annuaire            TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.annuaire_categories TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.annuaire_liens      TO service_role;
GRANT USAGE, SELECT ON SEQUENCE annuaire_id_seq            TO service_role;
GRANT USAGE, SELECT ON SEQUENCE annuaire_categories_id_seq TO service_role;

-- ── Arborescence de départ ─────────────────────────────────────────────────
-- Posée UNE FOIS, et seulement si la table est vide : elle donne la forme
-- (par technique, jamais par région) sans prétendre être complète. Tout se
-- renomme, se supprime et se complète depuis l'écran.
INSERT INTO annuaire_categories (nom, parent_id)
SELECT * FROM (VALUES ('Sous-traitance', NULL::BIGINT), ('Atelier et achats', NULL::BIGINT)) AS v(nom, parent_id)
WHERE NOT EXISTS (SELECT 1 FROM annuaire_categories);

INSERT INTO annuaire_categories (nom, parent_id)
SELECT v.nom, (SELECT id FROM annuaire_categories WHERE nom = v.parent AND parent_id IS NULL)
FROM (VALUES
  ('Tôlerie et découpe métal', 'Sous-traitance'),
  ('Thermolaquage',            'Sous-traitance'),
  ('Impression et signalétique', 'Sous-traitance'),
  ('Sols et moquette',         'Sous-traitance'),
  ('CNC',                      'Atelier et achats'),
  ('Traitement de l''air',     'Atelier et achats'),
  ('Abrasifs et consommables', 'Atelier et achats'),
  ('Affûtage et outillage',    'Atelier et achats')
) AS v(nom, parent)
WHERE NOT EXISTS (SELECT 1 FROM annuaire_categories WHERE parent_id IS NOT NULL);

-- ── Rollback ───────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS annuaire_liens;
-- DROP TABLE IF EXISTS annuaire;
-- DROP TABLE IF EXISTS annuaire_categories;
