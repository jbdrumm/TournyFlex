// get-my-player — returns the players row for the authenticated user.
//
// Used by AuthContext on app load and after OTP verify, to know whether the
// user has completed signup (tos_accepted_at IS NOT NULL).
//
// Auth: requires a Supabase access token in the Authorization header.
// Server bypasses RLS via DATABASE_URL service-role connection.

import { createClient } from '@supabase/supabase-js'
import postgres from 'postgres'

// Note: anon key is sufficient for sb.auth.getUser(token) — the token itself
// is what gets validated; the apikey just gets us past Supabase's API gateway.
// We don't run RLS-bypassing queries here (DB writes use postgres.js via
// DATABASE_URL, which has its own service-role-equivalent access).
const sb = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 })

export const handler = async (event) => {
  const authHeader = event.headers.authorization || event.headers.Authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Missing auth' }) }
  }
  const token = authHeader.slice('Bearer '.length)

  const { data: userData, error: userErr } = await sb.auth.getUser(token)
  if (userErr || !userData?.user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) }
  }

  try {
    const rows = await sql`
      SELECT * FROM players
      WHERE auth_user_id = ${userData.user.id}
      LIMIT 1
    `
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: rows[0] || null }),
    }
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) }
  }
}
