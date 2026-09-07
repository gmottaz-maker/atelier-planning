-- ═══════════════════════════════════════════════════════════════════════════
-- Catalogue : catégories et sous-catégories
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Une TABLE plutôt que deux colonnes texte sur `catalog_items`. Le texte libre
-- paraît plus simple, mais dans six mois il y aurait « Bois », « bois » et
-- « Bois » avec une espace, et renommer voudrait dire toucher trois cents
-- lignes. Ici, renommer est une ligne, et la faute de frappe est impossible
-- puisqu'on choisit dans une liste.
--
-- Jouée alors que le catalogue ne contenait que deux articles : aucune reprise
-- de données, et la structure précède le remplissage plutôt que de le subir.

CREATE TABLE IF NOT EXISTS catalog_categories (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL,

  -- Auto-référence : le schéma n'impose AUCUNE profondeur, l'interface en
  -- montre deux. Si un troisième niveau devient nécessaire, c'est de
  -- l'affichage, pas une migration.
  --
  -- CASCADE : supprimer une catégorie emporte ses sous-catégories. C'est le
  -- comportement demandé, et l'interface annonce le décompte exact avant de
  -- l'exécuter — rien ne restaure ces lignes.
  parent_id  BIGINT REFERENCES catalog_categories(id) ON DELETE CASCADE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS catalog_categories_parent_idx ON catalog_categories(parent_id);

-- Deux catégories sœurs ne peuvent pas porter le même nom. L'index est partiel
-- parce que NULL n'est jamais égal à NULL en SQL : sans le second index, deux
-- catégories racines homonymes passeraient.
CREATE UNIQUE INDEX IF NOT EXISTS catalog_categories_unique_enfant
  ON catalog_categories (parent_id, lower(name)) WHERE parent_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS catalog_categories_unique_racine
  ON catalog_categories (lower(name)) WHERE parent_id IS NULL;

-- ── Rattachement des articles ──────────────────────────────────────────────
--
-- CASCADE ici aussi : la suppression d'une catégorie emporte ses articles,
-- comme demandé. C'est le choix le plus destructeur des trois possibles ; le
-- garde-fou est dans l'interface, qui nomme le nombre d'articles concernés.
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS category_id BIGINT
  REFERENCES catalog_categories(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS catalog_items_category_idx ON catalog_items(category_id);

-- ── Mesure de l'usage ──────────────────────────────────────────────────────
--
-- L'ordre des catégories suit l'usage réel plutôt que l'alphabet : ce qui sert
-- tous les jours remonte. Le compteur s'incrémente quand un article est inséré
-- dans une offre depuis le sélecteur — le seul moment où « utiliser » un
-- article du catalogue veut dire quelque chose.
--
-- Tant que tout vaut 0, l'ordre retombe sur l'alphabet : le classement se
-- construit à l'usage au lieu d'exiger un réglage initial.
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS usage_count  INTEGER DEFAULT 0;
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;

-- Incrément atomique : deux insertions simultanées depuis deux onglets ne
-- doivent pas se perdre l'une l'autre, ce qu'un SELECT puis UPDATE ferait.
CREATE OR REPLACE FUNCTION catalog_item_used(p_id BIGINT)
RETURNS void LANGUAGE sql AS $$
  UPDATE catalog_items
     SET usage_count = COALESCE(usage_count, 0) + 1,
         last_used_at = NOW()
   WHERE id = p_id;
$$;

ALTER TABLE catalog_categories ENABLE ROW LEVEL SECURITY;

-- ── Rollback ───────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS catalog_item_used(BIGINT);
-- ALTER TABLE catalog_items DROP COLUMN IF EXISTS category_id,
--   DROP COLUMN IF EXISTS usage_count, DROP COLUMN IF EXISTS last_used_at;
-- DROP TABLE IF EXISTS catalog_categories;
