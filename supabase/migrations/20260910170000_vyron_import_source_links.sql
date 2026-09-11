-- Import source links: where every imported record came from.
--
-- WHY THIS TABLE IS NEEDED
-- No VYRON master table (suppliers, ingredients, products, BOMs, stock items)
-- carries an external or source identifier, and only stock items have a unique
-- natural key. Without one, a re-run of a client import cannot tell "already
-- imported" from "new", and no imported row can be traced back to the file and
-- row it came from. This table is that identifier, kept beside the master data
-- rather than bolted onto every master table.
--
-- One row per (tenant, source system, source entity, source key). The unique
-- key is what makes a re-run idempotent: the first rung of the matching ladder
-- looks here before any SKU or name comparison.
--
-- Additive only: creates one table and its indexes. Changes no existing table.
-- company_id cascades like vyron_import_runs.company_id, so removing a tenant
-- never leaves its links behind.

create table if not exists public.vyron_import_source_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  source_system text not null,
  source_entity text not null,
  source_key text not null,
  entity_type text not null,
  entity_id uuid not null,
  import_run_id uuid null,
  source_file text null,
  source_file_sha256 text null,
  source_sheet text null,
  source_row integer null,
  content_hash text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vyron_import_source_links_key unique (company_id, source_system, source_entity, source_key),
  constraint vyron_import_source_links_source_key_not_blank check (btrim(source_key) <> '')
);

create index if not exists idx_vyron_import_source_links_entity
  on public.vyron_import_source_links (company_id, entity_type, entity_id);

create index if not exists idx_vyron_import_source_links_run
  on public.vyron_import_source_links (import_run_id);

alter table public.vyron_import_source_links enable row level security;
