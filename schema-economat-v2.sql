-- ═══════════════════════════════════════════════════════════════════════════
-- Économat V2 — le modèle Article / Stock, puis le workflow
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Brief V2 (kDrive : 00. Admin / Maze Project / kanban cards), §29.
-- Étape 1 : nouveaux champs, unités, modes de suivi, stock cible, seuils,
-- approvisionnement, fournisseurs, migration des données.
-- Étape 2 (plus bas) : mouvements, prise en charge, historique.
-- Le fichier se REJOUE en entier à chaque étape.
--
-- La V2 fait évoluer l'existant sans le recréer (§1, §26) : AUCUN article
-- n'est supprimé ni réinséré, les codes ECO, les jetons des QR et le journal
-- des commandes restent tels quels. Les anciennes colonnes texte (`unite`,
-- `stock_cible`, `seuil_bas`, `seuil_commander`, `quantite_commande`, `delai`,
-- `emplacement`) sont CONSERVÉES : elles servent d'aide à la saisie des
-- nouveaux champs (§26) et ne sont plus écrites par l'écran.
--
-- L'état manuel V1 (`etat`) reste en place à cette étape : le geste du QR et
-- l'écran Suivi changent à l'étape 2 et 3. Tant qu'un article n'a pas son
-- stock configuré, il continue de fonctionner comme en V1 (§26 : « les
-- articles incomplets doivent pouvoir exister temporairement »).
--
-- Suppose `schema-economat.sql` déjà joué.

