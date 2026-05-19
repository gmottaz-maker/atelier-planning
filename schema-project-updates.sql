-- Mises à jour de projet (timeline)
CREATE TABLE IF NOT EXISTS project_updates (
  id              BIGSERIAL PRIMARY KEY,
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author          TEXT NOT NULL,
  content         TEXT NOT NULL,
  image_kdrive_id BIGINT,
  image_filename  TEXT,
  image_mime_type TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_updates_project_id_idx
  ON project_updates(project_id, created_at DESC);
