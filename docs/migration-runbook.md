# Neon -> Supabase Migration Runbook

Status: **active plan.** Two phases. Phase 1 (dump) is automated via GitHub
Actions and touches nothing but Neon. Phase 2 (load) is a deliberate, reviewed
step into a fresh Supabase project. Do NOT combine migration with redesign —
move the schema AS-IS, verify parity, then refactor later.

Context: dataset is small and the beta group is inactive (migrating now, at
minimum size, is the low-risk moment). Verified schema: 10 tables, round_scores
is the single score of record (487 rows), scorecards already dropped. See
`docs/schema-current.md`.

---

## Phase 1 — Dump Neon to an artifact (automated, no local install)

Uses `.github/workflows/neon-dump.yml`. Runs `pg_dump` (PG17) inside a GitHub
runner. Nothing installs on your PC.

1. **Add the secret.** Repo -> Settings -> Secrets and variables -> Actions ->
   New repository secret:
   - Name: `NEON_DATABASE_URL`
   - Value: Neon **unpooled** connection string (Neon Console -> Connect ->
     Connection pooling OFF -> copy). Format:
     `postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require`
2. **Run it.** Actions tab -> "Neon DB Dump" -> Run workflow.
3. **Read the run log** at the "Sanity check" step:
   - CREATE TABLE count should be **10**.
   - Tables should be: app_settings, course_holes, courses, event_groups,
     event_players, events, group_players, players, round_scores, scramble_teams.
   - Note whether `combined_stroke_totals` appears as a VIEW (closes the last
     open item in schema-current.md).
4. **Download** the `neon-dump` artifact (two files):
   - `tournyflex_neon.bak` — custom format, this is what you restore from.
   - `tournyflex_neon_dump.sql` — plain text, for reading only.
   - Artifact retention is 7 days. The files contain ALL data — keep them
     private; they are gitignored and must never be committed.

**GATE 1:** Do not proceed until the table count is 10 and the table names match.

---

## Phase 2 — Load into a fresh Supabase project (reviewed)

### 2a. Create the destination
- Create a new Supabase project (this becomes the auth + data home).
- Choose the **same Postgres major version (17)** if offered, or newer.
- Note: free tier caps at 2 active projects and pauses after ~1 week idle —
  a user-facing DB should be on **Pro ($25/mo)** so it never pauses. (Auth MAUs
  are free well past our ~12K ceiling; the $25 is for the always-on project.)
- Grab the Supabase **connection string** (Project Settings -> Database).

### 2b. Prerequisite — enable extensions BEFORE restoring
The Neon schema uses `uuid_generate_v4()` defaults (seen on round_scores.id and
others). That function needs the **uuid-ossp** extension. The restore WILL FAIL
on those defaults if it is not enabled first.
- In the Supabase SQL editor, run: `create extension if not exists "uuid-ossp";`
- (Optional future cleanup: migrate defaults to core `gen_random_uuid()` so no
  extension is needed. Do this as a SEPARATE refactor after parity is verified —
  not during the migration.)

### 2c. Restore
From any machine with PG17 client tools — OR add a second GitHub Action step that
runs `pg_restore` against the Supabase secret (mirrors Phase 1, no local install):
```
pg_restore -v --no-owner --no-privileges --no-acl \
  -d "postgresql://USER:PASSWORD@SUPABASE_HOST/postgres?sslmode=require" \
  tournyflex_neon.bak
```
- `--no-owner --no-privileges --no-acl` avoids the ALTER OWNER / privilege
  errors Neon's own docs warn about for restores.
- Expect possible warnings about roles/ownership — those are fine and expected.
  Hard errors (missing extension, failed CREATE) are not — stop and fix.

### 2d. Verify parity (do not skip — "validate directly, don't trust the UI")
Run in the Supabase SQL editor and compare to Neon:
```
-- table list (expect the same 10)
select table_name from information_schema.tables where table_schema='public' order by 1;
-- row counts must match Neon
select count(*) from round_scores;   -- expect 487
select count(*) from app_settings;   -- expect 2
select count(*) from players;
select count(*) from courses;
select count(*) from course_holes;
-- spot-check round_scores has its 14 columns incl. score_vs_par
select column_name from information_schema.columns
  where table_name='round_scores' order by ordinal_position;
```

**GATE 2:** Row counts and column shape must match Neon exactly before cutover.

### 2e. Repoint the app
- Update the Netlify serverless functions' DB connection string (env var) from
  Neon to Supabase.
- Test a read path AND a write path against Supabase before going live.
- Keep Neon intact (do not delete) until the app runs cleanly on Supabase for a
  sanity period. Neon is your rollback.

**GATE 3:** App reads and writes verified against Supabase -> only then is the
migration complete.

---

## After migration (separate steps, not part of this move)
- Build auth/account/profile layer (Supabase Auth + accounts table). See
  `docs/auth-login.md` (to be written).
- Per-event refactor of app_settings (currently flat/global). See
  schema-current.md "Multi-event gap".
- Optional: switch uuid defaults to gen_random_uuid().
- Decommission Neon once Supabase is proven.

## Do-not-do
- Do not combine the migration with schema redesign.
- Do not delete Neon until Phase 2 gates all pass and the app is stable.
- Do not commit the dump files (gitignored).
