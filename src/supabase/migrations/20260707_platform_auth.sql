-- Platform authentication foundation for Developer Centre
-- Idempotent and production-oriented migration.

-- 1) Shared timestamp trigger function for platform auth tables.
create or replace function public.vyron_platform_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 2) Platform users (authorization source for developer roles).
create table if not exists public.vyron_platform_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role text not null check (role in ('PLATFORM_ADMIN', 'PLATFORM_OPERATOR', 'PLATFORM_AUDITOR')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_vyron_platform_users_email
  on public.vyron_platform_users (lower(email));

create index if not exists idx_vyron_platform_users_role_active
  on public.vyron_platform_users (role, is_active);

-- 3) Platform sessions (server-managed developer sessions).
create table if not exists public.vyron_platform_sessions (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('PLATFORM_ADMIN', 'PLATFORM_OPERATOR', 'PLATFORM_AUDITOR')),
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz null,
  updated_at timestamptz not null default now(),
  constraint vyron_platform_sessions_expires_after_created
    check (expires_at >= created_at)
);

create index if not exists idx_vyron_platform_sessions_user_id
  on public.vyron_platform_sessions (user_id);

create index if not exists idx_vyron_platform_sessions_expires_at
  on public.vyron_platform_sessions (expires_at);

create index if not exists idx_vyron_platform_sessions_revoked_at
  on public.vyron_platform_sessions (revoked_at);

-- 4) Platform auth audit trail.
create table if not exists public.vyron_platform_auth_audit (
  id bigserial primary key,
  event_type text not null,
  success boolean not null,
  user_id uuid null references auth.users(id) on delete set null,
  email text null,
  role text null,
  detail text null,
  ip_address text null,
  user_agent text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_vyron_platform_auth_audit_created_at
  on public.vyron_platform_auth_audit (created_at desc);

create index if not exists idx_vyron_platform_auth_audit_user_id
  on public.vyron_platform_auth_audit (user_id, created_at desc);

create index if not exists idx_vyron_platform_auth_audit_email
  on public.vyron_platform_auth_audit (lower(email), created_at desc);

create index if not exists idx_vyron_platform_auth_audit_event_type
  on public.vyron_platform_auth_audit (event_type, created_at desc);

-- 5) Triggers for updated_at maintenance.
drop trigger if exists trg_vyron_platform_users_updated_at on public.vyron_platform_users;
create trigger trg_vyron_platform_users_updated_at
before update on public.vyron_platform_users
for each row
execute function public.vyron_platform_set_updated_at();

drop trigger if exists trg_vyron_platform_sessions_updated_at on public.vyron_platform_sessions;
create trigger trg_vyron_platform_sessions_updated_at
before update on public.vyron_platform_sessions
for each row
execute function public.vyron_platform_set_updated_at();

-- 6) Row Level Security (strict: service role only).
alter table public.vyron_platform_users enable row level security;
alter table public.vyron_platform_sessions enable row level security;
alter table public.vyron_platform_auth_audit enable row level security;

drop policy if exists "platform_users_service_role_all" on public.vyron_platform_users;
create policy "platform_users_service_role_all"
  on public.vyron_platform_users
  for all
  to public
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "platform_sessions_service_role_all" on public.vyron_platform_sessions;
create policy "platform_sessions_service_role_all"
  on public.vyron_platform_sessions
  for all
  to public
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "platform_auth_audit_service_role_all" on public.vyron_platform_auth_audit;
create policy "platform_auth_audit_service_role_all"
  on public.vyron_platform_auth_audit
  for all
  to public
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 7) Bootstrap first platform admin from existing Supabase Auth user.
with target_user as (
  select id, lower(email) as email
  from auth.users
  where lower(email) = lower('315para@gmail.com')
  limit 1
),
upsert_by_email as (
  update public.vyron_platform_users p
     set user_id = t.id,
         email = t.email,
         role = 'PLATFORM_ADMIN',
         is_active = true,
         updated_at = now()
    from target_user t
   where lower(p.email) = t.email
  returning p.user_id
)
insert into public.vyron_platform_users (user_id, email, role, is_active)
select t.id, t.email, 'PLATFORM_ADMIN', true
from target_user t
where not exists (
  select 1
  from public.vyron_platform_users p
  where p.user_id = t.id or lower(p.email) = t.email
);
