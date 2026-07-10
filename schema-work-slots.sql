-- Plages de travail (planning manuel par demi-journée) — indépendant de Google Calendar.
CREATE TABLE IF NOT EXISTS work_slots (
  id         BIGSERIAL PRIMARY KEY,
  user_name  TEXT NOT NULL,                       -- personne affectée
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  label      TEXT,                                -- texte libre si pas de projet
  date       DATE NOT NULL,
  half       TEXT NOT NULL DEFAULT 'am',          -- 'am' | 'pm'
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS work_slots_lookup_idx ON work_slots(date, user_name);
ALTER TABLE work_slots ENABLE ROW LEVEL SECURITY;  -- accès via routes API service-role
