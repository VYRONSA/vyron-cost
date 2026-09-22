-- VOLORA Order Engine — channel activation.
--
-- NOT APPLIED to production. Requires 20260922120000, 20260922130000,
-- 20260923120000 and 20260923140000. Additive only.
--
-- A channel (manual, CSV, Excel, e-mail, PDF, web store) is activated in
-- stages, per tenant and per channel:
--
--   DISABLED -> CONFIGURED -> READY_FOR_UAT -> UAT_PASSED
--            -> READY_FOR_ACTIVATION -> ACTIVE  (and ACTIVE <-> SUSPENDED)
--
-- Holding credentials never activates anything: ACTIVE is a recorded human
-- decision, and the engine additionally checks the channel's own readiness
-- conditions before it accepts work through a connector. One channel's state
-- says nothing about another's, so a broken integration cannot disable the
-- rest.
--
-- Rollback:
--   alter table public.vyron_order_channel_settings
--     drop column if exists channel_type, drop column if exists activation_state,
--     drop column if exists activated_at, drop column if exists activated_by,
--     drop column if exists suspended_reason, drop column if exists uat_passed_at,
--     drop column if exists uat_reference, drop column if exists last_success_at,
--     drop column if exists last_failure_at, drop column if exists last_failure_reason,
--     drop column if exists first_live_intake_id, drop column if exists first_live_at;
--   alter table public.vyron_order_engine_settings drop column if exists refund_treatment;

-- ---------------------------------------------------------------------------
-- 1. Channels become the activation record for every source
-- ---------------------------------------------------------------------------

alter table public.vyron_order_channel_settings add column if not exists channel_type text not null default 'web_store';
alter table public.vyron_order_channel_settings add column if not exists activation_state text not null default 'DISABLED';
alter table public.vyron_order_channel_settings add column if not exists activated_at timestamptz null;
alter table public.vyron_order_channel_settings add column if not exists activated_by text null;
alter table public.vyron_order_channel_settings add column if not exists suspended_reason text null;
alter table public.vyron_order_channel_settings add column if not exists uat_passed_at timestamptz null;
alter table public.vyron_order_channel_settings add column if not exists uat_reference text null;
alter table public.vyron_order_channel_settings add column if not exists last_success_at timestamptz null;
alter table public.vyron_order_channel_settings add column if not exists last_failure_at timestamptz null;
alter table public.vyron_order_channel_settings add column if not exists last_failure_reason text null;
-- The first order a live channel produced: proof the whole path was walked once.
alter table public.vyron_order_channel_settings add column if not exists first_live_intake_id uuid null;
alter table public.vyron_order_channel_settings add column if not exists first_live_at timestamptz null;

alter table public.vyron_order_channel_settings drop constraint if exists vyron_order_channel_settings_type;
alter table public.vyron_order_channel_settings add constraint vyron_order_channel_settings_type
  check (channel_type in ('manual', 'csv', 'xlsx', 'email', 'pdf', 'web_store'));

alter table public.vyron_order_channel_settings drop constraint if exists vyron_order_channel_settings_state;
alter table public.vyron_order_channel_settings add constraint vyron_order_channel_settings_state
  check (activation_state in ('DISABLED', 'CONFIGURED', 'READY_FOR_UAT', 'UAT_PASSED', 'READY_FOR_ACTIVATION', 'ACTIVE', 'SUSPENDED'));

-- Activation is a recorded decision: who and when, together.
alter table public.vyron_order_channel_settings drop constraint if exists vyron_order_channel_settings_activation_pair;
alter table public.vyron_order_channel_settings add constraint vyron_order_channel_settings_activation_pair
  check ((activated_at is null) = (activated_by is null));
alter table public.vyron_order_channel_settings drop constraint if exists vyron_order_channel_settings_active_has_activation;
alter table public.vyron_order_channel_settings add constraint vyron_order_channel_settings_active_has_activation
  check (activation_state <> 'ACTIVE' or (activated_at is not null and activated_by is not null));
alter table public.vyron_order_channel_settings drop constraint if exists vyron_order_channel_settings_suspended_reason;
alter table public.vyron_order_channel_settings add constraint vyron_order_channel_settings_suspended_reason
  check (activation_state <> 'SUSPENDED' or btrim(coalesce(suspended_reason, '')) <> '');

create index if not exists idx_vyron_order_channel_settings_state
  on public.vyron_order_channel_settings (company_id, channel_type, activation_state);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vyron_order_channel_settings_first_live_same_company') then
    alter table public.vyron_order_channel_settings
      add constraint vyron_order_channel_settings_first_live_same_company
      foreign key (first_live_intake_id, company_id) references public.vyron_order_intakes (id, company_id) on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The last web-store decision that had no home: refunds
-- ---------------------------------------------------------------------------

alter table public.vyron_order_engine_settings add column if not exists refund_treatment text null;
alter table public.vyron_order_engine_settings drop constraint if exists vyron_order_engine_settings_refund;
alter table public.vyron_order_engine_settings add constraint vyron_order_engine_settings_refund
  check (refund_treatment is null or refund_treatment in ('never_netted', 'credit_note', 'reject_order'));
