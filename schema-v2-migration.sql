-- ================================================================
-- SCHEMA V2 MIGRATION — 3-Day Weekend Format
-- Run this in Neon SQL Editor AFTER the original schema.sql
-- ================================================================

-- ── 1. UPDATE EVENTS TABLE ───────────────────────────────────────
-- Events now span a full weekend with 3 days and 5 rounds
-- Each day has a course assignment (set by commissioner before round)

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS friday_course_id    uuid REFERENCES courses(id),
  ADD COLUMN IF NOT EXISTS saturday_course_id  uuid REFERENCES courses(id),
  ADD COLUMN IF NOT EXISTS sunday_course_id    uuid REFERENCES courses(id),
  ADD COLUMN IF NOT EXISTS friday_tee_time          time,
  ADD COLUMN IF NOT EXISTS friday_afternoon_tee_time  time,
  ADD COLUMN IF NOT EXISTS saturday_tee_time         time,
  ADD COLUMN IF NOT EXISTS saturday_afternoon_tee_time time,
  ADD COLUMN IF NOT EXISTS sunday_tee_time           time,
  ADD COLUMN IF NOT EXISTS active_round        text CHECK (active_round IN (
    'friday_morning', 'friday_afternoon',
    'saturday_morning', 'saturday_afternoon',
    'sunday_morning'
  ));

-- Update status options to match 3-day flow
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_status_check;
ALTER TABLE events ADD CONSTRAINT events_status_check CHECK (status IN (
  'upcoming',
  'friday_morning_active', 'friday_afternoon_active',
  'saturday_morning_active', 'saturday_afternoon_active',
  'sunday_morning_active',
  'complete'
));

-- Keep course_id for backward compat but it's now unused
-- (friday/saturday/sunday course ids are used instead)

-- ── 2. ROUND_SCORES — ADD MISSING COLUMNS ────────────────────────
-- Add scramble_team_id for linking team members to one scramble score
ALTER TABLE round_scores
  ADD COLUMN IF NOT EXISTS scramble_team_id uuid,
  ADD COLUMN IF NOT EXISTS submitted_by_player_id uuid REFERENCES players(id);

-- ── 3. SCRAMBLE TEAMS — UPDATE FOR 3 ROUNDS ──────────────────────
-- Need to know which round the team is for (fri/sat/sun afternoon or sunday)
ALTER TABLE scramble_teams
  ADD COLUMN IF NOT EXISTS round text CHECK (round IN (
    'friday_afternoon', 'saturday_afternoon', 'sunday_morning'
  ));

-- Make team number unique per event+round
ALTER TABLE scramble_teams DROP CONSTRAINT IF EXISTS scramble_teams_event_id_team_number_key;
ALTER TABLE scramble_teams ADD CONSTRAINT scramble_teams_event_round_team_unique
  UNIQUE (event_id, round, team_number);

-- ── 4. DROP OLD SCORECARDS TABLE (replaced by round_scores) ───────
-- Only drop if it exists and is empty or you've confirmed migration
-- Uncomment when ready:
-- DROP TABLE IF EXISTS scorecards;

-- ── 5. USEFUL VIEWS ──────────────────────────────────────────────

-- Combined 2-day stroke play totals (Fri AM + Sat AM) for Sunday seeding
CREATE OR REPLACE VIEW combined_stroke_totals AS
SELECT
  rs.event_id,
  rs.player_id,
  p.name as player_name,
  SUM(rs.total_score) as combined_score,
  SUM(rs.holes_completed) as total_holes,
  COUNT(*) as rounds_completed,
  -- Merge hole scores from both days for tiebreaker use
  jsonb_object_agg(
    rs.day || '_' || rs.round_time,
    rs.hole_scores
  ) as all_hole_scores
FROM round_scores rs
JOIN players p ON p.id = rs.player_id
WHERE rs.is_scramble = false
  AND rs.day IN ('friday', 'saturday')
  AND rs.round_time = 'morning'
  AND rs.is_complete = true
GROUP BY rs.event_id, rs.player_id, p.name;


-- ── TEESHEET GROUPS (morning rounds) ─────────────────────────────
-- Commissioner assigns players to groups; group 1 gets base tee time,
-- each subsequent group is 8 minutes later.

CREATE TABLE IF NOT EXISTS event_groups (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  day text NOT NULL CHECK (day IN ('friday','saturday')),
  group_number integer NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (event_id, day, group_number)
);

CREATE TABLE IF NOT EXISTS group_players (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id uuid REFERENCES event_groups(id) ON DELETE CASCADE,
  player_id uuid REFERENCES players(id) ON DELETE CASCADE,
  UNIQUE (group_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_group_players_group ON group_players(group_id);
CREATE INDEX IF NOT EXISTS idx_group_players_player ON group_players(player_id);

ALTER TABLE event_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read event_groups" ON event_groups FOR SELECT USING (true);
CREATE POLICY "Anon insert event_groups" ON event_groups FOR INSERT WITH CHECK (true);
CREATE POLICY "Anon update event_groups" ON event_groups FOR UPDATE USING (true);
CREATE POLICY "Anon delete event_groups" ON event_groups FOR DELETE USING (true);
CREATE POLICY "Public read group_players" ON group_players FOR SELECT USING (true);
CREATE POLICY "Anon insert group_players" ON group_players FOR INSERT WITH CHECK (true);
CREATE POLICY "Anon delete group_players" ON group_players FOR DELETE USING (true);
