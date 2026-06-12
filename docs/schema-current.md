# Current Schema Summary

Status: **VERIFIED against live Neon (June 2026)** for the points below. Table
list, `round_scores` columns, and the `scorecards`/view questions are confirmed
by direct query. Remaining unknowns are flagged. This file is the source of
truth for the database; the SQL files in `archive/` are historical reference only
and are known to be **stale** (they understate `round_scores` and still describe
a dropped table).

Origin note: this schema was built for a **single annual 3-day outing** (the beta
test event), now inactive. It predates the multi-segment, multi-event,
account-based direction in `CLAUDE.md` and the design docs. Several docs describe
a **target** the current schema does not yet support — see "Design-doc gaps."

---

## Verified live tables (10)

Confirmed by `information_schema.tables`, June 2026:

1. **courses**
2. **course_holes** — includes `handicap_rank` (per-hole stroke index 1–18).
   This is the data net scoring needs; it exists.
3. **events**
4. **players** — PIN-only identity (`id`, `name`, `pin`, `created_at`).
   No email/password/auth. This is the entire identity model today.
5. **event_players**
6. **event_groups** (v2)
7. **group_players** (v2)
8. **scramble_teams**
9. **round_scores** — the single score of record (see below).
10. **app_settings** — **was NOT in either SQL file.** Live but undocumented.
    Verified: a key/value store (`key text`, `value text`), **2 rows**, holding
    admin-toggleable boolean settings. The DB-side realization of "global state
    lives in the DB, not localStorage." The 2 known keys:
    - `hide_scramble_board` — admin hides the scramble leaderboard until all
      teams finish (so groups can't see standings mid-round). This is an existing
      production pattern for "admin toggles board visibility" — the side-game
      scramble reader should REUSE this pattern, not invent a parallel one
      (consistent with the default-closed visibility rule in CLAUDE.md).
    - `show_sponsor` — toggles the sponsor image on/off. This is existing
      advertising infrastructure; the Title/Event Sponsor ad model builds on it.
      Placement rule still applies: never on the active scorecard.

    **Multi-event gap:** `app_settings` is currently FLAT/GLOBAL, but both keys
    are conceptually PER-EVENT (each admin toggles their own event). This works
    only because there is one annual event today. Going multi-event requires
    moving these to a per-event scope. Migrate as-is now; refactor to per-event
    before multi-event launch. (Another instance of the single-event assumption
    baked into the schema.)

**Resolved (no longer concerns):**
- `scorecards` — **does not exist.** Already dropped. The v2 migration's
  commented-out `DROP TABLE scorecards` (or equivalent) was applied. There is
  **no two-score-table ambiguity** — `round_scores` is the sole score of record.
- `combined_stroke_totals` view — **not present** in the public table/view list.
  Either dropped, never created, or in another schema. Confirm during dump; not
  a blocker.

---

## round_scores — the score of record (VERIFIED, 14 columns)

The live table is far richer than the SQL files describe. Confirmed columns:

| Column | Type | Null | Default |
|---|---|---|---|
| id | uuid | NO | uuid_generate_v4() |
| event_id | uuid | YES | |
| player_id | uuid | YES | |
| course_id | uuid | YES | |
| day | text | NO | |
| round_time | text | NO | |
| is_scramble | boolean | NO | false |
| hole_scores | jsonb | YES | '{}' |
| holes_completed | integer | YES | 0 |
| is_complete | boolean | YES | false |
| created_at | timestamptz | YES | now() |
| scramble_team_id | uuid | YES | |
| total_score | integer | YES | |
| score_vs_par | integer | YES | |

**Key findings:**
- **`score_vs_par` already exists as its own column**, alongside `total_score`
  and `hole_scores`. The CLAUDE.md principle (hole scores / total / vs-par are
  separate columns, never one JSONB blob) is **already satisfied here.** The
  earlier "JSONB violates the principle" concern applied to the old `scorecards`
  table, which is gone.
- `hole_scores` (jsonb) coexists with the promoted `total_score` /
  `score_vs_par` columns. This is a **sound pattern**, not a violation: per-hole
  detail in JSONB for flexible read, while the two derived values everything
  queries against are first-class indexed columns. **Leave this shape as-is in
  the migration.**
- Scramble support is built in (`is_scramble`, `scramble_team_id`), consistent
  with the side-games "scramble writes a team score" rule.

---

## Net-scoring dependency status

- `course_holes.handicap_rank` (per-hole stroke index) **exists** — the data net
  scoring needs is present for imported courses. Good.
- The 42K bulk import must also carry per-hole stroke index for net to work
  app-wide (see `docs/side-games.md`: net is a fast-follow).

---

## Outstanding verifications

- **`app_settings`** — DONE: key/value text, 2 rows (see above).
- **`round_scores` row count** — DONE: **487 rows** (test-event data present).
- **`combined_stroke_totals` view** — confirm dropped vs. elsewhere, during dump.
  (Only remaining item; not a blocker.)

## Data volume (for migration sizing)

Small dataset — migrate-now is low risk. round_scores 487 rows; app_settings
2 rows; remaining tables (courses, course_holes, events, players, etc.) are
test-event scale. The entire DB is well within any free-tier import.

---

## Design-doc gaps (target vs. current — not errors, just the build gap)

- **No account/auth layer.** `players` is PIN-only. Supabase Auth + the
  account/profile model + the `account-less-players.md` claim flow are all
  **net-new**. (See `docs/auth-login.md` once written.)
- **Single-event-per-year assumption.** `events.year` is UNIQUE; the model
  assumes one annual outing. Multi-event / league / casual directions require
  relaxing this.
- **No league tables.** Referenced in the home/login design; absent from schema.
- **No side-game tables.** The three-bucket model (incl. `wolf_hole_state`) has
  no schema yet.
- **No stub/claim columns** on `players` (account_id, invite_contact,
  claim_state, etc.).
- **Score of record is SETTLED:** `round_scores`, single table, already has
  `score_vs_par`. This gap is now CLOSED — side-game readers have a clean,
  unambiguous source.

---

## Migration context (Neon → Supabase)

Decision: migrate data Neon → Supabase now (dataset is at minimum size; beta
group inactive; no live traffic to disrupt). The schema turned out **clean and
evolved**, not messy — the "contradictions" were all documentation drift. Plan:
migrate the live structure **as-is**, archive/skip the already-dropped
`scorecards`, verify parity, then layer auth. Do not combine migration with
redesign. See `docs/migration-runbook.md`.
