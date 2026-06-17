-- Execution Centre: per-action audit trail (non-breaking additive column)

alter table if exists public.execution_actions
  add column if not exists action_events jsonb not null default '[]'::jsonb;
