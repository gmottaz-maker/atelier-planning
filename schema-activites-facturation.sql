-- ═══════════════════════════════════════════════════════════════════════════
-- Activités : facturée à l'heure, ou pas
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Toutes les activités ne se facturent pas au temps passé. La CONDUITE se
-- facture au kilomètre, parfois au forfait pour les villes régulières :
-- facturer les heures passées dans la voiture, à deux ou trois, reviendrait
-- toujours trop cher au client. Les activités internes (entretien,
-- administratif, formation) ne se facturent pas du tout.
--
-- Leurs heures restent un COÛT — deux personnes dans la voiture, ce sont deux
-- salaires — et comptent donc dans la marge réelle. Mais elles ne se comparent
-- pas aux heures offertes, qui n'en prévoient jamais : un chantier paraîtrait
-- sinon hors budget de tout son temps de route.
ALTER TABLE activites ADD COLUMN IF NOT EXISTS facturee_heure BOOLEAN NOT NULL DEFAULT true;

UPDATE activites SET facturee_heure = false WHERE code = 11 OR famille = 'interne';

-- ── Rollback ───────────────────────────────────────────────────────────────
-- ALTER TABLE activites DROP COLUMN IF EXISTS facturee_heure;
