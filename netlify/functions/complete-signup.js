// complete-signup — first-time signup OR claim-an-existing-stub-by-phone.
//
// Flow:
//   1. Verify Supabase JWT. Extract auth_user_id + phone.
//   2. Look for an existing players row with that phone.
//   3. If found and unclaimed (auth_user_id IS NULL): UPDATE — set auth + fields.
//      If found and already claimed by *this same* auth_user_id: idempotent update.
//      If found and claimed by *a different* auth_user_id: 409 (someone else
//      grabbed it already; should not happen under partial-UNIQUE on phone, but
//      we belt-and-suspenders the check).
//   4. If not found: INSERT a brand-new player row.
//
// Schema notes:
//   - `name` is set to `${first_name} ${last_name}`. `display_name` (generated
//     column) auto-mirrors `name`.
//   - `tos_accepted_at` is set to now() — its non-NULL value is the "signup
//     complete" gate used by the frontend.
//   - All client-provided fields are explicitly listed; never trust the body
//     shape blindly.

import { createClient } from '@supabase/supabase-js'
import postgres from 'postgres'

// Anon key is sufficient — see note in get-my-player.js.
const sb = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 })

const VALID_GENDERS = ['male', 'female', 'nonbinary', 'prefer_not_to_say']

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'POST only' }) }
  }

  // ---- Auth ----
  const authHeader = event.headers.authorization || event.headers.Authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Missing auth' }) }
  }
  const token = authHeader.slice('Bearer '.length)
  const { data: userData, error: userErr } = await sb.auth.getUser(token)
  if (userErr || !userData?.user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) }
  }
  const authUid = userData.user.id
  const authPhone = userData.user.phone ? `+${userData.user.phone}` : null
  // Supabase Auth stores phone without leading '+'; normalize here.
  if (!authPhone) {
    return { statusCode: 400, body: JSON.stringify({ error: 'No phone on auth user' }) }
  }

  // ---- Body ----
  let body
  try { body = JSON.parse(event.body || '{}') } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  const firstName = (body.first_name || '').trim()
  const lastName = (body.last_name || '').trim()
  const displayName = (body.display_name || '').trim() || `${firstName} ${lastName}`.trim()
  const email = (body.email || '').trim().toLowerCase()
  const birthdate = body.birthdate || null
  const gender = body.gender || null
  const starterIndex = body.starter_handicap_index ?? null
  const ghin = body.ghin_number?.trim() || null
  const tosAccepted = !!body.tos_accepted
  const marketingOptIn = !!body.marketing_opt_in

  const missing = []
  if (!firstName) missing.push('first_name')
  if (!lastName) missing.push('last_name')
  if (!email) missing.push('email')
  if (!birthdate) missing.push('birthdate')
  if (!gender) missing.push('gender')
  if (!tosAccepted) missing.push('tos_accepted')
  if (missing.length) {
    return { statusCode: 400, body: JSON.stringify({ error: `Missing: ${missing.join(', ')}` }) }
  }
  if (!VALID_GENDERS.includes(gender)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid gender' }) }
  }

  // ---- DB ----
  try {
    const existing = await sql`
      SELECT id, auth_user_id FROM players WHERE phone = ${authPhone} LIMIT 1
    `

    let row
    if (existing.length > 0) {
      const stub = existing[0]
      if (stub.auth_user_id && stub.auth_user_id !== authUid) {
        return {
          statusCode: 409,
          body: JSON.stringify({ error: 'This phone is already linked to another account.' }),
        }
      }
      const result = await sql`
        UPDATE players SET
          auth_user_id = ${authUid},
          name = ${displayName},
          phone = ${authPhone},
          email = ${email},
          first_name = ${firstName},
          last_name = ${lastName},
          birthdate = ${birthdate},
          gender = ${gender},
          starter_handicap_index = ${starterIndex},
          ghin_number = ${ghin},
          tos_accepted_at = now(),
          marketing_opt_in = ${marketingOptIn}
        WHERE id = ${stub.id}
        RETURNING *
      `
      row = result[0]
    } else {
      const result = await sql`
        INSERT INTO players (
          auth_user_id, name, phone, email, first_name, last_name,
          birthdate, gender, starter_handicap_index, ghin_number,
          tos_accepted_at, marketing_opt_in
        ) VALUES (
          ${authUid}, ${displayName}, ${authPhone}, ${email}, ${firstName}, ${lastName},
          ${birthdate}, ${gender}, ${starterIndex}, ${ghin},
          now(), ${marketingOptIn}
        )
        RETURNING *
      `
      row = result[0]
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: row }),
    }
  } catch (e) {
    // unique_violation = email already in use by a different stub
    if (e.code === '23505') {
      return { statusCode: 409, body: JSON.stringify({ error: 'Email already in use.' }) }
    }
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) }
  }
}
