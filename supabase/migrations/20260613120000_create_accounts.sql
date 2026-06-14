-- =============================================================================
-- Migration: create_accounts
-- Purpose:   Create the `accounts` table — primary identity for TournyFlex users.
--            Linked 1:1 to auth.users (Supabase Auth + phone OTP via Twilio).
--            See docs/auth-login.md for field rationale.
--
-- Why no RLS policy added here:
--   RLS is ENABLED but no policies are created. The table is therefore LOCKED
--   to anon/REST clients by default. Netlify functions use the DATABASE_URL
--   service-role connection which bypasses RLS, so server-side signup writes
--   continue to work. Proper account-scoped policies land in a later migration.
--
-- Why gen_random_uuid() and not uuid_generate_v4():
--   Avoids the uuid-ossp schema trap recorded in docs/migration-runbook.md.
-- =============================================================================

create table public.accounts (
  id                       uuid primary key default gen_random_uuid(),
  auth_user_id             uuid not null unique references auth.users(id) on delete cascade,

  -- Contact / identity
  phone                    text not null unique,
  email                    text not null unique,
  first_name               text not null,
  last_name                text not null,
  display_name             text not null,
  birthdate                date not null,

  -- Golf attributes
  gender                   text not null
    check (gender in ('male','female','nonbinary','prefer_not_to_say')),
  starter_handicap_index   numeric(4,1),
  ghin_number              text,

  -- Legal / privacy
  tos_accepted_at          timestamptz not null,
  marketing_opt_in         boolean not null default false,
  friend_privacy           text not null default 'shared_only'
    check (friend_privacy in ('shared_only','full')),

  -- Audit
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- updated_at trigger (reusable; later migrations can attach to other tables)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_accounts_set_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();

-- Lock by default. Policies come in the RLS-tightening migration.
alter table public.accounts enable row level security;

-- -----------------------------------------------------------------------------
-- Verification (run after the migration; expect: 1 row, rowsecurity=t, 0 policies)
-- -----------------------------------------------------------------------------
-- select tablename, rowsecurity
--   from pg_tables where schemaname='public' and tablename='accounts';
-- select count(*) as policy_count
--   from pg_policies where schemaname='public' and tablename='accounts';
-- select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_schema='public' and table_name='accounts'
--   order by ordinal_position;
