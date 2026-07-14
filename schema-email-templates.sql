-- Modèles de message pour l'envoi des offres / factures par e-mail.
CREATE TABLE IF NOT EXISTS email_templates (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  scope      TEXT DEFAULT 'all',   -- 'all' | 'devis' | 'facture'
  subject    TEXT,
  body       TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;  -- accès via routes API service-role
