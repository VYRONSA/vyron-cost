-- VYRON COST — Batch F: AI Procurement Manager (enhancements)
-- Run after: ai-procurement-manager-v1.sql (and demo sprint batches B–E)

alter table public.vyron_procurement_recommendations
  add column if not exists source_type text,
  add column if not exists source_recovery_key text,
  add column if not exists problem_statement text,
  add column if not exists cause_statement text;

create index if not exists idx_vyron_procurement_rec_source
  on public.vyron_procurement_recommendations(tenant_id, source_type, source_recovery_key);

comment on column public.vyron_procurement_recommendations.source_type is
  'price_history | purchase_order | grn | invoice | inventory | production | recovery';
