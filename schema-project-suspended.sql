-- Mise en pause d'un projet : le sort des « en retard » sans l'archiver, et se
-- lève d'un clic. Indépendant de la phase de travail (qui est préservée).

ALTER TABLE projects ADD COLUMN IF NOT EXISTS suspended BOOLEAN DEFAULT false;
