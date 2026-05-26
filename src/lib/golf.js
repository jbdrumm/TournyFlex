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
    // Not started always goes to the bottom
    if (a.not_started && !b.not_started) return 1
    if (b.not_started && !a.not_started) return -1
    if (a.not_started && b.not_started) return (a.player_name || '').localeCompare(b.player_name || '')
    // Primary: total score (lower is better)
    if (a.total_score !== b.total_score) return a.total_score - b.total_score

    // Tiebreaker 1: finished rounds rank above in-progress
    const aFin = a.is_complete || a.holes_completed >= 18
    const bFin = b.is_complete || b.holes_completed >= 18
    if (aFin && !bFin) return -1
    if (bFin && !aFin) return 1

    // Tiebreaker 2: among in-progress, more holes played ranks higher
    // (closer to finishing = less volatile = awarded higher position)
    const aHoles = a.holes_completed || Object.keys(a.hole_scores || {}).length
    const bHoles = b.holes_completed || Object.keys(b.hole_scores || {}).length
    if (!aFin && !bFin && aHoles !== bHoles) return bHoles - aHoles

    // Tiebreaker 3: handicap hole order (for final locked standings)
    for (const holeNum of holesByHandicap) {
      const scoreA = a.hole_scores?.[String(holeNum)] ?? 99
      const scoreB = b.hole_scores?.[String(holeNum)] ?? 99
      if (scoreA !== scoreB) return scoreA - scoreB
    }

    // Last resort: alphabetical
    return (a.player_name || '').localeCompare(b.player_name || '')
  })

  // Assign positions — tied players share the first position number in their group
  // Next non-tied player skips positions equal to tie group size
  // e.g. 2-way tie at #4 → both show 4 (or blank), next player is #6
  return sorted.map((sc, idx) => {
    // Find start of this player's tie group (first player with same score)
    let groupStart = idx
    while (groupStart > 0 && sorted[groupStart - 1].total_score === sc.total_score &&
           !sorted[groupStart - 1].not_started && !sc.not_started) {
      groupStart--
    }
    const position = groupStart + 1  // 1-based position of the tie group leader
    const isTied = groupStart < idx  // not the first in the group
    return { ...sc, finishing_position: position, is_tied: isTied }
  })
}

/**
 * Sort players by COMBINED Fri AM + Sat AM score for Sunday seeding.
 *
 * Tiebreaker: for each handicap rank 1–18, add the player's score on
 * Friday's #N handicap hole + Saturday's #N handicap hole. Lower sum wins.
 * Example: TB#1 = Hemlock hole 7 score + Manistee hole 5 score (both hdcp #1)
 *
 * @param {Array} combined      - [{ player_id, player_name, combined_score, friday_holes, saturday_holes }]
 * @param {Array} fridayHoles   - [{ hole_number, handicap_rank }]
 * @param {Array} saturdayHoles - [{ hole_number, handicap_rank }]
 */
export function sortCombinedForSunday(combined, fridayHoles = [], saturdayHoles = []) {
  // Build map: handicap_rank -> hole_number for each course
  const friHoleByRank = {}
  fridayHoles.forEach(h => { friHoleByRank[h.handicap_rank] = h.hole_number })

  const satHoleByRank = {}
  saturdayHoles.forEach(h => { satHoleByRank[h.handicap_rank] = h.hole_number })

  const maxRank = Math.max(
    ...Object.keys(friHoleByRank).map(Number),
    ...Object.keys(satHoleByRank).map(Number),
    18
  )

  const sorted = [...combined].sort((a, b) => {
    if (a.combined_score !== b.combined_score) return a.combined_score - b.combined_score

    const friA = parseHoles(a.friday_holes)
    const friB = parseHoles(b.friday_holes)
    const satA = parseHoles(a.saturday_holes)
    const satB = parseHoles(b.saturday_holes)

    // Walk handicap ranks 1..18
    // TB for rank N = (Fri hdcp-N hole score) + (Sat hdcp-N hole score)
    for (let rank = 1; rank <= maxRank; rank++) {
      const friHole = friHoleByRank[rank]
      const satHole = satHoleByRank[rank]

      const friScoreA = friHole ? (friA[String(friHole)] ?? 99) : 0
      const friScoreB = friHole ? (friB[String(friHole)] ?? 99) : 0
      const satScoreA = satHole ? (satA[String(satHole)] ?? 99) : 0
      const satScoreB = satHole ? (satB[String(satHole)] ?? 99) : 0

      const sumA = friScoreA + satScoreA
      const sumB = friScoreB + satScoreB

      if (sumA !== sumB) return sumA - sumB
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
export function generateScrambleTeams(sortedPlayers, { forceTeamCount = null } = {}) {
  const n = sortedPlayers.length
  if (n < 4) throw new Error(`Need at least 4 players to form a team.`)

  // Determine team count: prefer even teams of 4, allow override for unusual counts
  let teamCount
  if (forceTeamCount) {
    teamCount = forceTeamCount
  } else if (n % 4 === 0) {
    teamCount = n / 4
  } else {
    // Round up — some teams will have 3 players
    teamCount = Math.ceil(n / 4)
  }

  const teams = Array.from({ length: teamCount }, (_, i) => ({
    team_number: i + 1,
    players: [],
    finishing_positions: [],
  }))

  // Snake draft: rounds alternate direction
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

export function getCourseForRound(event, day, round_time = 'morning') {
  if (day === 'friday') {
    // Use PM course if split and afternoon round
    if (round_time === 'afternoon' && event.friday_pm_course_id) {
      return { id: event.friday_pm_course_id, name: event.friday_pm_course_name, par: event.friday_pm_par }
    }
    return { id: event.friday_course_id, name: event.friday_course_name, par: event.friday_par }
  }
  if (day === 'saturday') {
    if (round_time === 'afternoon' && event.saturday_pm_course_id) {
      return { id: event.saturday_pm_course_id, name: event.saturday_pm_course_name, par: event.saturday_pm_par }
    }
    return { id: event.saturday_course_id, name: event.saturday_course_name, par: event.saturday_par }
  }
  if (day === 'sunday') return { id: event.sunday_course_id, name: event.sunday_course_name, par: event.sunday_par }
  return null
}
