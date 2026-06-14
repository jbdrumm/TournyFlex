-- =============================================================================
-- Migration: merge_identity_into_players
-- Purpose:   Collapse accounts into players. Single-table identity model:
--            one player row per scoreable person; auth_user_id (nullable)
--            distinguishes stubs from signed-up users.
--
-- States the table now supports:
--   1. Stub (commissioner-added, side-game add, etc.): auth_user_id NULL.
--      Some/all profile fields may be NULL.
--   2. Backfill stub (Jacob's known PIN players): everything Jacob has on file
--      populated except auth_user_id. Becomes case 3 on first OTP login.
--   3. Signed up: auth_user_id set. Netlify signup function enforces that
--      phone/email/first_name/last_name/birthdate/gender/tos_accepted_at are
--      all populated at that boundary.
--
-- display_name:
--   Added as a STORED GENERATED COLUMN mirroring `name`. Zero code changes
--   needed today (existing reads/writes of `name` keep working unchanged).
--   New code (signup form, auth-aware reads) uses `display_name` for
--   clearer semantics. A future cleanup migration will deprecate `name`.
-- =============================================================================

alter table public.players
  add column auth_user_id           uuid unique references auth.users(id) on delete set null,
  add column phone                  text,
  add column email                  text,
  add column first_name             text,
  add column last_name              text,
  add column birthdate              date,
  add column gender                 text
    check (gender in ('male','female','nonbinary','prefer_not_to_say')),
  add column starter_handicap_index numeric(4,1),
  add column ghin_number            text,
  add column tos_accepted_at        timestamptz,
  add column marketing_opt_in       boolean not null default false,
  add column friend_privacy         text not null default 'shared_only'
    check (friend_privacy in ('shared_only','full')),
  add column is_demo                boolean not null default false,
  add column is_minor               boolean not null default false,
  add column updated_at             timestamptz not null default now();

-- display_name = mirror of name, auto-maintained by Postgres.
-- Read-only column; writes go to `name` (existing pattern), display_name follows.
alter table public.players
  add column display_name text generated always as (name) stored;

-- Partial unique indexes so NULL stub rows don't collide with each other.
create unique index players_phone_unique on public.players (phone)
  where phone is not null;
create unique index players_email_unique on public.players (email)
  where email is not null;

-- Reuse the updated_at trigger function from the reverted accounts migration.
create trigger trg_players_set_updated_at
  before update on public.players
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Post-apply housekeeping (run separately when Jacob has the demo player UUIDs):
-- -----------------------------------------------------------------------------
-- update public.players set is_demo = true where id in (
--   'demo-uuid-1', 'demo-uuid-2', 'demo-uuid-3', 'demo-uuid-4'
-- );

-- -----------------------------------------------------------------------------
-- Verification
-- -----------------------------------------------------------------------------
-- select column_name, data_type, is_nullable, is_generated
--   from information_schema.columns
--   where table_schema='public' and table_name='players'
--   order by ordinal_position;
-- Expect 20 columns including display_name (is_generated=ALWAYS).
--
-- select id, name, display_name from public.players limit 5;
-- Expect display_name to mirror name for every row.
--
-- select indexname from pg_indexes
--   where schemaname='public' and tablename='players';
-- Expect: players_pkey, players_phone_unique, players_email_unique,
--   plus the unique index Postgres auto-creates for auth_user_id UNIQUE.
--
-- select count(*) from public.players where auth_user_id is not null;
-- Expect: 0 (nobody has signed up yet).