-- ── Unités (§5) ────────────────────────────────────────────────────────────
-- Standardisées et administrables. Le pluriel et le genre sont stockés :
-- « 3 bobines », « 1000 pièces », et la vue rapide dira « Pleine » pour une
-- boîte et « Plein » pour un paquet (§13).
CREATE TABLE IF NOT EXISTS economat_unites (
  id         BIGSERIAL PRIMARY KEY,
  nom        TEXT NOT NULL UNIQUE CHECK (length(trim(nom)) > 0),
  pluriel    TEXT NOT NULL CHECK (length(trim(pluriel)) > 0),
  feminin    BOOLEAN NOT NULL DEFAULT false,
  archived   BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Le vocabulaire initial du brief, plus « Bouteille » que le brief emploie
-- lui-même (§4.1, §8.3 : bouteilles de gaz).
INSERT INTO economat_unites (nom, pluriel, feminin)
SELECT * FROM (VALUES
  ('Pièce',     'Pièces',     true),
  ('Paquet',    'Paquets',    false),
  ('Boîte',     'Boîtes',     true),
  ('Rouleau',   'Rouleaux',   false),
  ('Bobine',    'Bobines',    true),
  ('Tube',      'Tubes',      false),
  ('Cartouche', 'Cartouches', true),
  ('Bidon',     'Bidons',     false),
  ('Jeu',       'Jeux',       false),
  ('Kit',       'Kits',       false),
  ('Bande',     'Bandes',     true),
  ('Bouteille', 'Bouteilles', true)
) AS v(nom, pluriel, feminin)
WHERE NOT EXISTS (SELECT 1 FROM economat_unites);

-- ── Délais (§10) ───────────────────────────────────────────────────────────
-- Remplacent le couple « délai habituel » (texte) + « délai en jours »
-- (nombre) : l'utilisateur ne saisit plus deux fois la même information.
-- `jours_ouvrables` est le paramètre interne d'une FUTURE surveillance de
-- retard ; NULL = pas de surveillance (« Sur commande »).
CREATE TABLE IF NOT EXISTS economat_delais (
  id              BIGSERIAL PRIMARY KEY,
  libelle         TEXT NOT NULL UNIQUE CHECK (length(trim(libelle)) > 0),
  jours_ouvrables INTEGER CHECK (jours_ouvrables IS NULL OR jours_ouvrables BETWEEN 0 AND 365),
  ordre           INTEGER NOT NULL DEFAULT 0,
  archived        BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO economat_delais (libelle, jours_ouvrables, ordre)
SELECT * FROM (VALUES
  ('Le jour même',              0,    10),
  ('J+1 si commande avant 17h', 1,    20),
  ('2–3 jours ouvrables',       3,    30),
  ('1 semaine',                 5,    40),
  ('Sur commande',              NULL::integer, 50)
) AS v(libelle, jours_ouvrables, ordre)
WHERE NOT EXISTS (SELECT 1 FROM economat_delais);

-- ── Emplacements (§2.1) ────────────────────────────────────────────────────
-- Liste administrable plutôt que texte libre. Un article Économat n'est pas
-- forcément rangé dans la pièce Économat. Une nomenclature plus fine des
-- rayonnages viendra plus tard (« Économat A2 » peut déjà être une entrée).
CREATE TABLE IF NOT EXISTS economat_emplacements (
  id         BIGSERIAL PRIMARY KEY,
  nom        TEXT NOT NULL UNIQUE CHECK (length(trim(nom)) > 0),
  archived   BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO economat_emplacements (nom)
SELECT * FROM (VALUES
  ('Économat'), ('Atelier peinture'), ('Atelier ponçage'), ('Atelier métal'), ('Bus')
) AS v(nom)
WHERE NOT EXISTS (SELECT 1 FROM economat_emplacements);

-- ── Article : nouveaux champs ──────────────────────────────────────────────
ALTER TABLE economat_articles
  -- §3 : un article stocké a stock, seuils et carte ; une référence non.
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'stocke',
  ADD COLUMN IF NOT EXISTS sous_titre TEXT,
  ADD COLUMN IF NOT EXISTS emplacement_id BIGINT REFERENCES economat_emplacements(id) ON DELETE SET NULL,

  -- §4 : le stock. TOUTES LES QUANTITÉS SONT EN PARTS ENTIÈRES — l'unité
  -- divisée par `decoupage`. En quantité entière, decoupage = 1 et une part
  -- vaut une bobine. En quantité approximative suivie en tiers, decoupage = 3
  -- et une boîte pleine vaut 3 parts, ⅓ vaut 1 part, vide vaut 0. Personne ne
  -- saisit jamais 0,33 (§4.1) et aucune comparaison ne passe par un flottant.
  ADD COLUMN IF NOT EXISTS suivi TEXT,                 -- NULL = pas encore configuré
  ADD COLUMN IF NOT EXISTS unite_stock_id BIGINT REFERENCES economat_unites(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS decoupage SMALLINT,
  ADD COLUMN IF NOT EXISTS cible INTEGER,
  ADD COLUMN IF NOT EXISTS seuil_orange INTEGER,       -- facultatif (§6)
  ADD COLUMN IF NOT EXISTS seuil_rouge INTEGER,
  -- Le stock courant : initialisé au stock cible à la configuration (§4.2),
  -- puis donnée dynamique. Il peut dépasser la cible (achat exceptionnel).
  ADD COLUMN IF NOT EXISTS stock INTEGER,

  -- §8 : l'approvisionnement.
  ADD COLUMN IF NOT EXISTS mode_appro TEXT,
  ADD COLUMN IF NOT EXISTS quantite_cmd INTEGER,
  ADD COLUMN IF NOT EXISTS unite_cmd_id BIGINT REFERENCES economat_unites(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS delai_id BIGINT REFERENCES economat_delais(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS note_appro TEXT;

-- Les contraintes portent sur la VALEUR et la COHÉRENCE, jamais sur un
-- chemin. DROP puis ADD : le fichier peut être rejoué.
ALTER TABLE economat_articles DROP CONSTRAINT IF EXISTS economat_type_chk;
ALTER TABLE economat_articles ADD CONSTRAINT economat_type_chk
  CHECK (type IN ('stocke', 'reference'));

ALTER TABLE economat_articles DROP CONSTRAINT IF EXISTS economat_mode_appro_chk;
ALTER TABLE economat_articles ADD CONSTRAINT economat_mode_appro_chk
  CHECK (mode_appro IS NULL OR mode_appro IN ('en_ligne', 'magasin'));

ALTER TABLE economat_articles DROP CONSTRAINT IF EXISTS economat_quantite_cmd_chk;
ALTER TABLE economat_articles ADD CONSTRAINT economat_quantite_cmd_chk
  CHECK (quantite_cmd IS NULL OR quantite_cmd BETWEEN 1 AND 1000000);

-- Le bloc Stock est TOUT OU RIEN : un article est configuré (suivi posé, et
-- tout ce qu'il faut pour calculer une couleur) ou il ne l'est pas du tout.
-- Une référence n'a pas de stock.
ALTER TABLE economat_articles DROP CONSTRAINT IF EXISTS economat_stock_chk;
ALTER TABLE economat_articles ADD CONSTRAINT economat_stock_chk CHECK (
  (suivi IS NULL
    AND decoupage IS NULL AND cible IS NULL AND seuil_orange IS NULL
    AND seuil_rouge IS NULL AND stock IS NULL)
  OR (
    type = 'stocke'
    AND (suivi = 'entier' AND decoupage = 1 OR suivi = 'approx' AND decoupage IN (2, 3, 4))
    AND unite_stock_id IS NOT NULL
    AND cible IS NOT NULL AND seuil_rouge IS NOT NULL AND stock IS NOT NULL
    AND seuil_rouge >= 0 AND stock BETWEEN 0 AND 100000
    -- §6 : le seuil orange ne peut pas être sous le rouge — ni à son niveau,
    -- où il ne s'allumerait jamais.
    AND (seuil_orange IS NULL OR seuil_orange > seuil_rouge)
    -- La cible est au-dessus de tous les seuils, sinon l'article naîtrait
    -- déjà à commander.
    AND cible > COALESCE(seuil_orange, seuil_rouge) AND cible <= 100000
  )
);

CREATE INDEX IF NOT EXISTS economat_articles_emplacement_idx ON economat_articles(emplacement_id);

-- ── Projets associés (§3.2) ────────────────────────────────────────────────
-- Une référence peut servir à plusieurs projets ; un article stocké aussi.
-- CASCADE des deux côtés : c'est un lien, pas une donnée.
CREATE TABLE IF NOT EXISTS economat_article_projets (
  article_id BIGINT NOT NULL REFERENCES economat_articles(id) ON DELETE CASCADE,
  project_id UUID   NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (article_id, project_id)
);
CREATE INDEX IF NOT EXISTS economat_article_projets_projet_idx ON economat_article_projets(project_id);

ALTER TABLE economat_unites          ENABLE ROW LEVEL SECURITY;
ALTER TABLE economat_delais          ENABLE ROW LEVEL SECURITY;
ALTER TABLE economat_emplacements    ENABLE ROW LEVEL SECURITY;
ALTER TABLE economat_article_projets ENABLE ROW LEVEL SECURITY;

-- Rien pour `anon` ni `authenticated` : tout passe par les routes API.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.economat_unites          TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.economat_delais          TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.economat_emplacements    TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.economat_article_projets TO service_role;
GRANT USAGE, SELECT ON SEQUENCE economat_unites_id_seq       TO service_role;
GRANT USAGE, SELECT ON SEQUENCE economat_delais_id_seq       TO service_role;
GRANT USAGE, SELECT ON SEQUENCE economat_emplacements_id_seq TO service_role;

-- ── Reprise des données V1 (§26) ───────────────────────────────────────────
-- SEULES les conversions SANS AMBIGUÏTÉ sont faites ici. Mode de suivi, unité
-- de stock, stock cible, seuils et emplacement ne sont PAS déduits : les
-- anciens seuils mélangent les unités (« Si inférieur à 100pce » pour une
-- boîte de vis), et le brief interdit de convertir sans validation. La fiche
-- article affiche l'ancien texte à côté du champ vide pour aider la saisie.
-- Chaque UPDATE ne touche qu'un champ encore vide : le fichier se rejoue sans
-- écraser une saisie.

-- Les quatre fournisseurs de départ sont des boutiques en ligne.
UPDATE economat_articles a SET mode_appro = 'en_ligne'
FROM economat_fournisseurs f
WHERE a.fournisseur_id = f.id AND a.mode_appro IS NULL
  AND f.nom IN ('OPO', 'qbendo.ch', 'Galaxus', 'Conrad');

-- « Le lendemain si avant: 17h » est exactement « J+1 si commande avant 17h ».
-- « 1 - 2 jours » et « Sous trois jours » n'ont pas d'équivalent exact dans
-- la liste du brief : ils restent à choisir.
UPDATE economat_articles SET delai_id = (SELECT id FROM economat_delais WHERE libelle = 'J+1 si commande avant 17h')
WHERE delai_id IS NULL AND delai ~* '^\s*le lendemain si avant\s*:?\s*17\s*h\s*$';

-- « 1000pce », « 500pc », « 10 pce » → 1000 / 500 / 10 Pièces.
UPDATE economat_articles SET
  quantite_cmd = (substring(quantite_commande FROM '^\s*(\d+)'))::integer,
  unite_cmd_id = (SELECT id FROM economat_unites WHERE nom = 'Pièce')
WHERE quantite_cmd IS NULL AND unite_cmd_id IS NULL
  AND quantite_commande ~* '^\s*\d+\s*pce?\s*$';

-- « 1 paquet », « 2 paquets » → Paquet ; « 1 kit » → Kit.
UPDATE economat_articles SET
  quantite_cmd = (substring(quantite_commande FROM '^\s*(\d+)'))::integer,
  unite_cmd_id = (SELECT id FROM economat_unites WHERE nom = 'Paquet')
WHERE quantite_cmd IS NULL AND unite_cmd_id IS NULL
  AND quantite_commande ~* '^\s*\d+\s*paquets?\s*$';

UPDATE economat_articles SET
  quantite_cmd = (substring(quantite_commande FROM '^\s*(\d+)'))::integer,
  unite_cmd_id = (SELECT id FROM economat_unites WHERE nom = 'Kit')
WHERE quantite_cmd IS NULL AND unite_cmd_id IS NULL
  AND quantite_commande ~* '^\s*\d+\s*kits?\s*$';

-- « 1x50pce » (un paquet de 50 ? 50 pièces ?) reste à trancher à la main.

-- ── Décisions du 5 octobre 2026 ────────────────────────────────────────────
-- Ajoutées après le premier passage : le fichier se rejoue en entier.

-- « 1 - 2 jours » (10 articles) reçoit son propre délai ; « Sous trois jours »
-- (2 articles) rejoint « 2–3 jours ouvrables ».
INSERT INTO economat_delais (libelle, jours_ouvrables, ordre)
SELECT '1–2 jours ouvrables', 2, 25
WHERE NOT EXISTS (SELECT 1 FROM economat_delais WHERE libelle = '1–2 jours ouvrables');

UPDATE economat_articles SET delai_id = (SELECT id FROM economat_delais WHERE libelle = '1–2 jours ouvrables')
WHERE delai_id IS NULL AND delai ~* '^\s*1\s*-?\s*2\s*-?\s*jours\s*$';

UPDATE economat_articles SET delai_id = (SELECT id FROM economat_delais WHERE libelle = '2–3 jours ouvrables')
WHERE delai_id IS NULL AND delai ~* '^\s*sous trois jours\s*$';

-- Une quantité approximative suit UN SEUL contenant : sa cible est une boîte
-- pleine, soit exactement `decoupage` parts. Deux boîtes se suivent en
-- quantité entière.
ALTER TABLE economat_articles DROP CONSTRAINT IF EXISTS economat_approx_un_contenant_chk;
ALTER TABLE economat_articles ADD CONSTRAINT economat_approx_un_contenant_chk
  CHECK (suivi IS DISTINCT FROM 'approx' OR cible = decoupage);

-- ═══════════════════════════════════════════════════════════════════════════
-- Étape 2 : le workflow opérationnel (brief §11–§20)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- QR, mouvements de stock, niveaux approximatifs, ajustements,
-- réapprovisionnement au stock cible, prise en charge, historique.
--
-- Stock et réapprovisionnement sont DEUX dimensions (§16) : `stock` dit le
-- niveau physique, `reappro_par` / `reappro_le` disent qu'un humain s'en
-- occupe. Un article peut être 🔴 à zéro ET 🔵 pris en charge.

ALTER TABLE economat_articles
  ADD COLUMN IF NOT EXISTS reappro_par TEXT,
  ADD COLUMN IF NOT EXISTS reappro_le  TIMESTAMPTZ;

-- ── Historique des mouvements (§20) ────────────────────────────────────────
-- Une ligne par geste. `avant` et `apres` sont en PARTS, et le découpage du
-- moment est RECOPIÉ : changer de tiers en quarts l'an prochain ne doit pas
-- faire dire « ⅔ » à une ligne qui disait « ¾ ». C'est une photographie,
-- comme le journal des commandes.
CREATE TABLE IF NOT EXISTS economat_mouvements (
  id          BIGSERIAL PRIMARY KEY,
  article_id  BIGINT NOT NULL REFERENCES economat_articles(id) ON DELETE CASCADE,
  le          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  par         TEXT,
  type        TEXT NOT NULL CHECK (type IN (
                'mouvement',            -- −1 / +1 du QR (quantité entière)
                'niveau',               -- niveau constaté (quantité approximative)
                'ajustement',           -- achat ponctuel, hors réapprovisionnement (§14)
                'correction',           -- erreur ou inventaire, depuis la fiche (§4.2)
                'reappro',              -- retour au stock cible (§15, §19)
                'prise_en_charge',      -- 🔵 (§17)
                'fin_prise_en_charge',  -- prise en charge annulée
                'annulation')),         -- « Annuler » après un geste (§12)
  avant       INTEGER,
  apres       INTEGER,
  decoupage   SMALLINT,
  -- Ce qu'un réapprovisionnement a refermé, pour pouvoir l'annuler.
  reappro_par_avant TEXT,
  reappro_le_avant  TIMESTAMPTZ,
  commande_id BIGINT REFERENCES economat_commandes(id) ON DELETE SET NULL,
  annule_id   BIGINT REFERENCES economat_mouvements(id) ON DELETE SET NULL,
  annule_le   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS economat_mouvements_article_idx ON economat_mouvements(article_id, id DESC);

ALTER TABLE economat_mouvements ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.economat_mouvements TO service_role;
GRANT USAGE, SELECT ON SEQUENCE economat_mouvements_id_seq TO service_role;

-- ── L'état V1, recalculé ───────────────────────────────────────────────────
-- Pour un article configuré, la colonne `etat` n'est plus choisie : elle
-- SUIT le stock et la prise en charge. Elle reste écrite parce que l'écran
-- Suivi s'appuie encore dessus jusqu'à l'étape 3. Même règle que
-- `niveau()` dans lib/economat.js — un test côté JS la garde.
CREATE OR REPLACE FUNCTION economat_etat_calcule(
  p_stock INT, p_orange INT, p_rouge INT, p_reappro_le TIMESTAMPTZ
) RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_reappro_le IS NOT NULL THEN 'commande'
    WHEN p_stock <= p_rouge THEN 'commander'
    WHEN p_orange IS NOT NULL AND p_stock <= p_orange THEN 'bas'
    ELSE 'ok'
  END
$$;

-- ── Un geste sur le stock ──────────────────────────────────────────────────
-- Atomique et sérialisé par article : deux personnes qui scannent la même
-- boîte au même moment font deux « −1 », pas un. Le relatif (−1, +2) se
-- calcule ICI, sur la ligne verrouillée, jamais dans le navigateur.
CREATE OR REPLACE FUNCTION economat_stock(
  p_article BIGINT, p_type TEXT, p_delta INT, p_valeur INT, p_par TEXT
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  a          economat_articles%ROWTYPE;
  v_nouveau  INT;
  v_cmd      BIGINT;
  v_mvt      BIGINT;
  v_reappro  TIMESTAMPTZ;
  v_etat     TEXT;
BEGIN
  SELECT * INTO a FROM economat_articles WHERE id = p_article FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'raison', 'article_absent'); END IF;
  IF a.type <> 'stocke' OR a.suivi IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'non_configure');
  END IF;

  IF p_type IN ('mouvement', 'ajustement') THEN
    IF p_delta IS NULL OR p_delta = 0 OR abs(p_delta) > 100000 THEN
      RETURN jsonb_build_object('ok', false, 'raison', 'valeur_invalide');
    END IF;
    v_nouveau := GREATEST(0, a.stock + p_delta);
  ELSIF p_type IN ('niveau', 'correction') THEN
    IF p_valeur IS NULL OR p_valeur < 0 OR p_valeur > 100000
       OR (p_type = 'niveau' AND p_valeur > a.cible) THEN
      RETURN jsonb_build_object('ok', false, 'raison', 'valeur_invalide');
    END IF;
    v_nouveau := p_valeur;
  ELSIF p_type = 'reappro' THEN
    -- §19 : remettre à la cible, clore le réapprovisionnement en cours,
    -- garder la trace. La ligne du journal des commandes se ferme.
    v_nouveau := a.cible;
    UPDATE economat_commandes SET recu_le = NOW()
     WHERE id = (SELECT id FROM economat_commandes
                  WHERE article_id = a.id AND recu_le IS NULL
                  ORDER BY commande_le DESC LIMIT 1)
    RETURNING id INTO v_cmd;
  ELSE
    RETURN jsonb_build_object('ok', false, 'raison', 'type_inconnu');
  END IF;

  v_nouveau := LEAST(v_nouveau, 100000);
  -- Un geste qui ne change rien ne s'écrit pas (−1 sur une boîte déjà vide) ;
  -- seul le réapprovisionnement peut ne fermer QUE la prise en charge.
  IF v_nouveau = a.stock AND p_type <> 'reappro' THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'inchange', 'stock', a.stock);
  END IF;

  v_reappro := CASE WHEN p_type = 'reappro' THEN NULL ELSE a.reappro_le END;
  v_etat := economat_etat_calcule(v_nouveau, a.seuil_orange, a.seuil_rouge, v_reappro);

  INSERT INTO economat_mouvements
    (article_id, par, type, avant, apres, decoupage, reappro_par_avant, reappro_le_avant, commande_id)
  VALUES
    (a.id, p_par, p_type, a.stock, v_nouveau, a.decoupage,
     CASE WHEN p_type = 'reappro' THEN a.reappro_par END,
     CASE WHEN p_type = 'reappro' THEN a.reappro_le END,
     v_cmd)
  RETURNING id INTO v_mvt;

  UPDATE economat_articles SET
    stock       = v_nouveau,
    reappro_par = CASE WHEN p_type = 'reappro' THEN NULL ELSE reappro_par END,
    reappro_le  = v_reappro,
    etat        = v_etat,
    etat_le     = CASE WHEN etat IS DISTINCT FROM v_etat THEN NOW() ELSE etat_le END,
    updated_at  = NOW()
  WHERE id = a.id;

  RETURN jsonb_build_object('ok', true, 'mouvement_id', v_mvt, 'avant', a.stock, 'apres', v_nouveau);
END $$;

-- ── Prendre en charge / annuler la prise en charge (§17) ───────────────────
-- Une seule prise en charge à la fois : le second qui clique apprend QUI
-- s'en occupe déjà, au lieu de commander une deuxième fois (§31.7).
CREATE OR REPLACE FUNCTION economat_prise_en_charge(
  p_article BIGINT, p_prendre BOOLEAN, p_par TEXT
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  a        economat_articles%ROWTYPE;
  v_cmd    BIGINT;
  v_four   TEXT;
  v_unite  TEXT;
  v_etat   TEXT;
BEGIN
  SELECT * INTO a FROM economat_articles WHERE id = p_article FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'raison', 'article_absent'); END IF;
  IF a.type <> 'stocke' OR a.suivi IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'non_configure');
  END IF;

  IF p_prendre THEN
    IF a.reappro_le IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'raison', 'deja_pris', 'par', a.reappro_par, 'le', a.reappro_le);
    END IF;
    -- Le journal des commandes RECOPIE fournisseur, référence et quantité :
    -- une photographie, pas une jointure (même règle qu'en V1).
    SELECT nom INTO v_four FROM economat_fournisseurs WHERE id = a.fournisseur_id;
    SELECT CASE WHEN a.quantite_cmd >= 2 THEN lower(pluriel) ELSE lower(nom) END
      INTO v_unite FROM economat_unites WHERE id = a.unite_cmd_id;
    INSERT INTO economat_commandes (article_id, par, fournisseur, reference, quantite)
    VALUES (a.id, p_par, v_four, a.reference,
            CASE WHEN a.quantite_cmd IS NULL THEN NULL ELSE trim(a.quantite_cmd || ' ' || COALESCE(v_unite, '')) END)
    RETURNING id INTO v_cmd;

    UPDATE economat_articles SET reappro_par = p_par, reappro_le = NOW(),
      etat = 'commande', etat_le = NOW(), updated_at = NOW()
    WHERE id = a.id;
    INSERT INTO economat_mouvements (article_id, par, type, avant, apres, decoupage, commande_id)
    VALUES (a.id, p_par, 'prise_en_charge', a.stock, a.stock, a.decoupage, v_cmd);
    RETURN jsonb_build_object('ok', true);
  END IF;

  IF a.reappro_le IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'pas_de_prise');
  END IF;
  -- La ligne ouverte du journal des commandes disparaît : rien n'a été
  -- commandé. La trace reste dans les mouvements (qui, quand, qui l'avait).
  DELETE FROM economat_commandes
   WHERE id = (SELECT id FROM economat_commandes
                WHERE article_id = a.id AND recu_le IS NULL
                ORDER BY commande_le DESC LIMIT 1);
  v_etat := economat_etat_calcule(a.stock, a.seuil_orange, a.seuil_rouge, NULL);
  UPDATE economat_articles SET reappro_par = NULL, reappro_le = NULL,
    etat = v_etat, etat_le = NOW(), updated_at = NOW()
  WHERE id = a.id;
  INSERT INTO economat_mouvements (article_id, par, type, avant, apres, decoupage, reappro_par_avant, reappro_le_avant)
  VALUES (a.id, p_par, 'fin_prise_en_charge', a.stock, a.stock, a.decoupage, a.reappro_par, a.reappro_le);
  RETURN jsonb_build_object('ok', true);
END $$;

-- ── Annuler le dernier geste (§12) ─────────────────────────────────────────
-- « ✓ Stock passé de 3 à 2 — Annuler ». Seulement le DERNIER geste de
-- l'article, seulement si le stock n'a pas bougé depuis, et dans les quinze
-- minutes : au-delà, c'est une correction, qui se fait depuis la fiche.
CREATE OR REPLACE FUNCTION economat_annuler(p_mouvement BIGINT, p_par TEXT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  m       economat_mouvements%ROWTYPE;
  a       economat_articles%ROWTYPE;
  v_rpar  TEXT;
  v_rle   TIMESTAMPTZ;
  v_etat  TEXT;
BEGIN
  SELECT * INTO m FROM economat_mouvements WHERE id = p_mouvement;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'raison', 'mouvement_absent'); END IF;
  SELECT * INTO a FROM economat_articles WHERE id = m.article_id FOR UPDATE;

  IF m.annule_le IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'raison', 'deja_annule'); END IF;
  IF m.type NOT IN ('mouvement', 'niveau', 'ajustement', 'correction', 'reappro') THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'non_annulable');
  END IF;
  IF m.le < NOW() - INTERVAL '15 minutes' THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'trop_tard');
  END IF;
  IF EXISTS (SELECT 1 FROM economat_mouvements WHERE article_id = m.article_id AND id > m.id)
     OR a.stock IS DISTINCT FROM m.apres OR a.decoupage IS DISTINCT FROM m.decoupage THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'stock_change');
  END IF;

  IF m.type = 'reappro' THEN
    v_rpar := m.reappro_par_avant;
    v_rle  := m.reappro_le_avant;
    IF m.commande_id IS NOT NULL THEN
      UPDATE economat_commandes SET recu_le = NULL WHERE id = m.commande_id;
    END IF;
  ELSE
    v_rpar := a.reappro_par;
    v_rle  := a.reappro_le;
  END IF;
  v_etat := economat_etat_calcule(m.avant, a.seuil_orange, a.seuil_rouge, v_rle);

  UPDATE economat_articles SET stock = m.avant, reappro_par = v_rpar, reappro_le = v_rle,
    etat = v_etat, etat_le = CASE WHEN etat IS DISTINCT FROM v_etat THEN NOW() ELSE etat_le END,
    updated_at = NOW()
  WHERE id = a.id;
  UPDATE economat_mouvements SET annule_le = NOW() WHERE id = m.id;
  INSERT INTO economat_mouvements (article_id, par, type, avant, apres, decoupage, annule_id)
  VALUES (a.id, p_par, 'annulation', m.apres, m.avant, m.decoupage, m.id);
  RETURN jsonb_build_object('ok', true, 'avant', m.apres, 'apres', m.avant);
END $$;

-- Exécutables par les routes API seulement : rien pour le navigateur.
REVOKE ALL ON FUNCTION economat_etat_calcule(INT, INT, INT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION economat_stock(BIGINT, TEXT, INT, INT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION economat_prise_en_charge(BIGINT, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION economat_annuler(BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION economat_etat_calcule(INT, INT, INT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION economat_stock(BIGINT, TEXT, INT, INT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION economat_prise_en_charge(BIGINT, BOOLEAN, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION economat_annuler(BIGINT, TEXT) TO service_role;

-- ── Rollback ───────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS economat_annuler(BIGINT, TEXT);
-- DROP FUNCTION IF EXISTS economat_prise_en_charge(BIGINT, BOOLEAN, TEXT);
-- DROP FUNCTION IF EXISTS economat_stock(BIGINT, TEXT, INT, INT, TEXT);
-- DROP FUNCTION IF EXISTS economat_etat_calcule(INT, INT, INT, TIMESTAMPTZ);
-- DROP TABLE IF EXISTS economat_mouvements;
-- ALTER TABLE economat_articles DROP COLUMN IF EXISTS reappro_par, DROP COLUMN IF EXISTS reappro_le;
-- ALTER TABLE economat_articles
--   DROP CONSTRAINT IF EXISTS economat_type_chk,
--   DROP CONSTRAINT IF EXISTS economat_mode_appro_chk,
--   DROP CONSTRAINT IF EXISTS economat_quantite_cmd_chk,
--   DROP CONSTRAINT IF EXISTS economat_stock_chk,
--   DROP CONSTRAINT IF EXISTS economat_approx_un_contenant_chk,
--   DROP COLUMN IF EXISTS type, DROP COLUMN IF EXISTS sous_titre,
--   DROP COLUMN IF EXISTS emplacement_id, DROP COLUMN IF EXISTS suivi,
--   DROP COLUMN IF EXISTS unite_stock_id, DROP COLUMN IF EXISTS decoupage,
--   DROP COLUMN IF EXISTS cible, DROP COLUMN IF EXISTS seuil_orange,
--   DROP COLUMN IF EXISTS seuil_rouge, DROP COLUMN IF EXISTS stock,
--   DROP COLUMN IF EXISTS mode_appro, DROP COLUMN IF EXISTS quantite_cmd,
--   DROP COLUMN IF EXISTS unite_cmd_id, DROP COLUMN IF EXISTS delai_id,
--   DROP COLUMN IF EXISTS note_appro;
-- DROP TABLE IF EXISTS economat_article_projets;
-- DROP TABLE IF EXISTS economat_emplacements;
-- DROP TABLE IF EXISTS economat_delais;
-- DROP TABLE IF EXISTS economat_unites;
