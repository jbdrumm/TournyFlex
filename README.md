# ⛳ Men's Golf Outing PWA

A full-featured progressive web app for your annual men's golf outing.

## Features
- **Morning Round Leaderboard** — live, auto-refreshes every 2 minutes
- **Score Entry** — hole-by-hole self-entry, photo upload (AI Vision parsing), or commissioner input
- **Tiebreaker Logic** — handicap hole difficulty order (#1 handicap hole first)
- **Auto Scramble Teams** — snake draft from morning standings (16/20/24 players)
- **Historical Scores** — by year/course with champion highlights
- **Commissioner Panel** — event setup, player/PIN management, score overrides, course setup
- **PWA** — installable on iOS/Android, works offline for viewing

---

## Stack
- **Frontend:** React + Vite (PWA)
- **Hosting:** Netlify (+ serverless functions)
- **Database:** Supabase (Postgres + Auth)
- **AI:** Anthropic Claude Vision (scorecard parsing)

---

## Setup Guide

### 1. Supabase Setup

1. Create a new project at [supabase.com](https://supabase.com)
2. In the SQL Editor, paste and run the contents of `supabase-schema.sql`
3. In **Authentication > Users**, create the commissioner account:
   - Email: `commissioner@yourdomain.com`
   - Password: (your choice — this is the single admin login)
4. Copy your **Project URL** and **anon public key** from Settings > API

### 2. Netlify Setup

1. Push this repo to GitHub
2. Create a new Netlify site, connect your GitHub repo
3. In **Site Settings > Environment Variables**, add:
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ANTHROPIC_API_KEY=your-anthropic-api-key
   COMMISSIONER_PIN=847291  # 6-8 digits of your choice
   ```
4. Deploy — Netlify auto-detects `netlify.toml` for build settings

### 3. Local Development

```bash
cp .env.example .env.local
# Fill in your keys in .env.local

npm install
npm run dev
```

---

## Commissioner Workflow

### Before the Event
1. Navigate to `/login` and sign in as commissioner
2. **Courses tab** — search for the course or create manually
   - Enter hole pars and handicap rankings (1 = hardest hole)
3. **Players tab** — add players with 4-digit PINs, add them to the event
4. **Event tab** — create the event, set date/tee times, select course
5. Set event status to `upcoming`

### Morning of Round
1. Set event status → `morning_active`
2. Share the app URL with all players and give them their PINs
3. Players self-enter scores as they play, or at the turn/after round via photo

### After Morning Round
1. Set event status → `morning_complete`
2. Go to **Scores tab** to verify/correct any missing scores
3. Set `Lock Scores` to freeze the leaderboard
4. Go to **Teams tab** → click **Generate Teams**
   - Teams are auto-saved to the database
5. Set event status → `afternoon_active`

### After Afternoon Round
1. Set event status → `complete`
2. Scores are preserved in history automatically

---

## Scramble Team Logic

Teams use a snake draft from the morning finishing order:

| Position | Team |
|----------|------|
| 1st      | 1    |
| 2nd      | 2    |
| 3rd      | 3    |
| ...      | ...  |
| Nth      | N    |
| N+1st    | N    |
| N+2nd    | N-1  |
| ...      | ...  |

**Example (20 players, 5 teams):**
- Team 1: 1st, 10th, 11th, 20th
- Team 2: 2nd, 9th, 12th, 19th
- Team 3: 3rd, 8th, 13th, 18th
- Team 4: 4th, 7th, 14th, 17th
- Team 5: 5th, 6th, 15th, 16th

## Tiebreaker Logic

When two players have the same gross score, the app breaks ties by:
1. Score on the #1 handicap hole (hardest hole) — lower score wins
2. If still tied, move to #2 handicap hole, and so on
3. If completely equal on all holes, alphabetical by name

---

## Adding a Golf Course API (Optional Enhancement)

The current course search uses OpenStreetMap for basic name lookup. For full hole-by-hole data including handicap rankings, you can integrate:

- **[Golf Course Finder API](https://golfcoursefinder.com/api)** — has handicap data
- **[TheGrint API](https://www.thegrint.com/api)** — handicap-focused
- **[Golf GPS / Hole19 API](https://www.hole19golf.com)** — full course data

Update `netlify/functions/search-course.js` with your API key and endpoint.

---

## Score Entry via Photo

Players (or commissioner) can photograph their scorecard. The image is sent to Claude Vision which extracts hole-by-hole scores. The parsed scores are pre-filled in the hole grid for review and confirmation before saving.

Best practices for photo parsing:
- Good lighting, flat scorecard
- Include the full 18-hole grid
- The commissioner's name-based selection ensures scores go to the right player

---

## PWA Installation

- **iOS Safari:** Share → "Add to Home Screen"
- **Android Chrome:** Menu → "Add to Home Screen" or install banner

The app works offline for viewing leaderboards and teams (cached). Score submission requires connectivity.
