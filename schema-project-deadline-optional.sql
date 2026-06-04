-- Rend la date de livraison (deadline) optionnelle.
-- Certains projets n'ont pas encore de date définie au début.
-- Sans ça, créer un projet sans date échoue (violates not-null constraint)
-- et le projet n'apparaît jamais dans la liste.
-- Sûr à relancer : DROP NOT NULL est un no-op si la contrainte est déjà levée.

ALTER TABLE projects ALTER COLUMN deadline DROP NOT NULL;
