-- =============================================================================
-- Migration: add_players_account_id
-- Purpose:   Link players to accounts. A claim = setting account_id on an
--            existing row. Scores never re-point. See docs/account-less-players.md.
--
-- Why nullable:
--   The 26 existing players are PIN-only test-event stubs. They stay NULL
--   until real users claim them (claim flow is a follow-up build).
--
-- Why ON DELETE SET NULL:
--   Account deletion should not cascade-delete the player row — the history
--   and scores remain attached, the row reverts to a stub (matches the
--   "unlinking on dispute" pattern in account-less-players.md).
-- =============================================================================

alter table public.players
  add column account_id uuid references public.accounts(id) on delete set null;

comment on column public.players.account_id is
  'NULL = stub (PIN-era or scorekeeper-created). Set when an account claims this row. Scores never re-point.';

-- -----------------------------------------------------------------------------
-- Verification (expect: column exists, type uuid, is_nullable=YES, fk to accounts.id)
-- -----------------------------------------------------------------------------
-- select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_schema='public' and table_name='players' and column_name='account_id';
--
-- select count(*) as null_account_id_count
--   from public.players where account_id is null;
-- -- Should equal total players count (no claims have happened yet).
