-- Module bancaire : factures fournisseurs, factures émises, transactions bancaires
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Factures fournisseurs ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS supplier_invoices (
  id                BIGSERIAL PRIMARY KEY,
  supplier_name     TEXT NOT NULL,
  invoice_number    TEXT,
  amount            NUMERIC(12, 2) NOT NULL,
  currency          TEXT DEFAULT 'CHF',
  issue_date        DATE,
  due_date          DATE,
  payment_reference TEXT,                    -- réf ESR/QR pour matching
  iban              TEXT,                    -- compte du fournisseur
  category          TEXT,                    -- libre (matériel, services, etc.)
  notes             TEXT,
  kdrive_file_id    BIGINT,                  -- PDF stocké sur kDrive
  kdrive_filename   TEXT,
  status            TEXT DEFAULT 'pending',  -- pending | paid | overdue
  paid_transaction_id BIGINT,
  paid_at           TIMESTAMPTZ,
  created_by        TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS supplier_invoices_status_idx ON supplier_invoices(status);
CREATE INDEX IF NOT EXISTS supplier_invoices_due_date_idx ON supplier_invoices(due_date);

-- ── Factures émises (générées depuis les projets) ────────────────────────────
CREATE TABLE IF NOT EXISTS customer_invoices (
  id              BIGSERIAL PRIMARY KEY,
  project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
  invoice_number  TEXT UNIQUE NOT NULL,      -- ex: 2026-001
  client_name     TEXT NOT NULL,
  client_address  TEXT,
  amount          NUMERIC(12, 2) NOT NULL,
  currency        TEXT DEFAULT 'CHF',
  issue_date      DATE NOT NULL,
  due_date        DATE,
  qr_reference    TEXT,                      -- ref QR-bill (27 chiffres)
  iban_recipient  TEXT,                      -- IBAN sur lequel recevoir
  status          TEXT DEFAULT 'pending',    -- pending | paid | overdue | cancelled
  paid_transaction_id BIGINT,
  paid_at         TIMESTAMPTZ,
  pdf_kdrive_id   BIGINT,
  quote_snapshot  JSONB,                     -- copie figée du devis à l'émission
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_invoices_status_idx ON customer_invoices(status);
CREATE INDEX IF NOT EXISTS customer_invoices_project_idx ON customer_invoices(project_id);

-- ── Transactions bancaires importées (CAMT.053) ──────────────────────────────
CREATE TABLE IF NOT EXISTS bank_transactions (
  id                  BIGSERIAL PRIMARY KEY,
  account_iban        TEXT,                  -- IBAN du compte
  booking_date        DATE NOT NULL,
  value_date          DATE,
  amount              NUMERIC(12, 2) NOT NULL,  -- + = crédit (entrée), - = débit (sortie)
  currency            TEXT DEFAULT 'CHF',
  description         TEXT,                  -- libellé brut
  reference           TEXT,                  -- ref structurée (ESR/QR/etc.)
  counterparty_name   TEXT,                  -- nom de la contrepartie
  counterparty_iban   TEXT,
  end_to_end_id       TEXT,                  -- end-to-end ID CAMT
  -- matching
  matched_to_type     TEXT,                  -- supplier_invoice | customer_invoice | expense | manual_note
  matched_to_id       BIGINT,
  matched_at          TIMESTAMPTZ,
  matched_by          TEXT,
  match_confidence    NUMERIC(3, 1),         -- 0-10 score auto, NULL si match manuel
  notes               TEXT,
  raw                 JSONB,                 -- bloc CAMT brut pour debug
  import_id           TEXT,                  -- regroupe les transactions d'un même import
  imported_at         TIMESTAMPTZ DEFAULT NOW(),

  -- Évite les doublons : même montant + date + référence + compte
  UNIQUE(account_iban, booking_date, amount, end_to_end_id)
);

CREATE INDEX IF NOT EXISTS bank_transactions_date_idx ON bank_transactions(booking_date DESC);
CREATE INDEX IF NOT EXISTS bank_transactions_matched_idx ON bank_transactions(matched_to_type, matched_to_id);
CREATE INDEX IF NOT EXISTS bank_transactions_unmatched_idx ON bank_transactions(booking_date DESC) WHERE matched_to_type IS NULL;
