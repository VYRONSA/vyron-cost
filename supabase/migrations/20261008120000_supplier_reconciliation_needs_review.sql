-- VOLORA — supplier statement reconciliation: allow the NEEDS_REVIEW line status.
--
-- WHY
-- The interpreted PDF statement path (src/lib/vyron-supplier-statement-match.ts) records a line as
-- NEEDS_REVIEW when the evidence does not settle a match — more than one VOLORA candidate after
-- leading zeros are ignored, references matching several invoices, or an amount and date that fit an
-- invoice numbered differently. Without this value such a line could only be stored under a status
-- that says something untrue ("missing", "matched").
--
-- Additive only: every existing status remains valid; no row is changed.
--
-- ROLLBACK (only if no NEEDS_REVIEW rows exist):
--   alter table public.vyron_supplier_reconciliation_lines drop constraint if exists vyron_supplier_reconciliation_lines_status;
--   alter table public.vyron_supplier_reconciliation_lines add constraint vyron_supplier_reconciliation_lines_status check (status in
--     ('MATCHED', 'MISSING_IN_VOLORA', 'TOTAL_DIFFERENCE', 'VAT_DIFFERENCE', 'DUPLICATE', 'CREDIT_NOTE', 'NOT_ON_SUPPLIER_DOCUMENT'));

alter table public.vyron_supplier_reconciliation_lines drop constraint if exists vyron_supplier_reconciliation_lines_status;
alter table public.vyron_supplier_reconciliation_lines add constraint vyron_supplier_reconciliation_lines_status check (status in
  ('MATCHED', 'MISSING_IN_VOLORA', 'TOTAL_DIFFERENCE', 'VAT_DIFFERENCE', 'DUPLICATE', 'CREDIT_NOTE', 'NOT_ON_SUPPLIER_DOCUMENT', 'NEEDS_REVIEW'));
