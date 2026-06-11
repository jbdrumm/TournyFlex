# Current Schema Summary

Status: **DRAFT — reconstructed from `schema.sql` + `schema-v2-migration.sql`,
NOT yet verified against the live Neon database.** See "Known contradictions"
below — the SQL files are known to disagree with the live DB in at least one
place, so **verify against Neon before trusting this for any build.**

This doc is the human-readable description of the database. The two SQL files are
kept as the historical migration record (see `archive/`). When the live schema is
confirmed, this file becomes the source of truth and the SQL files are reference
only.

Origin note: this schema was built for a **single annual 3-day outing** (the beta
test event). It predates the multi-segment, multi-event, account-based direction
in `CLAUDE.md`, `docs/side-games.md`, and `docs/account-less-players.md`. Several
design docs therefore describe a **target** the current schema does not yet
support — those gaps are flagged in "Design-doc gaps" at the end.

---

## Tables (as written in the SQL files)

**courses** — `id`, `name` (unique), `city`, `state`, `par` (default 72),
`slope_rating`, `course_rating`, `created_at`. Test-event courses imported and
verified.

**course_holes** — 18 rows per course. `id`, `course_id` (FK, cascade),
`hole_number` (1–18), `par` (3–5), `handicap_rank` (1–18, 1 = hardest),
`yardage_black/blue/white/red`, unique on `(course_id, hole_number)`.
NOTE: `handicap_rank` is the **per-hole stroke index** — this is the data net
scoring needs (see side-games doc). It exists. Good.

**events** — base: `id`, `year` (unique), `name`, `course_id` (FK),
`event_date`, `morning_tee_time`, `afternoon_tee_time`, `player_count`
(16/20/24), `status`, `scores_locked`, `created_at`.
v2 added: per-day course FKs (`friday_course_id`, `saturday_course_id`,
`sunday_course_id`, plus `friday_pm_course_id`, `saturday_pm_course_id`), per-day
tee times, `active_round` (enum of fri/sat/sun + morning/afternoon), and a
rewritten `status` check for the 3-day flow. `course_id` retained for backward
compat but unused. `year` is UNIQUE — i.e. **one event per year**, an outing-only
assumption.

**players** — `id`, `name`, `pin` (4-digit, unique), `created_at`.
**This is the entire identity model.** No email, no password, no auth, no
account linkage. Players are identified by a 4-digit PIN. Persistent roster
across years.

**event_players** — join of players to an event. `id`, `event_id`, `player_id`,
`tee_box` (black/blue/white/red), unique `(event_id, player_id)`.

**scorecards** — hole-by-hole for a round. `id`, `event_id`, `player_id`,
`hole_scores jsonb` (e.g. `{"1":4,"2":5}`), `total_score`, `holes_completed`,
`is_complete`, `submitted_at`, timestamps, unique `(event_id, player_id)`. Has an
`updated_at` trigger.

**scramble_teams** — `id`, `event_id`, `team_number`, `player_ids uuid[]`
(array of 4), `finishing_positions integer[]`. v2 added `round`
(fri/sat afternoon, sun morning) and changed uniqueness to
`(event_id, round, team_number)`.

**round_scores** — base: `id`, `event_id`, `player_id`, `course_id`, `day`
(fri/sat/sun), `round_time` (morning/afternoon), `is_scramble`, `score` (single
integer: gross strokes, or over/under par for scrambles), unique
`(event_id, player_id, course_id, day, round_time)`. v2 added `scramble_team_id`
and `submitted_by_player_id`. Scramble scores excluded from individual stats via
the `is_scramble` flag and a partial index.

**event_groups** (v2) — teesheet groups for morning rounds. `id`, `event_id`,
`day` (fri/sat), `group_number`, unique `(event_id, day, group_number)`.

**group_players** (v2) — players in a teesheet group. `id`, `group_id`,
`player_id`, unique `(group_id, player_id)`.

**View: combined_stroke_totals** (v2) — sums Fri AM + Sat AM stroke totals per
player for Sunday seeding. **SEE CONTRADICTION BELOW.**

---

## Two scoring tables exist at once

There are **two score-of-record tables**, and the app is mid-transition between
them:

- **`scorecards`** — older, JSONB hole scores + computed total.
- **`round_scores`** — newer, one integer score per player per round.

The v2 migration contains a **commented-out** `DROP TABLE IF EXISTS scorecards;`
with the note that `round_scores` replaces it. So the intended end state is
`round_scores` as the single score of record, but `scorecards` has not been
dropped. **Which table is authoritative in the live DB must be confirmed.**

---

## Known contradictions (file vs. reality — verify against Neon)

1. **`combined_stroke_totals` view reads columns `round_scores` doesn't have.**
   The view selects `rs.total_score`, `rs.holes_completed`, `rs.hole_scores`,
   and `rs.is_complete` from `round_scores` — but the `round_scores` table as
   written has **none of these** (only a single `score` integer plus the v2
   additions). For this view to exist in Neon, the live `round_scores` table
   must have extra columns added directly in the DB that were never written back
   to these SQL files. **=> The SQL files do not fully describe the live schema.**
   Resolve by running `\d round_scores` (or
   `SELECT column_name, data_type FROM information_schema.columns WHERE
   table_name = 'round_scores';`) in Neon and pasting the result.

2. **Two score tables coexist** (above) — confirm which is live-authoritative.

3. **JSONB vs. separate columns.** `scorecards.hole_scores` is JSONB, and there
   is **no `score_vs_par` column anywhere**. `CLAUDE.md` states hole scores,
   total, and score-vs-par must be **separate columns, never JSONB**. The live
   schema does not yet meet that principle — the principle is a **target**, not
   current state. Reconcile during the scoring-model cleanup.

---

## Verification checklist (run in Neon, paste results to correct this doc)

- `SELECT table_name FROM information_schema.tables WHERE table_schema='public';`
  (confirm the full table list — there may be tables not in these files)
- `\d round_scores` — resolve contradiction #1
- `\d scorecards` — confirm if still populated / authoritative
- Confirm whether `scorecards` has been dropped or is still in use
- Confirm `course_holes.handicap_rank` is populated for imported courses
  (needed for net scoring)

---

## Design-doc gaps (what the target docs assume that this schema lacks)

These are not errors — they are the build gap between current state and the
launch design. Listed so Code doesn't assume the target already exists.

- **No account/auth layer.** `players` is PIN-only. The login restructure
  (email+password, stay-logged-in, Google sign-in) and the entire
  `account-less-players.md` claim model (account_id linkage, claim states,
  code-to-contact verification) are **net-new** — there is no email/phone/auth
  column to build on today. This is a foundational addition, not a modification.

- **Single-event-per-year assumption.** `events.year` is UNIQUE and the whole
  events/scorecards model assumes one annual outing. The multi-event, league,
  and casual-round directions in `CLAUDE.md` require relaxing this.

- **No league tables.** Leagues are referenced in the login/home design but do
  not exist in the schema.

- **No side-game tables.** The three-bucket model in `side-games.md`
  (readers/writers/stateful, incl. `wolf_hole_state`) has no schema yet.

- **No stub/claim columns.** `players` has no `account_id`, `invite_contact`,
  `claim_state`, etc. from `account-less-players.md`.

- **Score-of-record not settled.** Side games read "the one score written once,"
  but the DB currently has that score in two places. This must be resolved
  before any reader game is built.

- **Net scoring dependency is partially met.** `course_holes.handicap_rank`
  (per-hole stroke index) exists — good — but applies only to imported courses.
  The 42K bulk import must also carry per-hole stroke index for net to work
  app-wide.
