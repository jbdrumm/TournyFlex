# Current Schema Summary

Status: **VERIFIED against live Neon database (2026-06-11).** This reflects the
actual database, confirmed by querying `information_schema` directly — not the
SQL files, which had drifted. This file is the source of truth. The two SQL
files in `archive/` are historical reference only and are known to be stale.

Origin note: this schema was built for a **single annual 3-day outing** (the beta
test event). It predates the multi-segment, multi-event, account-based direction
in `CLAUDE.md`, `docs/side-games.md`, and `docs/account-less-players.md`. Those
docs describe a **target** the current schema does not yet support — see
"Design-doc gaps" at the end.

---

## Verified state (queried live, not from files)

**10 base tables, 0 views.** Full list:
`app_settings`, `course_holes`, `courses`, `event_groups`, `event_players`,
`events`, `group_players`, `players`, `round_scores`, `scramble_teams`.

Resolved during verification:
- The `scorecards` table **no longer exists** — it was dropped. There is no
  two-score-table ambiguity; `round_scores` is the single score of record.
- The `combined_stroke_totals` **view does not exist** in the live DB (no views
  at all). The earlier "view references missing columns" contradiction was a
  file-only artifact — the view was never live or was dropped.
- `round_scores` in the live DB has **14 columns**, not the 8 in the base SQL
  file. The live table is the evolved, correct shape; the files are stale.
- `app_settings` exists live but was **not in either SQL file** (drift). Contents
  TBD — carry over in migration.

---

## Tables

**courses** — `id`, `name` (unique), `city`, `state`, `par` (default 72),
`slope_rating`, `course_rating`, `created_at`. Test-event courses imported and
verified.

**course_holes** — 18 rows per course. `course_id` (FK), `hole_number` (1–18),
`par`, `handicap_rank` (1–18, per-hole **stroke index**, 1 = hardest), yardages
per tee. `handicap_rank` is the data **net scoring** needs — it exists. Good.

**events** — single-annual-outing model. `year` is **UNIQUE** (one event per
year). Per-day course FKs and tee times (fri/sat/sun + AM/PM), `active_round`,
`status`, `scores_locked`. Legacy `course_id` retained, unused.

**players** — `id`, `name`, `pin` (4-digit, unique), `created_at`.
**This is the entire identity model. No email, password, auth, account linkage,
or contact info.** Players identified by 4-digit PIN. Persistent roster.

**event_players** — players in an event. `event_id`, `player_id`, `tee_box`
(black/blue/white/red), unique `(event_id, player_id)`. Note: a tee concept
already exists here.

**round_scores** — **the single score of record.** 14 columns:
`id`, `event_id`, `player_id`, `course_id`, `day` (text), `round_time` (text),
`is_scramble` (bool), `hole_scores` (jsonb, per-hole detail), `holes_completed`
(int), `is_complete` (bool), `created_at`, `scramble_team_id`, `total_score`
(int), `score_vs_par` (int).
NOTE: `total_score` and `score_vs_par` are **separate first-class columns**
(not derived only from JSONB) — this **satisfies** the CLAUDE.md principle. The
`hole_scores` JSONB holds per-hole detail alongside them, which is a fine
pattern. **Leave this shape as-is in the migration.**

**scramble_teams** — `event_id`, `round`, `team_number`, `player_ids uuid[]`,
`finishing_positions integer[]`. Unique `(event_id, round, team_number)`.

**event_groups** — teesheet groups for morning rounds. `event_id`, `day`,
`group_number`.

**group_players** — players in a teesheet group. `group_id`, `player_id`.

**app_settings** — exists live, not in SQL files. Contents to confirm before
migration (likely config / active-event pointer / flags). Carry over.

---

## Score of record (settled)

`round_scores` is the **single** score of record. `scorecards` is dropped and
gone. Every side-game reader (`docs/side-games.md`) reads from `round_scores`.
The "one score written once, read many times" principle has one clear home.

---

## Design-doc gaps (target state the schema lacks — net-new work)

Not errors — the build gap between current state and launch design.

- **No account/auth layer.** `players` is PIN-only with no email/phone/auth.
  The login restructure (Supabase Auth: email+password, stay-logged-in, Google
  sign-in) and the `account-less-players.md` claim model are **net-new**. There
  is no contact column to build code-to-contact claim verification on yet.
- **Profile data has no home.** Planned `accounts` table (email, phone, age,
  gender, location, default tee) does not exist.
- **Single-event-per-year assumption.** `events.year` UNIQUE; whole model assumes
  one annual outing. Multi-event / league / casual directions require relaxing
  this.
- **No league tables.** Referenced in login/home design; absent from schema.
- **No side-game tables.** Three-bucket model (incl. `wolf_hole_state`) has no
  schema yet. All read from `round_scores`.
- **No stub/claim columns** on `players` (`account_id`, `invite_contact`,
  `claim_state`, `created_by_account_id`).
- **Net-scoring dependency partially met:** `course_holes.handicap_rank` exists
  for imported courses; the 42K bulk import must also carry per-hole stroke index.

---

## Migration note (Neon → Supabase)

Schema is clean and evolved, not a mess — migrate the live structure **as-is**,
verify parity, then layer net-new tables (accounts, leagues, side-games) on top.
Do not combine the migration with a redesign. Confirm `app_settings` contents and
`scorecards` absence (already confirmed gone) before cutover. See the migration
runbook.
