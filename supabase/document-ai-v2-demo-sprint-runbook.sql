-- VYRON COST — Document Intelligence Demo Sprint (Batch A)
-- Run ALL scripts below in Supabase SQL Editor IN ORDER (one file at a time).
-- Do not skip steps. Re-running uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS where possible.

--  1. document-ai-v2-phase1.sql
--  2. document-ai-v2-phase1b-missing-columns.sql
--  3. document-ai-v2-soft-delete.sql
--  4. document-ai-v2-field-regions.sql          (skip document-ai-v2-preview-regions.sql — deprecated)
--  5. document-ai-v2-workbench.sql
--  6. document-ai-v2-phase3-review-override.sql
--  7. document-ai-v2-supplier-learning-batch2.sql
--  8. document-ai-v2-phase1-completion.sql
--  9. document-ai-v2-phase1-batch3-price-archive.sql
-- 10. document-ai-v2-phase1-batch4-bulk-approval-rules.sql
-- 11. document-ai-v2-phase4-supplier-intelligence.sql

-- Optional (KPI: Potential Recovery Identified):
-- 12. demo-sprint-recovery-opportunities.sql

-- Batch B (Purchase Orders + GRN + 3-Way Matching):
-- 13. procurement-batch-b-po-grn-match.sql

-- Batch C (Inventory Intelligence):
-- 14. inventory-batch-c-intelligence.sql

-- Batch D (Manufacturing & Production Intelligence):
-- 15. manufacturing-batch-d-production.sql

-- Batch E (Executive Dashboard & AI Command Centre):
-- 16. executive-batch-e-command-centre.sql  (indexes only; no new tables)

-- Batch F (AI Procurement Manager):
-- 17. ai-procurement-manager-v1.sql  (if not already run)
-- 18. ai-procurement-batch-f.sql

-- Batch G (Supplier Intelligence Centre):
-- 19. supplier-batch-g-intelligence.sql

-- Batch H (Finance Intelligence, Executive Reporting & Board Packs):
-- 20. finance-batch-h-intelligence.sql

-- Phase 3 (Enterprise Controls, Compliance, Forecasting & Budget):
-- 21. enterprise-phase3-controls.sql

-- Phase 4 (AI Financial Intelligence & Executive Decision Platform):
-- 22. enterprise-phase4-ai-financial.sql

-- Phase 5 (VYRON FINANCE Intelligence Layer):
-- 23. enterprise-phase5-finance-intelligence.sql

-- Phase 6 (Enterprise Platform Architecture):
-- 24. enterprise-phase6-platform-architecture.sql

-- Phase 7 (Autonomous Business Intelligence):
-- 25. enterprise-phase7-autonomous-intelligence.sql

-- Demo schema catch-up (tables + columns — run before seed on ANY database):
-- 26a. vyron-cost-demo-schema-catchup.sql

-- Stabilisation schema repair (missing DI columns — safe to re-run):
-- 26b. stabilisation-schema-repair.sql

-- Full business-cycle demo (Handcrafted / pie company meeting):
-- 26. vyron-cost-demo-full-business-cycle.sql
--     (safe to re-run; tags rows demo_seed_key = vyron_cost_meeting_2026)
--     REQUIRED order: 26a → 26b → 26.

-- Verify core tables exist:
select
  exists (select 1 from information_schema.tables where table_name = 'vyron_documents') as documents,
  exists (select 1 from information_schema.tables where table_name = 'vyron_supplier_price_history') as price_history,
  exists (select 1 from information_schema.tables where table_name = 'vyron_document_approval_rules') as approval_rules,
  exists (select 1 from information_schema.tables where table_name = 'vyron_document_approval_audit') as approval_audit,
  exists (select 1 from information_schema.tables where table_name = 'vyron_document_approval_override_audit') as override_audit,
  exists (select 1 from information_schema.tables where table_name = 'vyron_supplier_line_item_mappings') as line_mappings;
