-- =============================================================================
-- Migration: drop_accounts_revert_a
-- Purpose:   Reverse Commit A (accounts table + players.account_id) in favor
--            of the merged single-table identity model. accounts has zero rows
--            and zero policies, so this is non-destructive.
-- Note:      Keeps the public.set_updated_at() function — it gets reused on
--            players in the next migration.
-- =============================================================================

-- Drop the FK column FIRST. This removes the players_account_id_fkey constraint
-- that depends on accounts; otherwise the accounts drop fails (2BP01).
alter table public.players drop column if exists account_id;

drop trigger if exists trg_accounts_set_updated_at on public.accounts;
drop table if exists public.accounts;

-- -----------------------------------------------------------------------------
-- Verification (expect: 0 rows for each)
-- -----------------------------------------------------------------------------
-- select count(*) from information_schema.tables
--   where table_schema='public' and table_name='accounts';
-- select count(*) from information_schema.columns
--   where table_schema='public' and table_name='players' and column_name='account_id';
