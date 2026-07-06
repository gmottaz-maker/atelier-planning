-- ─── Verrouillage sécurité (juillet 2026) ────────────────────────────────────
-- À exécuter dans le SQL Editor Supabase, EN DERNIER (après tous les autres
-- schémas). Contexte : la clé anon est publique dans le bundle client ; sans
-- RLS strict, n'importe qui peut lire/écrire la base en contournant l'app.
--
-- Après cette migration :
--   • toutes les tables ont RLS activé, aucune policy permissive ;
--   • seul le service_role (routes API, qui vérifient le JWT via
--     lib/requireAdmin.js) accède aux données ;
--   • unique exception : `profiles` en lecture pour les utilisateurs
--     connectés (_app.js lit le nom du profil avec la clé anon + JWT).

-- 1. Activer RLS sur toutes les tables du schéma public
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

-- 2. Supprimer toutes les policies permissives existantes
--    ("Accès public lecture/écriture", "USING (true)", etc.)
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END $$;

-- 3. Seule policy nécessaire côté client : lecture du profil par un
--    utilisateur connecté (les 3 comptes de l'équipe)
CREATE POLICY "profiles_select_authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);

-- ─── Dédoublonnage import bancaire ───────────────────────────────────────────
-- La contrainte UNIQUE(account_iban, booking_date, amount, end_to_end_id) ne
-- déduplique pas quand end_to_end_id est NULL (les NULL sont distincts en
-- Postgres), or beaucoup d'écritures CAMT (QR/ESR) n'en ont pas → réimporter
-- le même fichier créait des doublons. Cet index remplace le NULL par un hash
-- de description+contrepartie. Limite assumée : deux écritures réellement
-- identiques (même jour, même montant, même libellé, même contrepartie, sans
-- end-to-end id) seraient vues comme un doublon — cas quasi inexistant dans
-- un relevé réel.
CREATE UNIQUE INDEX IF NOT EXISTS bank_transactions_dedupe_idx
  ON public.bank_transactions (
    account_iban,
    booking_date,
    amount,
    COALESCE(end_to_end_id, md5(COALESCE(description, '') || COALESCE(counterparty_iban, '')))
  );
