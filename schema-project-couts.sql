-- ═══════════════════════════════════════════════════════════════════════════
-- Coûts réels d'un projet — ce qui a vraiment été dépensé
-- ═══════════════════════════════════════════════════════════════════════════
--
-- L'offre dit ce qu'on PRÉVOYAIT de dépenser (prix d'achat des matériaux,
-- coût de la sous-traitance). Cette table dit ce qu'on a PAYÉ. L'écart entre
-- les deux est ce que la rentabilité d'un projet cherche à rendre visible.
--
-- Des lignes plutôt qu'un total : un montant unique ne se vérifie pas, une
-- liste montre d'où vient chaque franc — et se corrige ligne par ligne.
--
-- Montants HORS TAXE : l'offre est HT, et la TVA payée sur les achats se
-- récupère. Comparer du TTC à du HT fausserait l'écart de 8,1 %.
--
-- Saisie manuelle, par choix : les factures fournisseurs ne sont rattachées
-- à aucun projet, et une facture couvre souvent plusieurs chantiers.
CREATE TABLE IF NOT EXISTS project_couts (
  id          BIGSERIAL PRIMARY KEY,
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  categorie   TEXT NOT NULL CHECK (categorie IN ('materiel', 'sous_traitance', 'autre')),
  libelle     TEXT NOT NULL CHECK (length(trim(libelle)) > 0),
  fournisseur TEXT,
  -- Négatif permis : un avoir fournisseur fait baisser le coût réel.
  montant_ht  NUMERIC(12, 2) NOT NULL CHECK (montant_ht <> 0),
  date        DATE,
  created_by  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_couts_projet_idx ON project_couts(project_id);

-- Prix d'achat et marges : lecture et écriture réservées à l'admin, par les
-- routes API en service-role.
ALTER TABLE project_couts ENABLE ROW LEVEL SECURITY;

-- ── Rollback ───────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS project_couts;
