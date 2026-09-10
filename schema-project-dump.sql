-- ═══════════════════════════════════════════════════════════════════════════
-- Dump de projet — le fil « Mises à jour » devient une boîte de dépôt
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Le fil n'acceptait que du texte et une image. On y jette désormais aussi des
-- PDF, des messages vocaux et des liens. Pas de seconde table : deux fils de
-- notes par projet auraient signifié deux endroits à consulter, dont aucun
-- complet.
--
-- Les colonnes `image_*` sont conservées et recopiées dans `file_*` plutôt que
-- renommées : la migration peut être jouée avant OU après le déploiement sans
-- casser l'écran, ce qu'un RENAME interdit. Elles pourront être supprimées une
-- fois le code déployé partout (voir le bloc final, commenté).

-- ── La pièce jointe n'est plus forcément une image ─────────────────────────
ALTER TABLE project_updates ADD COLUMN IF NOT EXISTS file_kdrive_id BIGINT;
ALTER TABLE project_updates ADD COLUMN IF NOT EXISTS file_filename  TEXT;
ALTER TABLE project_updates ADD COLUMN IF NOT EXISTS file_mime_type TEXT;

UPDATE project_updates
   SET file_kdrive_id = image_kdrive_id,
       file_filename  = image_filename,
       file_mime_type = image_mime_type
 WHERE file_kdrive_id IS NULL AND image_kdrive_id IS NOT NULL;

-- ── Le lien déposé ─────────────────────────────────────────────────────────
-- `url_extrait` garde le texte lu sur la page au moment du dépôt : la synthèse
-- doit rester lisible même si la page disparaît ou change.
ALTER TABLE project_updates ADD COLUMN IF NOT EXISTS url         TEXT;
ALTER TABLE project_updates ADD COLUMN IF NOT EXISTS url_titre   TEXT;
ALTER TABLE project_updates ADD COLUMN IF NOT EXISTS url_extrait TEXT;

-- ── Le message vocal ───────────────────────────────────────────────────────
-- La transcription est facultative : sans service configuré, l'audio est
-- simplement stocké et réécoutable, et `transcription_etat` dit pourquoi il
-- n'y a pas de texte — plutôt qu'un silence qu'on prendrait pour un bug.
ALTER TABLE project_updates ADD COLUMN IF NOT EXISTS transcription      TEXT;
ALTER TABLE project_updates ADD COLUMN IF NOT EXISTS transcription_etat TEXT
  CHECK (transcription_etat IS NULL
         OR transcription_etat IN ('ok', 'indisponible', 'echec'));

-- `content` était NOT NULL : un vocal ou un PDF sans commentaire n'a rien à y
-- mettre. La contrainte devient « une entrée porte au moins quelque chose ».
ALTER TABLE project_updates ALTER COLUMN content DROP NOT NULL;

ALTER TABLE project_updates DROP CONSTRAINT IF EXISTS project_updates_non_vide;
ALTER TABLE project_updates ADD  CONSTRAINT project_updates_non_vide CHECK (
  COALESCE(NULLIF(TRIM(content), ''), NULLIF(TRIM(url), '')) IS NOT NULL
  OR file_kdrive_id IS NOT NULL
  OR image_kdrive_id IS NOT NULL
);

-- ── La synthèse, sur le projet ─────────────────────────────────────────────
-- Une colonne plutôt qu'une table : il n'y a jamais qu'une synthèse courante
-- par projet, et personne n'a demandé à relire les précédentes.
--
-- `synthese_entrees` mémorise le nombre d'éléments résumés : c'est ce qui
-- permet d'afficher « synthèse à jour » ou « 3 éléments depuis » sans relancer
-- de calcul.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS synthese          TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS synthese_le       TIMESTAMPTZ;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS synthese_entrees  INTEGER;

-- ── Rollback ───────────────────────────────────────────────────────────────
-- ALTER TABLE project_updates DROP CONSTRAINT IF EXISTS project_updates_non_vide;
-- ALTER TABLE project_updates DROP COLUMN IF EXISTS file_kdrive_id, DROP COLUMN IF EXISTS file_filename,
--   DROP COLUMN IF EXISTS file_mime_type, DROP COLUMN IF EXISTS url, DROP COLUMN IF EXISTS url_titre,
--   DROP COLUMN IF EXISTS url_extrait, DROP COLUMN IF EXISTS transcription, DROP COLUMN IF EXISTS transcription_etat;
-- ALTER TABLE projects DROP COLUMN IF EXISTS synthese, DROP COLUMN IF EXISTS synthese_le,
--   DROP COLUMN IF EXISTS synthese_entrees;

-- ── Nettoyage, une fois le nouveau code déployé partout ────────────────────
-- ALTER TABLE project_updates DROP COLUMN image_kdrive_id, DROP COLUMN image_filename,
--   DROP COLUMN image_mime_type;
