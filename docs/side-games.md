# Side Games & Game Formats — Design Doc

Status: **design approved, not yet coded.** This is the spec Claude Code builds
from. Read `CLAUDE.md` first for standing rules. Anything here that conflicts
with `CLAUDE.md` loses — flag it instead of guessing.

---

## The core idea (read this first)

Every game in TournyFlex is one of three kinds. The kind determines whether the
game **writes a new score of record**, **only reads existing scores**, or
**reads scores but also stores its own extra state**. Get a game in the wrong
bucket and the schema won't have a place to put its data.

This sorting is a direct consequence of the project principle
**"one score written once, read many times."** Almost nothing writes a new
score. Most games are just different ways of *reading* the individual hole
scores that were already entered.

### Bucket 1 — Writers (produce the score of record)

Only two games write scores. Everything else reads.

| Game | What it writes | Index-eligible? |
|---|---|---|
| Individual stroke play | One score per **player** per hole. | **Yes** |
| Scramble (4-man, 2-man) | One score per **team** per hole. No individual scores exist for this round. | No (analysis-only) |

- Individual stroke is the normal case: each player has `hole_scores`,
  `total_score`, `score_vs_par`. This is what saves to each player's personal
  record and feeds the friends layer.
- **Scramble is the one exception.** There is no individual score. Per Jacob's
  decision, the **shared team score is attributed to all members of the team** —
  each player's record shows they played this scramble round and the team result
  is stored against all of them. Do not fabricate individual scores for a
  scramble; attribute the team score.

### Bucket 2 — Pure readers (derive everything from existing individual scores)

These games create **no new score of record.** At read time they take the
individual hole scores already entered and compute a result. They store the
*game configuration* (who's playing, settings) and a *computed result*, but
never a second copy of a score.

Launch members:
- **Match play (1v1)** — compares two players' hole scores → hole result
  (win / loss / halve) → running match state (e.g. "2 up with 3 to play").
- **2v2** — three selectable sub-variants:
  - *2v2 match play*: best ball of each pair vs. the other pair, hole by hole.
  - *2v2 team stroke*: combined / best-ball total per pair.
  - *2v2 scramble*: each pair plays scramble (this writes a **team** score per
    pair — i.e. the scramble-writer rule applies inside the 2v2).
- **Stableford** — a **transform** of an individual score, not a new score.
  Points are assigned from `score_vs_par` per hole. **Standard points only at
  launch** (see table below). It writes nothing; it's a scoring lens applied at
  read time.
- **Skins** — each hole goes to the outright low score; **ties carry the skin
  over** to the next hole. Reader, but its computation is stateful (carryover).
  See carryover rules below.
- **Nassau** — not a new game mechanically; it's **three segments** (front 9,
  back 9, total 18), each scored as a match (or stroke) bet. Implement as three
  parallel match/stroke results over the existing scores.

### Bucket 3 — Stateful games (read scores AND store their own per-hole state)

These read individual scores like Bucket 2, **but they also carry per-hole state
that cannot be reconstructed from the scorecard afterward.** That state needs its
own table.

Launch member:
- **Wolf** — launch-critical (most-requested; a competitive differentiator —
  few apps handle it). Each hole, one player is the "Wolf" (rotates by tee
  order). After watching tee shots, the Wolf either **partners** with one other
  player or goes **lone wolf**. That partnership decision happens *before* the
  hole is scored and **cannot be derived from the scores** — so it must be
  stored. Wolf then reads the individual hole scores to settle the hole's
  points based on who partnered with whom.
  - Needs a state table, e.g. `wolf_hole_state`: round_id, hole_number,
    wolf_player_id, partner_player_id (nullable), lone_wolf (bool),
    points settled.
  - Needs its own per-hole UI step (pick partner / go lone) before scoring.
  - This is the single biggest build item in this doc — scope accordingly.

Future members of this bucket (deferred, but design Bucket 3 so they slot in):
**Chapman, Alternate Shot, Sixes** — all have shot-order / pairing rules that
need stored state. Don't build now; don't paint the schema into a corner that
excludes them.

---

## Gross vs. net

**Launch = GROSS only.** Net is a **fast-follow**, not in the July 1 build.

- Gross uses actual strokes taken. No handicap logic. Ships immediately.
- Net subtracts a per-hole handicap allowance derived from the **TournyFlex
  Index** (unofficial — never call it an official handicap) using each hole's
  **stroke index** (hole difficulty rank 1–18).
- Net therefore depends on TWO things being ready: the TournyFlex Index
  computation, and **per-hole stroke-index data from the course database**. If
  the GolfAPI.io import does not include per-hole stroke index, net is blocked
  until it does. Track this as a dependency on the course-data build.
- Build the readers so a `scoring_mode` of `gross` | `net` is a parameter from
  day one, but only implement `gross` now. Don't hardcode gross so deeply that
  net requires a rewrite.

---

## Standard Stableford points (launch)

Applied from `score_vs_par` per hole. Standard scale:

| Result vs par | Points |
|---|---|
| Double bogey or worse | 0 |
| Bogey | 1 |
| Par | 2 |
| Birdie | 3 |
| Eagle | 4 |
| Albatross | 5 |

**Modified Stableford (configurable point values) is deferred.** Store the point
table as config even now so Modified is later a data change, not a code change.

---

## Skins carryover rules (launch)

- A hole won outright (single lowest score) awards that hole's skin.
- A tie carries the skin forward; the next hole is worth the carried skins plus
  its own.
- Launch is **gross** skins (lowest actual score). Net skins follow with net.
- Carryover is computed from the scores — no separate state table needed (unlike
  Wolf), but the carryover logic must be a deterministic read so it always
  produces the same result from the same scores.

---

## Launch scope (July 1) — definitive list

Writers: **Individual stroke**, **Scramble**.
Readers: **Match play 1v1**, **2v2** (match / team-stroke / scramble),
**Stableford** (standard), **Skins** (gross, with carryover), **Nassau**.
Stateful: **Wolf**.

Deferred: Modified Stableford; net scoring (all games); Chapman / Alternate Shot
/ Sixes; any 2v2 variant beyond the three above.

---

## How this connects to the Friends layer (why it matters)

The friends layer is in launch scope and is the primary growth mechanism. The
connection to games is direct and is the reason the "one score written once"
principle pays off:

- In any **individual-scoring** game (everything except scramble), **one person
  keys in all players' hole scores**, and because each player has their own
  score of record, **the round saves to every player's personal record** — not
  just the scorekeeper's.
- A non-app player whose scores were entered by a friend will **see their data
  waiting** when they install and sign up. That saved history is the hook: if
  player 2–4's data didn't persist, they'd have no reason to install and the
  group would keep relying on one person's phone.
- **Scramble is the weak case for this** (no individual scores), which is why the
  team score is attributed to all members — so even a scramble round leaves
  *something* on each player's record.

Implication for the build: the writer for individual scores must persist to each
player's record **by player identity**, including players who don't yet have an
account (write to a resolvable player record that an account claims on signup).
This is the seam between the game engine and the friends layer — get it right
once and every reader game inherits it.

---

## Open items to confirm before/while building

- **Account-less player records:** how a score entered for a not-yet-registered
  player is stored and later claimed on signup. (Needed for the friends hook to
  work; design before the individual-stroke writer is finalized.)
- **2v2 pairing UI:** how pairs are chosen and whether they're fixed for the
  round or can change.
- **Wolf points values:** confirm the points schedule (lone wolf multiplier,
  partner win/loss values) before building the settle logic.
