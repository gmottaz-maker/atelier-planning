-- ─── Bucket `receipts` en privé (juillet 2026) ───────────────────────────────
-- À exécuter dans le SQL Editor Supabase, APRÈS avoir déployé le code qui
-- génère des URLs signées (lib/receipts.js + routes expenses).
--
-- Avant : les reçus étaient servis via /object/public/receipts/... — l'URL
-- contenait juste `userName/timestamp.ext`, donc devinable sans authentification.
-- Après : le bucket est privé ; l'app génère des URLs signées à durée limitée
-- (le service-role dans les routes API n'est pas affecté par RLS).
--
-- Réversible : remettre `public = true` restaure l'ancien comportement.

UPDATE storage.buckets SET public = false WHERE id = 'receipts';

-- Note : aucune policy storage.objects n'est nécessaire pour l'app — tous les
-- accès (upload, suppression, signature d'URL) passent par le client
-- service-role, qui contourne RLS. Les URLs signées sont validées par le
-- service Storage lui-même, indépendamment des policies.
