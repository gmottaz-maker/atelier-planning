-- ═══════════════════════════════════════════════════════════════════════════
-- Économat — le catalogue des consommables, derrière le Kanban physique
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Ce n'est PAS une gestion de stock. Aucune quantité n'est décrémentée, aucun
-- seuil n'est comparé à quoi que ce soit, et Maze ne décide jamais d'un état :
-- c'est un humain devant une boîte qui bascule 🟢 → 🟠 → 🔴 → 🔵 → 🟢. Le
-- Kanban physique reste l'outil ; Maze centralise les références, dit ce qu'il
-- y a à commander, garde l'historique et imprime les cartes.
--
-- Quatre tables : l'arbre des catégories, la liste contrôlée des fournisseurs,
-- le catalogue des articles, et le journal des commandes.
--
-- `economat_fournisseurs` référence `annuaire` : rejouer ce schéma depuis zéro
-- suppose donc `schema-annuaire.sql` déjà joué.

-- ── Catégories ─────────────────────────────────────────────────────────────
-- Même forme que `annuaire_categories` : auto-référence, aucune profondeur
-- imposée en base, deux niveaux à l'écran. La COULEUR ne vit qu'au premier
-- niveau — une sous-catégorie hérite de sa mère. Cinquante teintes seraient
-- cinquante teintes indiscernables, et le bandeau de la carte ne répond qu'à
-- une question : « ça se range où ».
CREATE TABLE IF NOT EXISTS economat_categories (
  id         BIGSERIAL PRIMARY KEY,
  nom        TEXT NOT NULL CHECK (length(trim(nom)) > 0),
  parent_id  BIGINT REFERENCES economat_categories(id) ON DELETE CASCADE,
  -- Choisies pour l'ENCRE sur papier ordinaire, pas pour l'écran : assez
  -- écartées pour se distinguer à l'imprimante de l'atelier, assez claires
  -- pour que le texte noir passe dessus.
  couleur    TEXT CHECK (couleur IS NULL OR couleur ~ '^#[0-9A-Fa-f]{6}$'),
  archived   BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS economat_categories_parent_idx ON economat_categories(parent_id);

-- ── Fournisseurs ───────────────────────────────────────────────────────────
-- Une petite liste contrôlée, pas du texte libre. Le fournisseur est un FILTRE
-- métier — « montre-moi ce qui est 🟠 et 🔴 chez OPO pendant leur promo » — et
-- une colonne libre produit « OPO », « opo », « OPO Oeschger » et « Opo AG »
-- dans la même liste déroulante au bout de six mois. C'est exactement ce qui
-- avait rendu les factures clientes irrapprochables (cf. `loadCandidates`).
--
-- `annuaire_id` est nullable et sans usage en V1 : l'annuaire ne contient
-- aucun de ces quatre fournisseurs aujourd'hui, et lier de force deux bases
-- pour le plaisir de la clé étrangère obligerait à saisir une fiche d'annuaire
-- avant de pouvoir commander des vis. Le jour où l'annuaire les porte, la
-- colonne est là.
CREATE TABLE IF NOT EXISTS economat_fournisseurs (
  id          BIGSERIAL PRIMARY KEY,
  nom         TEXT NOT NULL UNIQUE CHECK (length(trim(nom)) > 0),
  annuaire_id BIGINT REFERENCES annuaire(id) ON DELETE SET NULL,
  archived    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO economat_fournisseurs (nom)
SELECT * FROM (VALUES ('OPO'), ('qbendo.ch'), ('Galaxus'), ('Conrad')) AS v(nom)
WHERE NOT EXISTS (SELECT 1 FROM economat_fournisseurs);

-- ── Articles ───────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS economat_code_seq START 1;

CREATE TABLE IF NOT EXISTS economat_articles (
  id          BIGSERIAL PRIMARY KEY,

  -- ECO-0001. Attribué par une séquence, comme `projects.numero` — jamais un
  -- max + 1, qui n'est pas concurrent. DÉFINITIF et jamais réattribué, comme
  -- le code d'une activité : une carte imprimée aujourd'hui doit vouloir dire
  -- la même chose dans deux ans. Personne ne le choisit.
  code        TEXT NOT NULL UNIQUE
              DEFAULT ('ECO-' || lpad(nextval('economat_code_seq')::text, 4, '0')),

  -- Ce que le QR encode. Pas l'id : un QR sur /e/42 s'énumère depuis le
  -- parking, et l'adresse est imprimée sur quatre-vingts cartes.
  jeton       TEXT NOT NULL UNIQUE
              DEFAULT substr(md5(random()::text || clock_timestamp()::text), 1, 12),

  designation TEXT NOT NULL CHECK (length(trim(designation)) > 0),
  photo_path  TEXT,                       -- objet du bucket public economat-photos

  -- Une seule clé, qui pointe la feuille (sous-catégorie) OU la racine : la
  -- catégorie mère s'en déduit. Pas de table de liaison comme l'annuaire — un
  -- tôlier fait deux métiers, un paquet de vis est rangé à un seul endroit.
  --
  -- SET NULL, et non CASCADE comme le catalogue : ranger la taxonomie ne doit
  -- JAMAIS effacer un article. L'article est un objet physique dans une boîte ;
  -- il se retrouve « sans catégorie », pas à la corbeille.
  categorie_id BIGINT REFERENCES economat_categories(id) ON DELETE SET NULL,

  -- SET NULL, comme la catégorie : archiver un fournisseur ne doit pas
  -- emporter les articles qu'on lui achetait — on en changera, la vis reste.
  fournisseur_id     BIGINT REFERENCES economat_fournisseurs(id) ON DELETE SET NULL,
  fournisseur_alt_id BIGINT REFERENCES economat_fournisseurs(id) ON DELETE SET NULL,

  reference       TEXT,                   -- « la référence fournisseur fait foi »
  -- Facultative, et elle GAGNE sur le lien déduit de la référence : chez OPO
  -- le bouton « Commander » se fabrique tout seul, mais une exception — une
  -- fiche produit qui ne sort pas de la recherche, un lien direct qu'on
  -- préfère — doit pouvoir être posée à la main sans discussion.
  url_produit     TEXT,

  -- Le délai tel qu'on le dit (« Le lendemain si avant: 17h ») ET, à côté, un
  -- nombre facultatif qui ne sert qu'à signaler un 🔵 qui traîne. NULL = pas
  -- de signalement. Sans ce nombre, « signaler un retard » n'a rien sur quoi
  -- s'appuyer ; sans le texte, on perdrait la seule information utile.
  delai       TEXT,
  delai_jours INTEGER CHECK (delai_jours IS NULL OR delai_jours BETWEEN 0 AND 365),

  -- TOUS les seuils sont du TEXTE. « Si inférieur à 100pce », « ½ rouleau »,
  -- « ~20 % restant », « dernier paquet ». C'est ce que le brief autorise et
  -- ce que le fichier contient déjà. Un seuil numérique inviterait à comparer,
  -- donc à automatiser — et l'automatisation ment dès la première boîte à
  -- moitié vide.
  unite             TEXT,
  stock_cible       TEXT,
  seuil_bas         TEXT,
  seuil_commander   TEXT,
  quantite_commande TEXT,

  -- Texte libre en V1 : la nomenclature physique de l'atelier n'existe pas
  -- encore, et imposer une liste avant d'avoir posé les étiquettes sur les
  -- rayonnages garantirait des « divers » partout. Le passage à une liste
  -- contrôlée se fera comme pour les fournisseurs — une table, une colonne
  -- `emplacement_id`, et un script qui reprend les valeurs distinctes — sans
  -- toucher au reste du module.
  emplacement TEXT,
  notes       TEXT,

  -- Jamais d'emoji en base : ça ne se cherche pas, ne se trie pas, et casse le
  -- premier export. Le CHECK porte sur la VALEUR, pas sur le chemin — toutes
  -- les transitions restent libres, 🟠 → 🔵 compris (commande anticipée).
  etat        TEXT NOT NULL DEFAULT 'ok'
              CHECK (etat IN ('ok', 'bas', 'commander', 'commande')),
  etat_le     TIMESTAMPTZ DEFAULT NOW(),

  archived    BOOLEAN NOT NULL DEFAULT false,
  created_by  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS economat_articles_categorie_idx ON economat_articles(categorie_id);
CREATE INDEX IF NOT EXISTS economat_articles_etat_idx      ON economat_articles(etat);
CREATE INDEX IF NOT EXISTS economat_articles_fournisseur_idx ON economat_articles(fournisseur_id);

-- ── Journal des commandes ──────────────────────────────────────────────────
-- Une ligne par passage en 🔵. Le fournisseur, la référence et la quantité y
-- sont RECOPIÉS : même raison que le forfait transport qui fige sa distance —
-- changer de fournisseur en 2027 ne doit pas réécrire ce qu'on a commandé
-- en 2026.
--
-- `recu_le` se remplit tout seul quand l'article quitte 🔵. Il n'y a pas
-- d'état « Reçu » à l'écran (le brief l'exclut), mais la ligne se ferme — et
-- dans deux ans ça donne les délais réels, gratuitement.
CREATE TABLE IF NOT EXISTS economat_commandes (
  id          BIGSERIAL PRIMARY KEY,
  article_id  BIGINT NOT NULL REFERENCES economat_articles(id) ON DELETE CASCADE,
  commande_le TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recu_le     TIMESTAMPTZ,
  par         TEXT,
  -- Le NOM, pas la clé : une ligne d'historique doit rester lisible si le
  -- fournisseur est renommé ou supprimé de la liste. C'est une photographie,
  -- pas une jointure.
  fournisseur TEXT,
  reference   TEXT,
  quantite    TEXT
);
CREATE INDEX IF NOT EXISTS economat_commandes_article_idx ON economat_commandes(article_id, commande_le DESC);

ALTER TABLE economat_fournisseurs ENABLE ROW LEVEL SECURITY;
ALTER TABLE economat_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE economat_articles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE economat_commandes  ENABLE ROW LEVEL SECURITY;

-- Depuis le 30 octobre 2026, une table nouvelle est injoignable sans GRANT
-- explicite — y compris en service-role. Rien pour `anon` ni `authenticated` :
-- tout passe par les routes API.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.economat_fournisseurs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.economat_categories  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.economat_articles   TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.economat_commandes  TO service_role;
GRANT USAGE, SELECT ON SEQUENCE economat_fournisseurs_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE economat_categories_id_seq   TO service_role;
GRANT USAGE, SELECT ON SEQUENCE economat_articles_id_seq   TO service_role;
GRANT USAGE, SELECT ON SEQUENCE economat_commandes_id_seq  TO service_role;
GRANT USAGE, SELECT ON SEQUENCE economat_code_seq          TO service_role;

-- ── Arborescence et couleurs de départ ─────────────────────────────────────
-- Posées UNE FOIS, et seulement si la table est vide. Ce sont les douze
-- catégories du brief et les sous-catégories de la feuille « Taxonomie V1 » :
-- elles donnent la forme, pas la vérité. Tout se renomme, se recolore,
-- s'archive et se complète depuis l'écran — rien n'est codé en dur.
--
-- Le corail #FF4D6D n'est pas distribué : il veut dire « admin / alerte »
-- partout ailleurs dans Maze.
INSERT INTO economat_categories (nom, couleur)
SELECT * FROM (VALUES
  ('Fixation & quincaillerie',           '#A8C0DC'),
  ('Abrasifs',                           '#D9B48F'),
  ('Adhésifs & colles',                  '#E8C46A'),
  ('Électricité & électronique',         '#F2A65A'),
  ('Peinture & finition',                '#C9A0D6'),
  ('EPI & sécurité',                     '#F58F8F'),
  ('Filtration & aspiration',            '#9FD3C7'),
  ('Outillage & consommables machine',   '#B0B7BD'),
  ('Logistique & emballage',             '#D7CDA7'),
  ('Nettoyage & entretien',              '#A9D9A5'),
  ('Impression 3D',                      '#8FC7E8'),
  ('Soudage & travail du métal',         '#C4B5A0')
) AS v(nom, couleur)
WHERE NOT EXISTS (SELECT 1 FROM economat_categories);

INSERT INTO economat_categories (nom, parent_id)
SELECT v.nom, (SELECT id FROM economat_categories WHERE nom = v.parent AND parent_id IS NULL)
FROM (VALUES
  ('Visserie bois',              'Fixation & quincaillerie'),
  ('Boulonnerie & métrique',     'Fixation & quincaillerie'),
  ('Chevilles & ancrages',       'Fixation & quincaillerie'),
  ('Assemblage bois',            'Fixation & quincaillerie'),
  ('Colliers & embases',         'Fixation & quincaillerie'),
  ('Disques',                    'Abrasifs'),
  ('Feuilles',                   'Abrasifs'),
  ('Bandes',                     'Abrasifs'),
  ('Double-face',                'Adhésifs & colles'),
  ('Masquage',                   'Adhésifs & colles'),
  ('Colles',                     'Adhésifs & colles'),
  ('Connectique',                'Électricité & électronique'),
  ('Câbles',                     'Électricité & électronique'),
  ('Alimentations',              'Électricité & électronique'),
  ('LED',                        'Électricité & électronique'),
  ('Commande & relais',          'Électricité & électronique'),
  ('Piles & batteries',          'Électricité & électronique'),
  ('Application peinture',       'Peinture & finition'),
  ('Mélange & préparation',      'Peinture & finition'),
  ('Produits de finition',       'Peinture & finition'),
  ('Gants',                      'EPI & sécurité'),
  ('Protection respiratoire',    'EPI & sécurité'),
  ('Protection oculaire & auditive', 'EPI & sécurité'),
  ('Cabine peinture',            'Filtration & aspiration'),
  ('Laser',                      'Filtration & aspiration'),
  ('Aspiration copeaux',         'Filtration & aspiration'),
  ('Filtration ambiante',        'Filtration & aspiration'),
  ('Lames & plaquettes',         'Outillage & consommables machine'),
  ('Fraises & outils de coupe',  'Outillage & consommables machine'),
  ('Consommables machines',      'Outillage & consommables machine'),
  ('Films & rubans emballage',   'Logistique & emballage'),
  ('Protection',                 'Logistique & emballage'),
  ('Expédition',                 'Logistique & emballage'),
  ('Essuyage',                   'Nettoyage & entretien'),
  ('Déchets',                    'Nettoyage & entretien'),
  ('Produits de nettoyage',      'Nettoyage & entretien'),
  ('Filaments',                  'Impression 3D'),
  ('Buses & pièces',             'Impression 3D'),
  ('Consommables impression',    'Impression 3D'),
  ('MIG/MAG',                    'Soudage & travail du métal'),
  ('Soudage laser',              'Soudage & travail du métal'),
  ('Gaz de soudage',             'Soudage & travail du métal'),
  ('Meulage & finition métal',   'Soudage & travail du métal')
) AS v(nom, parent)
WHERE NOT EXISTS (SELECT 1 FROM economat_categories WHERE parent_id IS NOT NULL);

-- ── Rollback ───────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS economat_commandes;
-- DROP TABLE IF EXISTS economat_articles;
-- DROP TABLE IF EXISTS economat_categories;
-- DROP TABLE IF EXISTS economat_fournisseurs;
-- DROP SEQUENCE IF EXISTS economat_code_seq;
