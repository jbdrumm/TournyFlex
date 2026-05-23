// netlify/functions/db.js
// Central database API. All queries from the frontend go through here.
// The DATABASE_URL never leaves the server.

const { neon } = require('@neondatabase/serverless')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' }
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const sql = neon(process.env.DATABASE_URL)

  let body
  try {
    body = JSON.parse(event.body)
  } catch {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

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

    // ── EVENTS ──────────────────────────────────────────────
    case 'get_active_event': {
      const rows = await sql`
        SELECT e.*, c.name as course_name, c.city, c.state, c.par,
               c.slope_rating, c.course_rating
        FROM events e
        LEFT JOIN courses c ON c.id = e.course_id
        WHERE e.status != 'complete'
        ORDER BY e.event_date ASC
        LIMIT 1`
      return { data: rows[0] || null }
    }

    case 'get_current_event': {
      const rows = await sql`
        SELECT e.*, c.name as course_name, c.city, c.state, c.par
        FROM events e
        LEFT JOIN courses c ON c.id = e.course_id
        WHERE e.status NOT IN ('upcoming', 'complete')
        ORDER BY e.event_date DESC
        LIMIT 1`
      return { data: rows[0] || null }
    }

    case 'get_event_with_holes': {
      const events = await sql`
        SELECT e.*, c.name as course_name, c.city, c.state, c.par
        FROM events e
        LEFT JOIN courses c ON c.id = e.course_id
        WHERE e.status NOT IN ('upcoming')
        ORDER BY e.event_date DESC LIMIT 1`
      if (!events[0]) return { data: null }
      const holes = await sql`
        SELECT * FROM course_holes WHERE course_id = ${events[0].course_id}
        ORDER BY hole_number`
      return { data: { ...events[0], holes } }
    }

    case 'list_events': {
      const rows = await sql`
        SELECT e.*, c.name as course_name, c.city, c.state, c.par
        FROM events e LEFT JOIN courses c ON c.id = e.course_id
        ORDER BY e.event_date DESC LIMIT 10`
      return { data: rows }
    }

    case 'upsert_event': {
      const { year, name, course_id, event_date, morning_tee_time, afternoon_tee_time, player_count } = p
      const rows = await sql`
        INSERT INTO events (year, name, course_id, event_date, morning_tee_time, afternoon_tee_time, player_count)
        VALUES (${year}, ${name}, ${course_id || null}, ${event_date}, ${morning_tee_time || null}, ${afternoon_tee_time || null}, ${player_count})
        ON CONFLICT (year) DO UPDATE SET
          name = EXCLUDED.name, course_id = EXCLUDED.course_id,
          event_date = EXCLUDED.event_date, morning_tee_time = EXCLUDED.morning_tee_time,
          afternoon_tee_time = EXCLUDED.afternoon_tee_time, player_count = EXCLUDED.player_count
        RETURNING *`
      return { data: rows[0] }
    }

    case 'update_event_status': {
      const rows = await sql`
        UPDATE events SET status = ${p.status} WHERE id = ${p.id} RETURNING *`
      return { data: rows[0] }
    }

    case 'lock_scores': {
      const rows = await sql`
        UPDATE events SET scores_locked = ${p.locked} WHERE id = ${p.id} RETURNING *`
      return { data: rows[0] }
    }

    // ── COURSES ─────────────────────────────────────────────
    case 'list_courses': {
      const rows = await sql`SELECT * FROM courses ORDER BY name`
      return { data: rows }
    }

    case 'insert_course': {
      const { name, city, state, par, slope_rating, course_rating } = p
      const rows = await sql`
        INSERT INTO courses (name, city, state, par, slope_rating, course_rating)
        VALUES (${name}, ${city || null}, ${state || null}, ${par}, ${slope_rating || null}, ${course_rating || null})
        RETURNING *`
      return { data: rows[0] }
    }

    case 'insert_holes': {
      // p.holes = array of hole objects
      for (const h of p.holes) {
        await sql`
          INSERT INTO course_holes (course_id, hole_number, par, handicap_rank, yardage_white, yardage_blue, yardage_black, yardage_red)
          VALUES (${p.course_id}, ${h.hole_number}, ${h.par}, ${h.handicap_rank},
                  ${h.yardage_white || null}, ${h.yardage_blue || null}, ${h.yardage_black || null}, ${h.yardage_red || null})
          ON CONFLICT (course_id, hole_number) DO UPDATE SET
            par = EXCLUDED.par, handicap_rank = EXCLUDED.handicap_rank,
            yardage_white = EXCLUDED.yardage_white`
      }
      return { data: { ok: true } }
    }

    // ── PLAYERS ─────────────────────────────────────────────
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

    // ── EVENT PLAYERS ────────────────────────────────────────
    case 'get_event_players': {
      const rows = await sql`
        SELECT ep.player_id, p.name
        FROM event_players ep
        JOIN players p ON p.id = ep.player_id
        WHERE ep.event_id = ${p.event_id}`
      return { data: rows }
    }

    case 'toggle_event_player': {
      if (p.add) {
        await sql`
          INSERT INTO event_players (event_id, player_id)
          VALUES (${p.event_id}, ${p.player_id})
          ON CONFLICT (event_id, player_id) DO NOTHING`
      } else {
        await sql`
          DELETE FROM event_players WHERE event_id = ${p.event_id} AND player_id = ${p.player_id}`
      }
      return { data: { ok: true } }
    }

    // ── SCORECARDS ───────────────────────────────────────────
    case 'get_scorecards': {
      const rows = await sql`
        SELECT sc.*, p.name as player_name
        FROM scorecards sc
        JOIN players p ON p.id = sc.player_id
        WHERE sc.event_id = ${p.event_id}`
      return { data: rows }
    }

    case 'get_my_scorecard': {
      const rows = await sql`
        SELECT * FROM scorecards
        WHERE event_id = ${p.event_id} AND player_id = ${p.player_id}
        LIMIT 1`
      return { data: rows[0] || null }
    }

    case 'upsert_scorecard': {
      const { event_id, player_id, hole_scores, total_score, holes_completed, is_complete } = p
      const rows = await sql`
        INSERT INTO scorecards (event_id, player_id, hole_scores, total_score, holes_completed, is_complete, submitted_at, updated_at)
        VALUES (${event_id}, ${player_id}, ${JSON.stringify(hole_scores)}, ${total_score},
                ${holes_completed}, ${is_complete}, ${is_complete ? new Date().toISOString() : null}, NOW())
        ON CONFLICT (event_id, player_id) DO UPDATE SET
          hole_scores = EXCLUDED.hole_scores, total_score = EXCLUDED.total_score,
          holes_completed = EXCLUDED.holes_completed, is_complete = EXCLUDED.is_complete,
          submitted_at = CASE WHEN EXCLUDED.is_complete THEN COALESCE(scorecards.submitted_at, NOW()) ELSE NULL END,
          updated_at = NOW()
        RETURNING *`
      return { data: rows[0] }
    }

    // ── SCRAMBLE TEAMS ───────────────────────────────────────
    case 'get_scramble_teams': {
      const rows = await sql`
        SELECT * FROM scramble_teams WHERE event_id = ${p.event_id} ORDER BY team_number`
      return { data: rows }
    }

    case 'save_scramble_teams': {
      await sql`DELETE FROM scramble_teams WHERE event_id = ${p.event_id}`
      for (const team of p.teams) {
        await sql`
          INSERT INTO scramble_teams (event_id, team_number, player_ids, finishing_positions)
          VALUES (${p.event_id}, ${team.team_number}, ${JSON.stringify(team.player_ids)}, ${JSON.stringify(team.finishing_positions)})`
      }
      return { data: { ok: true } }
    }

    // ── HISTORY ──────────────────────────────────────────────
    case 'get_completed_events': {
      const rows = await sql`
        SELECT e.*, c.name as course_name, c.city, c.state, c.par
        FROM events e LEFT JOIN courses c ON c.id = e.course_id
        WHERE e.status = 'complete'
        ORDER BY e.event_date DESC`
      return { data: rows }
    }

    case 'get_event_results': {
      const rows = await sql`
        SELECT sc.total_score, sc.hole_scores, p.name as player_name
        FROM scorecards sc
        JOIN players p ON p.id = sc.player_id
        WHERE sc.event_id = ${p.event_id} AND sc.is_complete = true
        ORDER BY sc.total_score ASC`
      return { data: rows }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
