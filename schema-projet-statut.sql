-- Statut d'avancement d'un projet, posé à la main (nouvelle fiche, octobre 2026).
--
-- Seuls les statuts que personne d'autre ne peut déduire sont stockés :
--   production           le matériel est là, on fabrique
--   production_terminee  c'est prêt, à l'atelier, en attente (montage, envoi, stockage)
--   exploitation         monté chez le client, entre le montage et le démontage
--   termine              livré ou démonté : c'est là qu'on facture
-- NULL = statut DÉDUIT : « préparation » tant que l'offre n'est pas acceptée,
-- « pré-production » dès qu'elle l'est. « Facturé » se déduit d'une facture
-- existante, « archivé » de projects.status. Rien de cela n'est recopié ici.
--
-- Colonne séparée de `phase` : l'application actuelle continue de lire
-- `phase` et ne voit rien changer tant que la nouvelle fiche n'est pas
-- en service.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS statut TEXT
  CHECK (statut IS NULL OR statut IN ('production', 'production_terminee', 'exploitation', 'termine'));

-- Rollback :
-- ALTER TABLE projects DROP COLUMN IF EXISTS statut;
