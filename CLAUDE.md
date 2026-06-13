# CLAUDE.md — TournyFlex

This file is loaded automatically at the start of every Claude Code session. It
is the standing source of truth for how this project is built. Read it fully
before writing code.

---

## What TournyFlex is

A golf event management PWA targeting three segments: organized annual outings,
leagues, and casual side-game groups. Live at not-a-church-outing.netlify.app.
Beta launch target: **July 1, 2026.**

Defensible position: no single competitor owns both the organized-outing segment
and the casual side-game segment at the same time. Protect that overlap.

---

## Stack

- **Frontend:** React + Vite PWA. PWA config lives in `vite.config.js` via
  `vite-plugin-pwa` — there is **no separate `manifest.json`**. Do not add one.
- **Backend:** Neon Postgres 17, accessed through Netlify serverless functions.
- **Deployment:** Netlify, auto-deploy from `main`.
- **Repo:** github.com/jbdrumm/TournyFlex (main branch).
- **Image processing:** Pillow (PIL) for icon generation.

---

## Hard rules (do not violate without explicit approval)

### Deploy / process
- **No deploy to `main` without Jacob's explicit approval.** `main`
  auto-deploys to production; treat every merge as a production release.
- **Review before build.** Describe the plan and flag open questions before
  writing code. No surprises, no unrequested refactors.
- **Scope discipline.** Debug the existing code. Do not import patterns from
  other projects, do not restyle or refactor unrelated areas, do not "improve"
  things that weren't asked about.
- **Regression intolerance.** A working prior state beats a broken new one. If a
  change breaks a working feature, revert it immediately rather than patching
  forward.

### Legal / compliance
- The handicap calculation is the **"TournyFlex Index"** — an unofficial figure.
  Never call it an official handicap or imply USGA/WHS affiliation (licensing
  exposure).
- Individual stroke-play rounds carry an `index_eligible` flag. Scrambles, match
  play, and side games are **analysis-only** and are never index-eligible.
- **TournyFlex must never touch wager money.** No handling, holding, or
  transfer of bet funds anywhere in the system.
- Course data license: **no resale**, and per-user course data is stored for a
  **maximum of 1 year**.

### Privacy defaults
- Commissioner visibility into private group side games: **default closed.**
- Friend privacy: **default `shared_only`**, opt-in to `full`.

### Database security (Supabase)
- **Row Level Security (RLS) is ON by default** for new tables (set at project
  creation). Every new table is locked until an explicit policy is written —
  secure-by-default. Do not disable.
- **"Automatically expose new tables" is OFF.** Tables are exposed through the
  Data API manually/deliberately, never by default. Especially never auto-expose
  PII tables (players, accounts/profile).
- **Migrated tables need RLS applied post-restore.** The 10 tables brought over
  from Neon arrive without RLS; enable + policy them before launch (see
  `docs/migration-runbook.md` step 2d-bis). The Netlify service connection
  bypasses RLS, so "the app works" does NOT mean a table is secured.
- **DEV vs PROD database — be deliberate which one tools point at.** The app AND
  the coming-soon splash site share the **same Supabase project**. Production data
  (and the live founding-tester waitlist) lives there. Do NOT run migrations,
  destructive SQL, or test writes against production from a dev session or from an
  AI agent. Use a Supabase dev branch / separate dev database, or be explicit and
  careful with which `DATABASE_URL` is active. A wrong `DATABASE_URL` is how you
  silently corrupt or wipe real data.
- **AI agents (Claude Code, etc.) start with NO context from past chat sessions.**
  They only know what's committed to this repo (this file especially). Decisions
  made in chat that aren't written here are invisible to them. Keep CLAUDE.md and
  `docs/` current as the single source of truth. Do not assume an agent "remembers"
  prior work — if it matters, it must be in the repo.

---

## Architecture principles

- **"One score written once, read many times."** A score is entered once and
  read by every downstream consumer (leaderboards, side games, stats). Never
  double-count or re-enter a score.
- `hole_scores`, `total_score`, and `score_vs_par` are **separate columns** —
  never a single JSONB blob.
- **Global state lives in the database, not localStorage.** localStorage is not
  a source of truth.
- **Never place ads on the active scorecard.**

---

## Hard-won technical lessons (these have bitten us before)

- **`useConfirm()` must be called inside the component that uses it.** A silent
  fallback to the browser global `confirm()` broke the `ConfirmModal` context
  pattern repeatedly. All modal work uses the established
  `ConfirmModal` / `useConfirm()` pattern — do not roll a new one.
- **Scorecard checkbox resets on Android** were caused by a `useEffect`
  depending on the `player` object reference instead of `player?.id`. Always use
  `[player?.id]` (a stable primitive) in dependency arrays, never the object.
- **Stale React closures:** reading state immediately after setting it in the
  same async function fails. Use a local variable (e.g. `currentlyHidden`)
  instead of reading the state you just set.
- **Validate Neon directly.** Confirm behavior by querying Neon and inspecting
  the actual rows, not by trusting what the UI appears to show.

---

## Communication style

- Plain language. Explain every acronym and business term plainly; avoid
  unnecessarily complex terminology.
