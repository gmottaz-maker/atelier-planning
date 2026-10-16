-- ═══════════════════════════════════════════════════════════════════════════
-- Retrait de la pointeuse
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `clock_sessions` tenait la session de pointage en cours : une ligne par
-- personne, créée en pointant l'arrivée, supprimée en pointant le départ.
--
-- Elle n'a jamais figuré dans un fichier `schema-*.sql` ni dans
-- `scripts/check-db.mjs` : créée à la main, hors du registre, donc invisible
-- de tout contrôle. C'est la même dérive que `schema-work-slots.sql`, restée
-- six semaines hors des deux listes.
--
-- Pourquoi on l'enlève plutôt que de la réparer : rien ne fermait jamais une
-- session. Pas de rappel, pas de clôture à minuit, aucun rattrapage. Au
-- 5 octobre 2026, deux sessions étaient ouvertes DEPUIS LE 27 AOÛT (Guillaume
-- 13:48, Arnaud 13:47) : l'application annonçait les deux « en service »
-- depuis cinq semaines. Pire, pointer le départ aurait écrit une journée de
-- travail datée du 27 août, puisque la date gardée était celle de l'arrivée.
--
-- La saisie des horaires reste entière : elle se fait à la main dans la
-- fenêtre du jour (`/schedule`), avec arrivée, départ et pause. C'est la seule
-- voie désormais, et c'était déjà la seule qui marchait.

DROP TABLE IF EXISTS clock_sessions;

-- Rollback : il n'y en a pas, et c'est voulu. Le code qui lisait cette table
-- est supprimé ; la recréer vide ne ferait revenir aucune fonctionnalité.
