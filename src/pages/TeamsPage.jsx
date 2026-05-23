import { useState, useEffect } from 'react'
import { db } from '../lib/db'
import { sortPlayersByScore, generateScrambleTeams } from '../lib/golf'

const TEAM_COLORS = ['#c9a84c','#6ab86a','#4a9eca','#e87040','#a855f7','#ec4899']

export default function TeamsPage() {
  const [teams, setTeams] = useState([])
  const [event, setEvent] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchTeams() }, [])

  const fetchTeams = async () => {
    const { data: ev } = await db('get_event_with_holes')
    if (!ev || !['morning_complete','afternoon_active','complete'].includes(ev.status)) { setLoading(false); return }
    setEvent(ev)

    const { data: existingTeams } = await db('get_scramble_teams', { event_id: ev.id })
    const { data: scorecards } = await db('get_scorecards', { event_id: ev.id })

    const withScores = (scorecards || [])
      .filter(sc => sc.is_complete)
      .map(sc => ({ ...sc, player: { id: sc.player_id, name: sc.player_name }, hole_scores: typeof sc.hole_scores === 'string' ? JSON.parse(sc.hole_scores) : sc.hole_scores || {}, total_score: sc.total_score || 0 }))

    const sorted = sortPlayersByScore(withScores, ev.holes || [])
    const playerMap = {}
    sorted.forEach(sc => { playerMap[sc.player_id] = sc })

    if (existingTeams?.length) {
      const built = existingTeams.map(t => ({
        team_number: t.team_number,
        players: (typeof t.player_ids === 'string' ? JSON.parse(t.player_ids) : t.player_ids).map(pid => playerMap[pid]).filter(Boolean),
        finishing_positions: typeof t.finishing_positions === 'string' ? JSON.parse(t.finishing_positions) : t.finishing_positions,
      }))
      setTeams(built)
    } else if (sorted.length >= 16) {
      try { setTeams(generateScrambleTeams(sorted)) } catch {}
    }
    setLoading(false)
  }

  const par = event?.par

  return (
    <div className="page">
      <div className="container">
        <div className="page-header">
          <div className="eyebrow">Afternoon Round</div>
          <h1>Scramble Teams</h1>
          {event && <p className="text-muted text-sm" style={{ marginTop: 4 }}>Based on morning finishing order</p>}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 48 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
        ) : teams.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <p style={{ fontSize: '2rem', marginBottom: 8 }}>⏳</p>
            <p className="text-muted">Teams will appear once all morning scores are in.</p>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted" style={{ marginBottom: 16, fontFamily: 'var(--font-mono)' }}>{teams.length} teams · {teams.length * 4} players</p>
            {teams.map((team, idx) => (
              <div key={team.team_number} className="team-card" style={{ borderLeftColor: TEAM_COLORS[idx] || 'var(--gold)' }}>
                <div className="team-header">
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700 }}>Team {team.team_number}</span>
                  <span className="text-xs text-muted text-mono">Pos: {team.finishing_positions?.join(', ')}</span>
                </div>
                {team.players.map((sc, pIdx) => {
                  const pos = team.finishing_positions?.[pIdx]
                  const diff = par && sc.total_score ? sc.total_score - par : null
                  return (
                    <div key={sc.player?.id || pIdx} className="team-player">
                      <span className="team-position">#{pos}</span>
                      <span style={{ flex: 1, fontWeight: 500 }}>{sc.player?.name}</span>
                      <span className="text-mono text-sm" style={{ color: 'var(--gray-300)' }}>
                        {sc.total_score}
                        {diff !== null && <span style={{ fontSize: '0.75rem', marginLeft: 4, color: diff > 0 ? 'var(--red)' : diff < 0 ? 'var(--blue-birdie)' : 'var(--gray-500)' }}>({diff > 0 ? `+${diff}` : diff === 0 ? 'E' : diff})</span>}
                      </span>
                    </div>
                  )
                })}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
