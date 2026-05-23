-- ============================================================
-- GOLF OUTING DATABASE SCHEMA
-- Run this in your Supabase SQL editor
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- COURSES
-- ============================================================
create table if not exists courses (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  city text,
  state text,
  par integer not null default 72,
  slope_rating numeric(4,1),
  course_rating numeric(4,1),
  created_at timestamptz default now()
);

-- ============================================================
-- COURSE HOLES (18 holes per course)
-- ============================================================
create table if not exists course_holes (
  id uuid primary key default uuid_generate_v4(),
  course_id uuid references courses(id) on delete cascade,
  hole_number integer not null check (hole_number between 1 and 18),
  par integer not null check (par between 3 and 5),
  handicap_rank integer not null check (handicap_rank between 1 and 18), -- 1 = hardest
  yardage_black integer,
  yardage_blue integer,
  yardage_white integer,
  yardage_red integer,
  unique(course_id, hole_number)
);

-- ============================================================
-- EVENTS (annual outings)
-- ============================================================
create table if not exists events (
  id uuid primary key default uuid_generate_v4(),
  year integer not null,
  name text not null default 'Annual Golf Outing',
  course_id uuid references courses(id),
  event_date date not null,
  morning_tee_time time,
  afternoon_tee_time time,
  player_count integer default 20 check (player_count in (16, 20, 24)),
  status text default 'upcoming' check (status in ('upcoming', 'morning_active', 'morning_complete', 'afternoon_active', 'complete')),
  scores_locked boolean default false,
  created_at timestamptz default now(),
  unique(year)
);

-- ============================================================
-- PLAYERS (persistent roster across years)
-- PINs are permanent unless changed by the commissioner.
-- To exclude a player from a year, just don't add them to event_players.
-- ============================================================
create table if not exists players (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  pin text not null unique, -- 4-digit PIN, unique across all players
  created_at timestamptz default now()
);

-- ============================================================
-- EVENT PLAYERS (who's playing in a specific event)
-- ============================================================
create table if not exists event_players (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid references events(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  tee_box text default 'white' check (tee_box in ('black', 'blue', 'white', 'red')),
  unique(event_id, player_id)
);

-- ============================================================
-- SCORECARDS (morning round, hole-by-hole)
-- ============================================================
create table if not exists scorecards (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid references events(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  hole_scores jsonb default '{}', -- {"1": 4, "2": 5, ...}
  total_score integer, -- calculated from hole_scores
  holes_completed integer default 0,
  is_complete boolean default false,
  submitted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(event_id, player_id)
);

-- ============================================================
-- SCRAMBLE TEAMS (afternoon round)
-- ============================================================
create table if not exists scramble_teams (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid references events(id) on delete cascade,
  team_number integer not null,
  player_ids uuid[] not null, -- array of 4 player UUIDs
  finishing_positions integer[], -- their morning finishing positions
  created_at timestamptz default now(),
  unique(event_id, team_number)
);

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_scorecards_event on scorecards(event_id);
create index if not exists idx_scorecards_player on scorecards(player_id);
create index if not exists idx_event_players_event on event_players(event_id);
create index if not exists idx_course_holes_course on course_holes(course_id);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger scorecards_updated_at
  before update on scorecards
  for each row execute function update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table courses enable row level security;
alter table course_holes enable row level security;
alter table events enable row level security;
alter table players enable row level security;
alter table event_players enable row level security;
alter table scorecards enable row level security;
alter table scramble_teams enable row level security;

-- Public read access for all tables
create policy "Public read" on courses for select using (true);
create policy "Public read" on course_holes for select using (true);
create policy "Public read" on events for select using (true);
create policy "Public read" on players for select using (true);
create policy "Public read" on event_players for select using (true);
create policy "Public read" on scorecards for select using (true);
create policy "Public read" on scramble_teams for select using (true);

-- Players can update their own scorecard (verified via player_id match in app logic)
create policy "Player insert scorecard" on scorecards for insert with check (true);
create policy "Player update scorecard" on scorecards for update using (true);

-- Write access: open to anon (commissioner PIN is enforced at the app/function layer,
-- not at the DB layer). Supabase Auth is not used in this app.
create policy "Anon insert courses" on courses for insert with check (true);
create policy "Anon update courses" on courses for update using (true);
create policy "Anon insert holes" on course_holes for insert with check (true);
create policy "Anon update holes" on course_holes for update using (true);
create policy "Anon insert events" on events for insert with check (true);
create policy "Anon update events" on events for update using (true);
create policy "Anon insert players" on players for insert with check (true);
create policy "Anon update players" on players for update using (true);
create policy "Anon insert event_players" on event_players for insert with check (true);
create policy "Anon delete event_players" on event_players for delete using (true);
create policy "Anon insert scramble_teams" on scramble_teams for insert with check (true);
create policy "Anon update scramble_teams" on scramble_teams for update using (true);
create policy "Anon delete scramble_teams" on scramble_teams for delete using (true);

-- ============================================================
-- SAMPLE DATA (optional - remove for production)
-- ============================================================
-- insert into courses (name, city, state, par, slope_rating, course_rating)
-- values ('Pebble Beach Golf Links', 'Pebble Beach', 'CA', 72, 145.0, 75.5);
