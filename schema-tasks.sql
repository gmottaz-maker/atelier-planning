-- Table des tâches — Amazing Lab Planning
-- À exécuter dans Supabase → SQL Editor

CREATE TABLE IF NOT EXISTS tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  responsible TEXT NOT NULL DEFAULT 'Arnaud',
  execution_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE, -- date d'échéance optionnelle (prend le dessus sur execution_date pour le décompte)
  is_private BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acces public lecture tasks" ON tasks FOR SELECT USING (true);
CREATE POLICY "Acces public ecriture tasks" ON tasks FOR ALL USING (true);
