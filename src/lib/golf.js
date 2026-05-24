/**
 * Golf Outing — core scoring logic
 * 3-day weekend format:
 *   Friday AM:   stroke play (individual, seeding round 1)
 *   Friday PM:   4-man scramble (teams from Friday AM order)
 *   Saturday AM: stroke play (individual, seeding round 2)
 *   Saturday PM: 4-man scramble (teams from Saturday AM order)
 *   Sunday AM:   4-man scramble (teams seeded by Fri AM + Sat AM combined)
 */

/**
 * Sort players by gross score with handicap-hole tiebreaker.
 * Used for per-round leaderboards AND combined totals for Sunday seeding.
 *
 * @param {Array} scorecards  - [{ player_id, player_name, total_score, hole_scores }]
 * @param {Array} courseHoles - [{ hole_number, handicap_rank }]
 * @returns {Array} sorted with finishing_position added
 */
export function sortPlayersByScore(scorecards, courseHoles = []) {
  const holesByHandicap = [...courseHoles]
    .sort((a, b) => a.handicap_rank - b.handicap_rank)
    .map(h => h.hole_number)

  const sorted = [...scorecards].sort((a, b) => {
    if (a.total_score !== b.total_score) return a.total_score - b.total_score

    // Tiebreaker: walk holes in handicap difficulty order
    for (const holeNum of holesByHandicap) {
      const scoreA = a.hole_scores?.[String(holeNum)] ?? 99
      const scoreB = b.hole_scores?.[String(holeNum)] ?? 99
      if (scoreA !== scoreB) return scoreA - scoreB
    }
    return (a.player_name || '').localeCompare(b.player_name || '')
  })

  return sorted.map((sc, idx) => ({ ...sc, finishing_position: idx + 1 }))
}

/**
 * Sort players by COMBINED Fri AM + Sat AM score for Sunday seeding.
 * Tiebreaker: worst hole on Friday's #1 handicap hole, then Saturday's #1, etc.
 *
 * @param {Array} combined     - [{ player_id, player_name, combined_score, friday_holes, saturday_holes }]
 * @param {Array} fridayHoles  - [{ hole_number, handicap_rank }]
 * @param {Array} saturdayHoles - [{ hole_number, handicap_rank }]
 */
export function sortCombinedForSunday(combined, fridayHoles = [], saturdayHoles = []) {
  const friByHcp = [...fridayHoles].sort((a, b) => a.handicap_rank - b.handicap_rank).map(h => h.hole_number)
  const satByHcp = [...saturdayHoles].sort((a, b) => a.handicap_rank - b.handicap_rank).map(h => h.hole_number)

  const sorted = [...combined].sort((a, b) => {
    if (a.combined_score !== b.combined_score) return a.combined_score - b.combined_score

    // Tiebreaker 1: Friday holes in handicap order
    const friA = parseHoles(a.friday_holes)
    const friB = parseHoles(b.friday_holes)
    for (const holeNum of friByHcp) {
      const sA = friA[String(holeNum)] ?? 99
      const sB = friB[String(holeNum)] ?? 99
      if (sA !== sB) return sA - sB
    }

    // Tiebreaker 2: Saturday holes in handicap order
    const satA = parseHoles(a.saturday_holes)
    const satB = parseHoles(b.saturday_holes)
    for (const holeNum of satByHcp) {
      const sA = satA[String(holeNum)] ?? 99
      const sB = satB[String(holeNum)] ?? 99
      if (sA !== sB) return sA - sB
    }

    return (a.player_name || '').localeCompare(b.player_name || '')
  })

  return sorted.map((p, idx) => ({ ...p, seed_position: idx + 1 }))
}

function parseHoles(h) {
  if (!h) return {}
  if (typeof h === 'string') { try { return JSON.parse(h) } catch { return {} } }
  return h
}