- Precision over polish. Numerical and technical accuracy matter; wrong
  references or examples will be corrected firmly.

---

## Current build focus (pre-launch sprint → July 1)

Three features are being built toward launch. Designs exist for all three; code
is in progress.

### 1. Login / navigation flow

Intended order:

```
Splash screen
  → Login screen   (bypass if cached login exists)
    → Home Dashboard
        unless an event is "live" → jump to that event's page
```

From the **Home Dashboard** the user can:
- **Start a new round** — scored individually, or as a game: 4-man scramble,
  2v2, match play, or other game types. If the user is enrolled in a league,
  that league appears as an option in the Start-New-Round flow.
- **Create a new event** (outing/tournament).
- **Set up a league.**

This requires a small site redesign to add a **"Home" dashboard button** to the
navigation.

**OPEN QUESTIONS — confirm with Jacob before coding the live-event branch:**
- *Definition of "live":* proposed default = the user has an **active
  scorecard** (in-progress round/event), which takes precedence over a mere
  date/time window. Confirm or replace.
- *Multiple live events at once:* if a user has more than one live event (e.g. a
  multi-day outing plus a casual round they started), proposed default = show a
  **chooser** rather than auto-jumping. Confirm.
- *Auto-jump frequency + escape hatch:* the auto-jump must **not trap** the user
  on the event page — there must always be a "Back to Home" path so they can
  start a different round. Confirm whether auto-jump fires on every app open
  during the live window or only the first.

Login screen is currently **stubbed** in `SplashScreen.jsx` and `App.jsx`. The
multi-tournament login screen was previously deferred — confirm whether this
build is the full multi-event selector or single-event entry for launch.

**Accounts table — required fields when built (NOT YET CREATED).** There is no
account/auth table yet (identity is PIN-only today; see schema-current.md). When
the account/profile schema is built, it MUST include **birthdate** (precise date,
not an age bucket). Birthdate is needed for: TournyFlex Index/handicap context,
age-eligibility for outings, and league age rules. Note the distinction from the
coming-soon waitlist, which collects a coarse **age range** for demographics only
— the real account needs an actual birthdate. Collect birthdate at account
signup.

**Founding-tester credits system (NOT YET BUILT — marketing promise made on the
coming-soon site).** The founding-tester offer creates a future billing
obligation that the accounts/billing system must honor. Mechanics as promised:
- Founding testers (the 50 from the coming-soon site) earn **1 free-month credit
  per round of feedback** given during the 2026 founding season.
- Feedback rounds may be **real OR simulator rounds** (sim rounds earn credits and
  are tracked separately; sim rounds are NOT real-round / index-eligible).
- Credits cap at **12** (a full free year).
- Credits are **redeemable only against individual play.** They explicitly DO NOT
  apply to outing, event, or league entry fees.
- Credits are applied **by the user** in account settings (a "credits" section:
  balance, apply-to-month, expiry).
- **All credits expire Dec 31, 2027.**
This requires, when accounts/billing are built: a credits ledger per user, a
notion of credit-eligible charge types (individual play only), and an expiry.

### 2. Side-game data model

Designed (plan only, no code yet):
- **Event-wide contests** plus **per-group autonomous side games.**
- Score flow follows "one score written once, read many times" — side games
  *read* existing scores, they do not create a second score of record.
- Remember: side games are **analysis-only / not index-eligible**, and the
  system **never touches wager money**.

### 3. Course database

Designed (plan only, no code yet):
- **One-time bulk load:** GolfAPI.io CSV → Neon, ~42K+ courses.
- **Real-time fallback:** Golf Intelligence API for cache misses.
- Enforce license terms in the schema/retention logic: **no resale**, per-user
  course data **max 1 year**.

---

## Deferred (post-launch queue — do not build now without approval)

1. Offline score queue — was reverted; needs pre-resolved course/event IDs
   before anything is queued.
2. Double-par stroke cap with skull icon on the detail leaderboard.
3. Firebase push notifications — service-worker placeholder already in place.
4. Friends layer / social stats — designed (friendships via shared-play
   auto-suggest + confirm; head-to-head records; CTP stored precisely,
   LD requires 2+ witness consensus with no distance stored; favorite/nemesis
   hole stats from `hole_scores`). Plan only.
5. Advertising slots (Title Sponsor + Event Sponsor at launch; affiliates Y2+;
   programmatic Y3+) — and never on the active scorecard.

---

## Multi-agent QA (Claude Code subagents)

- Lives in `.claude/agents/` as role files.
- **Pre-launch scope: scanner + triage only** (read-only, no fix-drafting).
- Any agent-proposed change to `main` is gated behind Jacob's explicit approval.
- Model split: Haiku for high-volume scanning, Sonnet for triage.
- Cost hygiene: clear context between dispatches, stop idle agents, use prompt
  caching.
- The fix-drafting `developer` agent is added **post-launch**, only after signal
  quality is validated.

---

## How to update this file

Jacob updates this file deliberately — it is not auto-maintained. When a
decision is made mid-build, append it with the `#` memory shortcut or ask
explicitly to update the relevant section. Do not silently rewrite standing
rules.
