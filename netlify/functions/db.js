// netlify/functions/db.js
// Central database API for the Golf Outing app — 3-day weekend format.
// All queries from the frontend go through here. DATABASE_URL never leaves the server.

const postgres = require('postgres')

// Single shared connection across warm invocations of this function instance.
// Transaction pooler (Supabase, port 6543) does NOT support prepared statements,
// so prepare:false is REQUIRED. Keep max low — serverless instances are many
// and short-lived; the pooler multiplexes them.
let _sql
function getSql() {
  if (!_sql) {
    _sql = postgres(process.env.DATABASE_URL, {
      prepare: false,   // required for Supabase transaction pooler (6543)
      max: 1,           // one conn per warm instance; pooler handles fan-out
      idle_timeout: 20,
      connect_timeout: 10,
    })
  }
  return _sql
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) }

  const sql = getSql()
  let body
  try { body = JSON.parse(event.body) }
  catch { return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON' }) } }

  const { action, payload } = body
  try {
    const result = await handleAction(sql, action, payload)
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(result) }
  } catch (err) {
    console.error(`DB error [${action}]:`, err.message)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) }
  }
}

async function handleAction(sql, action, p = {}) {
  switch (action) {

    // ── EVENTS ───────────────────────────────────────────────────

    case 'get_current_event': {
      const rows = await sql`
        SELECT e.*,
          cf.name   as friday_course_name,    cf.par   as friday_par,
          cfp.name  as friday_pm_course_name, cfp.par  as friday_pm_par,
          cs.name   as saturday_course_name,  cs.par   as saturday_par,
          csp.name  as saturday_pm_course_name, csp.par as saturday_pm_par,
          csun.name as sunday_course_name,    csun.par as sunday_par
        FROM events e
        LEFT JOIN courses cf   ON cf.id   = e.friday_course_id
        LEFT JOIN courses cfp  ON cfp.id  = e.friday_pm_course_id
        LEFT JOIN courses cs   ON cs.id   = e.saturday_course_id
        LEFT JOIN courses csp  ON csp.id  = e.saturday_pm_course_id
        LEFT JOIN courses csun ON csun.id = e.sunday_course_id
        WHERE e.status != 'complete'
        ORDER BY e.event_date DESC LIMIT 1`
      return { data: rows[0] || null }
    }

    case 'list_events': {
      const rows = await sql`
        SELECT e.*,
          cf.name as friday_course_name, cs.name as saturday_course_name,
          csun.name as sunday_course_name
        FROM events e
        LEFT JOIN courses cf   ON cf.id   = e.friday_course_id
        LEFT JOIN courses cs   ON cs.id   = e.saturday_course_id
        LEFT JOIN courses csun ON csun.id = e.sunday_course_id
        ORDER BY e.event_date DESC LIMIT 10`
      return { data: rows }
    }

    case 'upsert_event': {
      const { year, name, event_date, friday_course_id, friday_pm_course_id,
              saturday_course_id, saturday_pm_course_id, sunday_course_id,
              friday_tee_time, friday_afternoon_tee_time,
              saturday_tee_time, saturday_afternoon_tee_time,
              sunday_tee_time, player_count } = p
      // PM course falls back to AM course if not explicitly set
      const friPm = friday_pm_course_id || friday_course_id || null
      const satPm = saturday_pm_course_id || saturday_course_id || null
      const rows = await sql`
        INSERT INTO events (year, name, event_date,
          friday_course_id, friday_pm_course_id,
          saturday_course_id, saturday_pm_course_id,
          sunday_course_id,
          friday_tee_time, friday_afternoon_tee_time,
          saturday_tee_time, saturday_afternoon_tee_time,
          sunday_tee_time, player_count)
        VALUES (${year}, ${name || 'Annual Golf Outing'}, ${event_date},
          ${friday_course_id || null}, ${friPm},
          ${saturday_course_id || null}, ${satPm},
          ${sunday_course_id || null},
          ${friday_tee_time || null}, ${friday_afternoon_tee_time || null},
          ${saturday_tee_time || null}, ${saturday_afternoon_tee_time || null},
          ${sunday_tee_time || null}, ${player_count || 20})
        ON CONFLICT (year) DO UPDATE SET
          name = EXCLUDED.name, event_date = EXCLUDED.event_date,
          friday_course_id = EXCLUDED.friday_course_id,
          friday_pm_course_id = EXCLUDED.friday_pm_course_id,
          saturday_course_id = EXCLUDED.saturday_course_id,
          saturday_pm_course_id = EXCLUDED.saturday_pm_course_id,
          sunday_course_id = EXCLUDED.sunday_course_id,
          friday_tee_time = EXCLUDED.friday_tee_time,
          friday_afternoon_tee_time = EXCLUDED.friday_afternoon_tee_time,
          saturday_tee_time = EXCLUDED.saturday_tee_time,
          saturday_afternoon_tee_time = EXCLUDED.saturday_afternoon_tee_time,
          sunday_tee_time = EXCLUDED.sunday_tee_time,
          player_count = EXCLUDED.player_count
        RETURNING *`
      return { data: rows[0] }
    }

    case 'update_event_status': {
      const rows = await sql`
        UPDATE events SET status = ${p.status}, active_round = ${p.active_round || null}
        WHERE id = ${p.id} RETURNING *`
      return { data: rows[0] }
    }

    case 'set_round_course': {
      // Commissioner sets which Manistee course before a round starts
      const col = p.day === 'friday' ? 'friday_course_id'
                : p.day === 'saturday' ? 'saturday_course_id' : 'sunday_course_id'
      const rows = await sql`
        UPDATE events SET ${sql(col)} = ${p.course_id} WHERE id = ${p.event_id} RETURNING *`
      return { data: rows[0] }
    }

    case 'lock_scores': {
      const rows = await sql`
        UPDATE events SET scores_locked = ${p.locked} WHERE id = ${p.id} RETURNING *`
      return { data: rows[0] }
    }

    // ── COURSES ──────────────────────────────────────────────────

    case 'list_courses': {
      const rows = await sql`SELECT * FROM courses ORDER BY name`
      return { data: rows }
    }

    case 'get_course_holes': {
      const rows = await sql`
        SELECT id, course_id, hole_number, par, handicap_rank,
               yardage_white, yardage_blue, yardage_black, yardage_red
        FROM course_holes WHERE course_id = ${p.course_id}
        ORDER BY hole_number`
      return { data: rows }
    }

    case 'insert_course': {
      const { name, city, state, par, slope_rating, course_rating } = p
      const rows = await sql`
        INSERT INTO courses (name, city, state, par, slope_rating, course_rating)
        VALUES (${name}, ${city || null}, ${state || null}, ${par},
                ${slope_rating || null}, ${course_rating || null})
        RETURNING *`
      return { data: rows[0] }
    }

    case 'insert_holes': {
      for (const h of p.holes) {
        await sql`
          INSERT INTO course_holes (course_id, hole_number, par, handicap_rank,
            yardage_white, yardage_blue, yardage_black)
          VALUES (${p.course_id}, ${h.hole_number}, ${h.par}, ${h.handicap_rank},
            ${h.yardage_white || null}, ${h.yardage_blue || null}, ${h.yardage_black || null})
          ON CONFLICT (course_id, hole_number) DO UPDATE SET
            par = EXCLUDED.par, handicap_rank = EXCLUDED.handicap_rank,
            yardage_white = EXCLUDED.yardage_white`
      }
      return { data: { ok: true } }
    }

    // ── PLAYERS ──────────────────────────────────────────────────

    case 'list_players': {
      const rows = await sql`SELECT * FROM players ORDER BY name`
      return { data: rows }
    }

    case 'get_player_by_pin': {
      const rows = await sql`SELECT id, name FROM players WHERE pin = ${p.pin} LIMIT 1`
      return { data: rows[0] || null }
    }

    case 'insert_player': {
      const rows = await sql`
        INSERT INTO players (name, pin) VALUES (${p.name}, ${p.pin}) RETURNING *`
      return { data: rows[0] }
    }

    case 'update_player_pin': {
      const rows = await sql`
        UPDATE players SET pin = ${p.pin} WHERE id = ${p.id} RETURNING *`
      return { data: rows[0] }
    }

    // ── EVENT PLAYERS ─────────────────────────────────────────────

    case 'get_event_players': {
      const rows = await sql`
        SELECT ep.player_id, p.name, p.pin
        FROM event_players ep
        JOIN players p ON p.id = ep.player_id
        WHERE ep.event_id = ${p.event_id}
        ORDER BY p.name`
      return { data: rows }
    }

    case 'toggle_event_player': {
      if (p.add) {
        await sql`INSERT INTO event_players (event_id, player_id)
          VALUES (${p.event_id}, ${p.player_id}) ON CONFLICT (event_id, player_id) DO NOTHING`
      } else {
        await sql`DELETE FROM event_players
          WHERE event_id = ${p.event_id} AND player_id = ${p.player_id}`
      }
      return { data: { ok: true } }
    }

    // ── ROUND SCORES ──────────────────────────────────────────────

    case 'get_round_scores': {
      const rows = await sql`
        SELECT
          rs.id, rs.event_id, rs.player_id, rs.course_id,
          rs.day, rs.round_time, rs.is_scramble,
          rs.hole_scores, rs.holes_completed, rs.is_complete,
          rs.scramble_team_id, rs.total_score, rs.score_vs_par,
          rs.created_at, p.name as player_name
        FROM round_scores rs
        JOIN players p ON p.id = rs.player_id
        WHERE rs.event_id = ${p.event_id}
          AND rs.day = ${p.day}
          AND rs.round_time = ${p.round_time}
        ORDER BY rs.total_score ASC NULLS LAST`
      return { data: rows }
    }

    case 'get_player_round': {
      const rows = await sql`
        SELECT
          id, event_id, player_id, course_id, day, round_time,
          is_scramble, hole_scores, holes_completed, is_complete,
          scramble_team_id, total_score, score_vs_par, created_at
        FROM round_scores
        WHERE event_id = ${p.event_id}
          AND player_id = ${p.player_id}
          AND day = ${p.day}
          AND round_time = ${p.round_time}
        LIMIT 1`
      return { data: rows[0] || null }
    }

    case 'get_all_event_rounds': {
      // Get every round_score row for an event (for commissioner overview)
      const rows = await sql`
        SELECT rs.*, p.name as player_name
        FROM round_scores rs
        JOIN players p ON p.id = rs.player_id
        WHERE rs.event_id = ${p.event_id}
        ORDER BY rs.day, rs.round_time`
      return { data: rows }
    }

    case 'upsert_round_score': {
      const { event_id, player_id, course_id, day, round_time, is_scramble,
              hole_scores, holes_completed, is_complete, scramble_team_id,
              total_score, score_vs_par } = p
      const rows = await sql`
        INSERT INTO round_scores (event_id, player_id, course_id, day, round_time,
          is_scramble, hole_scores, holes_completed, is_complete, scramble_team_id,
          total_score, score_vs_par)
        VALUES (${event_id}, ${player_id}, ${course_id}, ${day}, ${round_time},
          ${is_scramble || false}, ${JSON.stringify(hole_scores || {})},
          ${holes_completed || 0}, ${is_complete || false}, ${scramble_team_id || null},
          ${total_score || null}, ${score_vs_par != null ? score_vs_par : null})
        ON CONFLICT (event_id, player_id, course_id, day, round_time) DO UPDATE SET
          hole_scores = EXCLUDED.hole_scores,
          holes_completed = EXCLUDED.holes_completed,
          is_complete = EXCLUDED.is_complete,
          scramble_team_id = EXCLUDED.scramble_team_id,
          total_score = EXCLUDED.total_score,
          score_vs_par = EXCLUDED.score_vs_par
        RETURNING *`
      return { data: rows[0] }
    }

    case 'get_combined_totals': {
      // Friday AM + Saturday AM totals for Sunday seeding
      const rows = await sql`
        SELECT
          rs.player_id,
          p.name as player_name,
          SUM(COALESCE(rs.total_score, 0)) as combined_score,
          SUM(COALESCE(rs.score_vs_par, 0)) as combined_vs_par,
          (array_agg(rs.hole_scores ORDER BY rs.day) FILTER (WHERE rs.day='friday'))[1] as friday_holes,
          (array_agg(rs.hole_scores ORDER BY rs.day) FILTER (WHERE rs.day='saturday'))[1] as saturday_holes,
          MAX(CASE WHEN rs.day='friday' THEN rs.total_score END) as friday_total,
          MAX(CASE WHEN rs.day='saturday' THEN rs.total_score END) as saturday_total,
          COUNT(*) FILTER (WHERE rs.is_complete) as rounds_complete,
          COUNT(*) as rounds_entered
        FROM round_scores rs
        JOIN players p ON p.id = rs.player_id
        WHERE rs.event_id = ${p.event_id}
          AND rs.is_scramble = false
          AND rs.round_time = 'morning'
          AND rs.day IN ('friday', 'saturday')
        GROUP BY rs.player_id, p.name
        ORDER BY combined_score ASC NULLS LAST`
      return { data: rows }
    }

    // ── SCRAMBLE TEAMS ────────────────────────────────────────────

    case 'get_scramble_teams': {
      const rows = await sql`
        SELECT * FROM scramble_teams
        WHERE event_id = ${p.event_id}
          AND round = ${p.round}
        ORDER BY team_number`
      return { data: rows }
    }

    case 'save_scramble_teams': {
      // Delete existing teams for this round, then insert new
      await sql`DELETE FROM scramble_teams
        WHERE event_id = ${p.event_id} AND round = ${p.round}`
      for (const team of p.teams) {
        // Pass arrays directly — neon handles native Postgres array formatting
        const playerIds = Array.isArray(team.player_ids) ? team.player_ids : JSON.parse(team.player_ids)
        const positions = Array.isArray(team.finishing_positions) ? team.finishing_positions : JSON.parse(team.finishing_positions)
        await sql`
          INSERT INTO scramble_teams (event_id, round, team_number, player_ids, finishing_positions)
          VALUES (${p.event_id}, ${p.round}, ${team.team_number}, ${playerIds}, ${positions})`
      }
      return { data: { ok: true } }
    }

    case 'save_scramble_score': {
      // One team score applied to all 4 players on the team
      const { event_id, course_id, day, round_time, player_ids, score, scramble_team_id } = p
      for (const player_id of player_ids) {
        await sql`
          INSERT INTO round_scores (event_id, player_id, course_id, day, round_time,
            is_scramble, hole_scores, is_complete, scramble_team_id)
          VALUES (${event_id}, ${player_id}, ${course_id}, ${day}, ${round_time},
            true, ${JSON.stringify({"total": score})}, true, ${scramble_team_id || null})
          ON CONFLICT (event_id, player_id, course_id, day, round_time) DO UPDATE SET
            hole_scores = EXCLUDED.hole_scores,
            is_complete = true,
            scramble_team_id = EXCLUDED.scramble_team_id`
      }
      return { data: { ok: true } }
    }

    // ── HISTORY ───────────────────────────────────────────────────

    case 'get_completed_events': {
      const rows = await sql`
        SELECT e.*,
          cf.name as friday_course_name, cs.name as saturday_course_name,
          csun.name as sunday_course_name
        FROM events e
        LEFT JOIN courses cf   ON cf.id   = e.friday_course_id
        LEFT JOIN courses cs   ON cs.id   = e.saturday_course_id
        LEFT JOIN courses csun ON csun.id = e.sunday_course_id
        WHERE e.status = 'complete'
        ORDER BY e.event_date DESC`
      return { data: rows }
    }

    case 'get_event_results': {
      const rows = await sql`
        SELECT rs.player_id, p.name as player_name,
          SUM(COALESCE(rs.total_score, 0)) as combined_score
        FROM round_scores rs
        JOIN players p ON p.id = rs.player_id
        WHERE rs.event_id = ${p.event_id}
          AND rs.is_scramble = false
          AND rs.day IN ('friday', 'saturday')
          AND rs.round_time = 'morning'
          AND rs.is_complete = true
        GROUP BY rs.player_id, p.name
        ORDER BY combined_score ASC`
      return { data: rows }
    }


    // ── GROUPS (morning round tee sheet) ─────────────────────────

    case 'get_groups': {
      // Returns all groups for a day with their players
      const groups = await sql`
        SELECT eg.id, eg.group_number, eg.day,
          json_agg(json_build_object(
            'player_id', p.id,
            'name', p.name
          ) ORDER BY p.name) FILTER (WHERE p.id IS NOT NULL) as players
        FROM event_groups eg
        LEFT JOIN group_players gp ON gp.group_id = eg.id
        LEFT JOIN players p ON p.id = gp.player_id
        WHERE eg.event_id = ${p.event_id} AND eg.day = ${p.day}
        GROUP BY eg.id, eg.group_number, eg.day
        ORDER BY eg.group_number`
      return { data: groups }
    }

    case 'get_player_group': {
      // Find which group a player is in for a given day
      const rows = await sql`
        SELECT eg.id, eg.group_number, eg.day,
          json_agg(json_build_object(
            'player_id', p.id,
            'name', p.name
          ) ORDER BY p.name) as players
        FROM event_groups eg
        JOIN group_players gp ON gp.group_id = eg.id
        JOIN players p ON p.id = gp.player_id
        WHERE eg.event_id = ${p.event_id}
          AND eg.day = ${p.day}
          AND EXISTS (
            SELECT 1 FROM group_players gp2
            WHERE gp2.group_id = eg.id AND gp2.player_id = ${p.player_id}
          )
        GROUP BY eg.id, eg.group_number, eg.day
        LIMIT 1`
      return { data: rows[0] || null }
    }

    case 'save_groups': {
      // Replace all groups for a day: p.groups = [{group_number, player_ids:[]}]
      // Delete existing groups for this day
      await sql`DELETE FROM event_groups WHERE event_id = ${p.event_id} AND day = ${p.day}`
      for (const group of p.groups) {
        const [grp] = await sql`
          INSERT INTO event_groups (event_id, day, group_number)
          VALUES (${p.event_id}, ${p.day}, ${group.group_number})
          RETURNING id`
        for (const pid of group.player_ids) {
          await sql`INSERT INTO group_players (group_id, player_id) VALUES (${grp.id}, ${pid}) ON CONFLICT DO NOTHING`
        }
      }
      return { data: { ok: true } }
    }


    case 'get_players_for_event': {
      // Try event_players first, fall back to group_players if empty
      const fromEventPlayers = await sql`
        SELECT ep.player_id, p.name
        FROM event_players ep
        JOIN players p ON p.id = ep.player_id
        WHERE ep.event_id = ${p.event_id}
        ORDER BY p.name`

      if (fromEventPlayers.length > 0) return { data: fromEventPlayers }

      // Fallback: pull unique players from groups for this event
      const fromGroups = await sql`
        SELECT DISTINCT gp.player_id, p.name
        FROM group_players gp
        JOIN event_groups eg ON eg.id = gp.group_id
        JOIN players p ON p.id = gp.player_id
        WHERE eg.event_id = ${p.event_id}
        ORDER BY p.name`

      return { data: fromGroups }
    }


    case 'get_player_career_stats': {
      const rows = await sql`
        SELECT
          p.id as player_id,
          p.name,
          COUNT(*) FILTER (WHERE rs.is_scramble = false AND rs.is_complete = true) as stroke_rounds,
          ROUND(AVG(
            COALESCE(rs.total_score,
              CASE WHEN rs.hole_scores ? 'total' THEN (rs.hole_scores->>'total')::int END)
          ) FILTER (WHERE rs.is_scramble = false AND rs.is_complete = true), 1) as avg_score,
          MIN(
            COALESCE(rs.total_score,
              CASE WHEN rs.hole_scores ? 'total' THEN (rs.hole_scores->>'total')::int END)
          ) FILTER (WHERE rs.is_scramble = false AND rs.is_complete = true) as best_round,
          MAX(
            COALESCE(rs.total_score,
              CASE WHEN rs.hole_scores ? 'total' THEN (rs.hole_scores->>'total')::int END)
          ) FILTER (WHERE rs.is_scramble = false AND rs.is_complete = true) as worst_round,
          COUNT(*) FILTER (WHERE rs.is_scramble = true AND rs.is_complete = true) as scramble_rounds,
          ROUND(AVG(
            COALESCE(rs.score_vs_par::numeric,
              CASE WHEN rs.hole_scores ? 'total' THEN (rs.hole_scores->>'total')::numeric END)
          ) FILTER (WHERE rs.is_scramble = true AND rs.is_complete = true), 1) as scramble_avg
        FROM players p
        JOIN round_scores rs ON rs.player_id = p.id
        WHERE rs.is_complete = true
        GROUP BY p.id, p.name
        HAVING COUNT(*) FILTER (WHERE rs.is_scramble = false AND rs.is_complete = true) > 0
        ORDER BY avg_score ASC NULLS LAST`
      // Cast BigInt fields to Number for JSON serialization
      return { data: rows.map(r => ({
        ...r,
        stroke_rounds: Number(r.stroke_rounds),
        scramble_rounds: Number(r.scramble_rounds),
        avg_score: r.avg_score ? parseFloat(r.avg_score) : null,
        best_round: r.best_round ? Number(r.best_round) : null,
        worst_round: r.worst_round ? Number(r.worst_round) : null,
        scramble_avg: r.scramble_avg ? parseFloat(r.scramble_avg) : null,
      })) }
    }

    case 'get_course_averages': {
      const rows = await sql`
        SELECT
          p.name as player_name,
          c.name as course_name,
          COUNT(*) as rounds,
          ROUND(AVG(
            COALESCE(rs.total_score,
              CASE WHEN rs.hole_scores ? 'total' THEN (rs.hole_scores->>'total')::int END)
          ), 1) as avg_score,
          MIN(
            COALESCE(rs.total_score,
              CASE WHEN rs.hole_scores ? 'total' THEN (rs.hole_scores->>'total')::int END)
          ) as best,
          c.par
        FROM round_scores rs
        JOIN players p ON p.id = rs.player_id
        JOIN courses c ON c.id = rs.course_id
        WHERE rs.is_scramble = false
          AND rs.is_complete = true
        GROUP BY p.name, c.name, c.par
        ORDER BY c.name, avg_score ASC`
      return { data: rows }
    }

    
    case 'get_scramble_wins': {
      // Find winning team per scramble round (lowest score_vs_par wins)
      const rows = await sql`
        WITH team_totals AS (
          SELECT DISTINCT ON (rs.event_id, rs.day, rs.round_time, rs.scramble_team_id)
            rs.event_id, rs.day, rs.round_time, rs.scramble_team_id,
            rs.score_vs_par as total
          FROM round_scores rs
          WHERE rs.is_scramble = true
            AND rs.scramble_team_id IS NOT NULL
            AND rs.is_complete = true
            AND rs.score_vs_par IS NOT NULL
        ),
        winners AS (
          SELECT DISTINCT ON (event_id, day, round_time)
            event_id, day, round_time, scramble_team_id
          FROM team_totals
          ORDER BY event_id, day, round_time, total ASC
        )
        SELECT
          p.name as player_name,
          COUNT(*) as scramble_wins
        FROM winners w
        JOIN round_scores rs ON rs.scramble_team_id = w.scramble_team_id
          AND rs.event_id = w.event_id AND rs.day = w.day AND rs.round_time = w.round_time
        JOIN players p ON p.id = rs.player_id
        GROUP BY p.name
        ORDER BY scramble_wins DESC`
      return { data: rows }
    }


    case 'reset_round': {
      // Delete all round_scores for a specific round of the current event
      // Commissioner only — used for testing/correction
      const result = await sql`
        DELETE FROM round_scores
        WHERE event_id = ${p.event_id}
          AND day = ${p.day}
          AND round_time = ${p.round_time}
        RETURNING id`
      return { data: { deleted: result.length } }
    }

    case 'reset_scramble_teams': {
      // Delete scramble teams for a round (allows regeneration)
      const result = await sql`
        DELETE FROM scramble_teams
        WHERE event_id = ${p.event_id}
          AND round = ${p.round}
        RETURNING id`
      return { data: { deleted: result.length } }
    }


    case 'get_setting': {
      const rows = await sql`
        SELECT value FROM app_settings WHERE key = ${p.key} LIMIT 1`
      return { data: rows[0]?.value ?? null }
    }

    case 'set_setting': {
      await sql`
        INSERT INTO app_settings (key, value) VALUES (${p.key}, ${p.value})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`
      return { data: { ok: true } }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
// deploy trigger Sun May 24 13:27:52 UTC 2026
