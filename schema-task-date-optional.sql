-- Tâches sans date d'exécution.
--
-- `execution_date` était NOT NULL : créer une tâche sans date échouait
-- (erreur 23502) et l'interface ignorait l'erreur, donc la tâche semblait
-- simplement ne pas s'afficher. L'affichage gère déjà l'absence de date
-- (groupe « Sans date » sur la page Tâches, pas de badge sur la fiche projet).

ALTER TABLE tasks ALTER COLUMN execution_date DROP NOT NULL;
