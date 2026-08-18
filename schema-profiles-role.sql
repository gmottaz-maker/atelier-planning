-- ─── Rôles explicites sur les profils ───────────────────────────────────────
--
-- Le rôle administrateur était déduit du NOM ('Guillaume') et, côté client, de
-- l'adresse e-mail. Renommer un profil changeait donc ses permissions, et la
-- règle était dupliquée entre le serveur et le navigateur.
--
-- Idempotent : peut être rejoué sans effet.
--
-- ORDRE DE DÉPLOIEMENT : exécuter CE SCRIPT AVANT de déployer le code.
-- Le code sait retomber sur l'ancien contrôle par nom si la colonne est
-- absente, mais l'inverse n'est pas vrai — un rôle posé sans code qui le lit
-- ne protège rien.
--
-- ROLLBACK : ALTER TABLE profiles DROP COLUMN role;
--            (le code reprend alors le contrôle par nom, sans interruption)

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member';

-- Valeurs contrôlées. 'display' est réservé à un éventuel compte d'écran mural.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_role_check'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_role_check CHECK (role IN ('member', 'admin', 'display'));
  END IF;
END $$;

-- Bascule du profil administrateur existant. C'est la seule ligne à adapter si
-- l'administrateur change : le reste du code ne connaît plus que le rôle.
UPDATE profiles SET role = 'admin' WHERE name = 'Guillaume' AND role <> 'admin';

-- Vérification à lire après exécution : une seule ligne 'admin' attendue.
--   SELECT name, role FROM profiles ORDER BY role, name;
