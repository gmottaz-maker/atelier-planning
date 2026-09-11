-- ═══════════════════════════════════════════════════════════════════════════
-- Activités : renumérotation par famille, en dizaines
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Le 11 septembre 2026, AVANT la première feuille d'heures imprimée — le seul
-- moment où changer un code ne coûte rien. Ensuite, un code ne change plus.
--
--   Gestion 10–19 · Atelier 20–29 · Finitions 30–39 · Chantier 40–49
--   Logistique 50–59 · Interne 60–69
--
-- Des dizaines plutôt qu'une suite continue : chaque famille garde dix places,
-- et une activité ajoutée plus tard se range avec les siennes au lieu de
-- tomber en fin de liste. Le premier chiffre dit la famille.
--
-- Les heures déjà saisies suivent leur activité (ON UPDATE CASCADE, le temps
-- de la transaction). Tout se fait en une fois ou pas du tout : une activité
-- absente de la table de correspondance ci-dessous annule l'ensemble.
BEGIN;

-- 1. Laisser le code changer une dernière fois, en entraînant les heures.
ALTER TABLE heures DROP CONSTRAINT IF EXISTS heures_activite_fkey;
ALTER TABLE heures ADD CONSTRAINT heures_activite_fkey
  FOREIGN KEY (activite) REFERENCES activites(code) ON UPDATE CASCADE;
ALTER TABLE activites DROP CONSTRAINT IF EXISTS activites_code_check;

-- 2. Sortir tous les codes de la plage 1–99, puis y revenir dans le nouvel
--    ordre : aucun code ne peut ainsi en percuter un autre en chemin.
UPDATE activites SET code = code + 1000;
UPDATE activites SET code = CASE code - 1000
  -- Gestion
  WHEN 15 THEN 10   -- Gestion de projet
  WHEN 1  THEN 11   -- Visuels, plans / fichiers CNC
  WHEN 24 THEN 12   -- Graphisme
  WHEN 25 THEN 13   -- Relation client / prospection
  WHEN 27 THEN 14   -- Consulting
  -- Atelier
  WHEN 2  THEN 20   -- CNC
  WHEN 3  THEN 21   -- Découpe laser
  WHEN 4  THEN 22   -- Débit / découpe
  WHEN 5  THEN 23   -- Assemblage
  WHEN 6  THEN 24   -- Soudure
  WHEN 23 THEN 25   -- Réparations
  -- Finitions
  WHEN 7  THEN 30   -- Ponçage / préparation
  WHEN 8  THEN 31   -- Peinture / vernis / sticker
  WHEN 9  THEN 32   -- Électricité / LED
  -- Chantier
  WHEN 13 THEN 40   -- Montage sur place
  WHEN 14 THEN 41   -- Démontage sur place
  -- Logistique
  WHEN 10 THEN 50   -- Emballage / chargement / déchargement
  WHEN 11 THEN 51   -- Conduite
  WHEN 12 THEN 52   -- Manutention
  -- Interne
  WHEN 20 THEN 60   -- Entretien / rangement / maintenance
  WHEN 21 THEN 61   -- Administratif
  WHEN 22 THEN 62   -- Formation
  WHEN 26 THEN 63   -- Divers
  ELSE code
END;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM activites WHERE code >= 1000) THEN
    RAISE EXCEPTION 'Une activité n''est pas prévue par la renumérotation — rien n''a été modifié';
  END IF;
END $$;

-- 3. Refermer. La clé étrangère revient SANS cascade : désormais, la base
--    elle-même refuse de changer le code d'une activité déjà utilisée.
ALTER TABLE activites ADD CONSTRAINT activites_code_check CHECK (code BETWEEN 1 AND 99);
ALTER TABLE heures DROP CONSTRAINT heures_activite_fkey;
ALTER TABLE heures ADD CONSTRAINT heures_activite_fkey FOREIGN KEY (activite) REFERENCES activites(code);

-- L'interne ne se facture pas : « Divers », ajoutée après le passage de
-- schema-activites-facturation.sql, en hérite ici.
UPDATE activites SET facturee_heure = false WHERE famille = 'interne';

-- Pause payée : 30 min offertes dans chaque journée régulière de 8,4 h (la
-- pause de midi, 1 h, n'est pas payée et n'y entre pas). Comptée
-- automatiquement quand elle n'est pas notée — lib/heures.js, complements().
INSERT INTO activites (code, libelle, famille, facturee_heure)
VALUES (64, 'Pause payée', 'interne', false)
ON CONFLICT (code) DO NOTHING;

COMMIT;

-- ── Vérification ───────────────────────────────────────────────────────────
--   SELECT code, famille, libelle, facturee_heure FROM activites ORDER BY code;
--   SELECT activite, count(*) FROM heures GROUP BY activite;
