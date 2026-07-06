-- Table pour les subscriptions push notifications
-- À exécuter dans Supabase → SQL Editor

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  endpoint TEXT UNIQUE NOT NULL,
  user_name TEXT NOT NULL,
  subscription TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS activée sans policy permissive : accès via routes API service-role.
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
