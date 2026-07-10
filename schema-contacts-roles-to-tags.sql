-- Fond les rôles is_customer / is_supplier dans les tags (« Client » / « Fournisseur »).
-- Idempotent (le NOT ... = ANY évite les doublons). À exécuter une fois dans Supabase.
UPDATE contacts SET tags = array_append(COALESCE(tags,'{}'), 'Client')
  WHERE is_customer IS TRUE AND NOT ('Client' = ANY(COALESCE(tags,'{}')));
UPDATE contacts SET tags = array_append(COALESCE(tags,'{}'), 'Fournisseur')
  WHERE is_supplier IS TRUE AND NOT ('Fournisseur' = ANY(COALESCE(tags,'{}')));
