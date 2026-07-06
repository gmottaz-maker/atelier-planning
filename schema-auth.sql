-- ─── Profils utilisateurs ───────────────────────────────────────────────────
-- Lie chaque compte Supabase Auth à un nom interne (Arnaud, Gabin, Guillaume)

CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  name TEXT NOT NULL,  -- 'Arnaud' | 'Gabin' | 'Guillaume'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seule table lue côté client (par _app.js pour récupérer le nom) : on
-- autorise la lecture aux utilisateurs connectés, rien d'autre.
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_authenticated" ON profiles
  FOR SELECT TO authenticated USING (true);

-- ─── Journal d'activité ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS activity_log (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  actor       TEXT NOT NULL,         -- nom de la personne
  action      TEXT NOT NULL,         -- 'task_completed' | 'task_uncompleted' | 'task_created' | 'task_updated' | 'project_created' | 'project_updated'
  entity_type TEXT NOT NULL,         -- 'task' | 'project'
  entity_id   TEXT,
  entity_name TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- RLS activée sans policy permissive : accès via routes API service-role.
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
