-- Sync Maze → Todoist : on stocke l'id de la tâche Todoist liée
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS todoist_id TEXT;