/**
 * Generate scramble teams via snake draft.
 * Works for 16 (4 teams), 20 (5 teams), 24 (6 teams).
 * Team 1: picks 1, 2N, 2N+1, 4N  (e.g. 20 players: 1,10,11,20)
 */
export function generateScrambleTeams(sortedPlayers) {
  const n = sortedPlayers.length
  const teamCount = n / 4
  if (![4, 5, 6].includes(teamCount)) {
    throw new Error(`Invalid player count: ${n}. Must be 16, 20, or 24.`)
  }

  const teams = Array.from({ length: teamCount }, (_, i) => ({
    team_number: i + 1,
    players: [],
    finishing_positions: [],
  }))

  const rounds = [
    [...Array(teamCount).keys()],
    [...Array(teamCount).keys()].reverse(),
    [...Array(teamCount).keys()],
    [...Array(teamCount).keys()].reverse(),
  ]

  let idx = 0
  for (const round of rounds) {
    for (const teamIdx of round) {
      if (idx < sortedPlayers.length) {
        teams[teamIdx].players.push(sortedPlayers[idx])
        teams[teamIdx].finishing_positions.push(idx + 1)
        idx++
      }
    }
  }
  return teams
}

export function calculateTotal(holeScores) {
  if (!holeScores) return 0
  const scores = typeof holeScores === 'string' ? JSON.parse(holeScores) : holeScores
  return Object.values(scores).reduce((sum, s) => sum + (parseInt(s) || 0), 0)
}

export function scoreVsPar(total, par) {
  if (!total || !par) return null
  const diff = total - par
  return diff === 0 ? 'E' : diff > 0 ? `+${diff}` : `${diff}`
}

export function holeScoreClass(score, par) {
  if (!score || !par) return ''
  const diff = score - par
  if (diff <= -2) return 'eagle'
  if (diff === -1) return 'birdie'
  if (diff === 0) return 'par'
  if (diff === 1) return 'bogey'
  if (diff === 2) return 'double'
  return 'triple'
}

export function formatTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':')
  const hour = parseInt(h)
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`
}

export function formatDate(d) {
  if (!d) return ''
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  })
}

// Round definitions — used throughout the app
export const ROUNDS = [
  { day: 'friday',   round_time: 'morning',   label: 'Friday Morning',   is_scramble: false },
  { day: 'friday',   round_time: 'afternoon', label: 'Friday Afternoon', is_scramble: true  },
  { day: 'saturday', round_time: 'morning',   label: 'Saturday Morning', is_scramble: false },
  { day: 'saturday', round_time: 'afternoon', label: 'Saturday Afternoon', is_scramble: true },
  { day: 'sunday',   round_time: 'morning',   label: 'Sunday Scramble',  is_scramble: true  },
]

export const STATUS_FLOW = [
  { status: 'upcoming',                   label: 'Upcoming',             round: null },
  { status: 'friday_morning_active',      label: 'Fri AM Live',          round: 'friday_morning' },
  { status: 'friday_afternoon_active',    label: 'Fri PM Scramble Live', round: 'friday_afternoon' },
  { status: 'saturday_morning_active',    label: 'Sat AM Live',          round: 'saturday_morning' },
  { status: 'saturday_afternoon_active',  label: 'Sat PM Scramble Live', round: 'saturday_afternoon' },
  { status: 'sunday_morning_active',      label: 'Sun Scramble Live',    round: 'sunday_morning' },
  { status: 'complete',                   label: 'Complete',             round: null },
]

export function getActiveRound(status) {
  return STATUS_FLOW.find(s => s.status === status) || null
}

export function getCourseForRound(event, day) {
  if (day === 'friday')   return { id: event.friday_course_id,   name: event.friday_course_name,   par: event.friday_par }
  if (day === 'saturday') return { id: event.saturday_course_id, name: event.saturday_course_name, par: event.saturday_par }
  if (day === 'sunday')   return { id: event.sunday_course_id,   name: event.sunday_course_name,   par: event.sunday_par }
  return null
}
