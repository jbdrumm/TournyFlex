// netlify/functions/db.js
// Central database API for the Golf Outing app — 3-day weekend format.
// All queries from the frontend go through here. DATABASE_URL never leaves the server.

const { neon } = require('@neondatabase/serverless')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) }

  const sql = neon(process.env.DATABASE_URL)
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
          cf.name as friday_course_name,   cf.par as friday_par,
          cs.name as saturday_course_name, cs.par as saturday_par,
          csun.name as sunday_course_name, csun.par as sunday_par
        FROM events e
        LEFT JOIN courses cf   ON cf.id   = e.friday_course_id
        LEFT JOIN courses cs   ON cs.id   = e.saturday_course_id
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
        SELECT * FROM course_holes WHERE course_id = ${p.course_id}
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
      // Get all scores for a specific round (day + round_time)
      const rows = await sql`
        SELECT rs.*, p.name as player_name
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
        SELECT * FROM round_scores
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
        ORDER BY rs.day, rs.round_time, rs.total_score`
      return { data: rows }
    }

    case 'upsert_round_score': {
      const { event_id, player_id, course_id, day, round_time, is_scramble,
              hole_scores, total_score, holes_completed, is_complete, scramble_team_id } = p
      const rows = await sql`
        INSERT INTO round_scores (event_id, player_id, course_id, day, round_time,
          is_scramble, hole_scores, total_score, holes_completed, is_complete,
          scramble_team_id)
        VALUES (${event_id}, ${player_id}, ${course_id}, ${day}, ${round_time},
          ${is_scramble || false}, ${JSON.stringify(hole_scores || {})},
          ${total_score || 0}, ${holes_completed || 0}, ${is_complete || false},
          ${scramble_team_id || null})
        ON CONFLICT (event_id, player_id, course_id, day, round_time) DO UPDATE SET
          hole_scores = EXCLUDED.hole_scores,
          total_score = EXCLUDED.total_score,
          holes_completed = EXCLUDED.holes_completed,
          is_complete = EXCLUDED.is_complete,
          scramble_team_id = EXCLUDED.scramble_team_id
        RETURNING *`
      return { data: rows[0] }
    }

    case 'get_combined_totals': {
      // Friday AM + Saturday AM totals for Sunday seeding
      const rows = await sql`
        SELECT
          rs.player_id,
          p.name as player_name,
          SUM(rs.total_score) as combined_score,
          MAX(CASE WHEN rs.day='friday' THEN rs.hole_scores END) as friday_holes,
          MAX(CASE WHEN rs.day='saturday' THEN rs.hole_scores END) as saturday_holes,
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
        await sql`
          INSERT INTO scramble_teams (event_id, round, team_number, player_ids, finishing_positions)
          VALUES (${p.event_id}, ${p.round}, ${team.team_number},
            ${JSON.stringify(team.player_ids)}, ${JSON.stringify(team.finishing_positions)})`
      }
      return { data: { ok: true } }
    }

    case 'save_scramble_score': {
      // One team score applied to all 4 players on the team
      const { event_id, course_id, day, round_time, player_ids, score, scramble_team_id } = p
      for (const player_id of player_ids) {
        await sql`
          INSERT INTO round_scores (event_id, player_id, course_id, day, round_time,
            is_scramble, score, total_score, is_complete, scramble_team_id, hole_scores, updated_at)
          VALUES (${event_id}, ${player_id}, ${course_id}, ${day}, ${round_time},
            true, ${score}, ${score}, true, ${scramble_team_id || null}, '{}', NOW())
          ON CONFLICT (event_id, player_id, course_id, day, round_time) DO UPDATE SET
            score = EXCLUDED.score, total_score = EXCLUDED.score,
            is_complete = true, updated_at = NOW()`
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
      // Stroke play results: combined Fri AM + Sat AM
      const rows = await sql`
        SELECT rs.player_id, p.name as player_name,
          SUM(rs.total_score) as combined_score,
          MIN(rs.total_score) as best_round,
          MAX(rs.total_score) as worst_round
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

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
// deploy trigger Sun May 24 13:27:52 UTC 2026
