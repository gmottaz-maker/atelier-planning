-- kDrive integration
-- id du dossier projet sur kDrive (sous 02. Projets/<client>/<projet>)
ALTER TABLE projects     ADD COLUMN IF NOT EXISTS kdrive_folder_id BIGINT;

-- id kDrive du fichier (remplace storage_path qui pointait sur le NAS)
ALTER TABLE project_files ADD COLUMN IF NOT EXISTS kdrive_file_id BIGINT;
