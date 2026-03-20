-- ─── Champs démontage sur la table projects ─────────────────────────────────

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS disassembly_date    DATE,
  ADD COLUMN IF NOT EXISTS disassembly_address TEXT,
  ADD COLUMN IF NOT EXISTS disassembly_time    TEXT,
  ADD COLUMN IF NOT EXISTS disassembly_contact TEXT,
  ADD COLUMN IF NOT EXISTS disassembly_notes   TEXT;
