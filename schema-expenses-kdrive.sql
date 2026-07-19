-- Justificatifs (frais) : classement kDrive par trimestre, comme les factures
-- fournisseurs. On conserve receipt_path pour les anciens reçus stockés dans
-- Supabase Storage ; les nouveaux imports vont sur kDrive.

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS kdrive_file_id  BIGINT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS kdrive_filename TEXT;
