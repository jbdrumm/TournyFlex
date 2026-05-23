/**
 * Sorts players by gross score, using handicap hole difficulty as tiebreaker.
 * @param {Array} scorecards - Array of { player, hole_scores, total_score }
 * @param {Array} courseHoles - Array of { hole_number, handicap_rank }
 * @returns {Array} sorted scorecards with finishing_position added
 */
export function sortPlayersByScore(scorecards, courseHoles) {
  // Build handicap order: hole sorted by handicap_rank ascending (1 = hardest = first tiebreaker)
  const holesByHandicap = [...courseHoles]
    .sort((a, b) => a.handicap_rank - b.handicap_rank)
    .map(h => h.hole_number)

  const sorted = [...scorecards].sort((a, b) => {
    // Primary: total score (lower is better)
    if (a.total_score !== b.total_score) {
      return a.total_score - b.total_score
    }

    // Tiebreaker: walk through holes in handicap difficulty order
    for (const holeNum of holesByHandicap) {
      const scoreA = a.hole_scores?.[String(holeNum)] ?? 99
      const scoreB = b.hole_scores?.[String(holeNum)] ?? 99
      if (scoreA !== scoreB) {
        return scoreA - scoreB // lower score on hardest hole wins
      }
    }

    // Perfect tie — alphabetical
    return (a.player?.name || '').localeCompare(b.player?.name || '')
  })

  return sorted.map((sc, idx) => ({ ...sc, finishing_position: idx + 1 }))
}

/**
 * Generates scramble teams using snake draft from finishing order.
 * Team 1: 1, 10, 11, 20
 * Team 2: 2, 9,  12, 19
 * etc.
 * Works for 16 (4 teams), 20 (5 teams), 24 (6 teams)
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
    finishing_positions: []
  }))

  // Snake draft: round 1 goes 1..teamCount, round 2 reverses, etc.
  // Round 1 (picks 1-teamCount): positions 1, 2, 3, ... teamCount → teams 1..teamCount
  // Round 2 (picks teamCount+1 to 2*teamCount): positions reversed → teams teamCount..1
  // Round 3: same as round 1
  // Round 4: same as round 2

  const rounds = [
    [...Array(teamCount).keys()],                           // 0,1,2,3,4  (ascending)
    [...Array(teamCount).keys()].reverse(),                  // 4,3,2,1,0  (descending)
    [...Array(teamCount).keys()],
    [...Array(teamCount).keys()].reverse()
  ]

  let playerIdx = 0
  for (const round of rounds) {
    for (const teamIdx of round) {
      if (playerIdx < sortedPlayers.length) {
        teams[teamIdx].players.push(sortedPlayers[playerIdx])
        teams[teamIdx].finishing_positions.push(playerIdx + 1)
        playerIdx++
      }
    }
  }

  return teams
}

/**
 * Calculates total score from hole_scores object
 */
export function calculateTotal(holeScores) {
  if (!holeScores) return 0
  return Object.values(holeScores).reduce((sum, s) => sum + (parseInt(s) || 0), 0)
}

/**
 * Calculates score relative to par
 */
export function scoreVsPar(total, par) {
  if (!total || !par) return null
  const diff = total - par
  if (diff === 0) return 'E'
  return diff > 0 ? `+${diff}` : `${diff}`
}

/**
 * Returns CSS class for score coloring vs par on a single hole
 */
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
