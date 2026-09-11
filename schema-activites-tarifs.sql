-- ═══════════════════════════════════════════════════════════════════════════
-- Activités : tarif de vente et coût de revient à l'heure
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Une heure de CNC ne se vend pas et ne coûte pas comme une heure de conduite.
--
--   tarif_vente   ce qu'on facture une heure de cette activité ;
--   cout_revient  ce qu'elle nous coûte : salaire, charges, machine, part des
--                 frais généraux. C'est lui qui donne la marge réelle.
--
-- NULL veut dire « pas encore renseigné », jamais zéro : un coût inconnu
-- compté à zéro gonflerait la marge en silence (même règle que les prix de
-- peinture, cf. CLAUDE.md).
--
-- Le coût de revient n'est lu que par l'admin : la route /api/activites ne le
-- sélectionne pas pour un membre.
ALTER TABLE activites ADD COLUMN IF NOT EXISTS tarif_vente  NUMERIC(10, 2)
  CHECK (tarif_vente IS NULL OR tarif_vente >= 0);
ALTER TABLE activites ADD COLUMN IF NOT EXISTS cout_revient NUMERIC(10, 2)
  CHECK (cout_revient IS NULL OR cout_revient >= 0);

-- ── Rollback ───────────────────────────────────────────────────────────────
-- ALTER TABLE activites DROP COLUMN IF EXISTS tarif_vente, DROP COLUMN IF EXISTS cout_revient;
