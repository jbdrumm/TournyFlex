import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { sortPlayersByScore, generateScrambleTeams } from '../lib/golf'

const TEAM_COLORS = ['#c9a84c', '#6ab86a', '#4a9eca', '#e87040', '#a855f7', '#ec4899']

export default function TeamsPage() {
  const [teams, setTeams] = useState([])
  const [event, setEvent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [standings, setStandings] = useState([])

  useEffect(() => {
    fetchTeams()
  }, [])

  const fetchTeams = async () => {
    // Get most recent event that has morning scores
    const { data: ev } = await supabase
      .from('events')
      .select('*, courses(par, course_holes(hole_number, handicap_rank, par))')
      .in('status', ['morning_complete', 'afternoon_active', 'complete'])
      .order('event_date', { ascending: false })
      .limit(1)
      .single()

    if (!ev) { setLoading(false); return }
    setEvent(ev)

    // Check if teams are already stored
    const { data: existingTeams } = await supabase
      .from('scramble_teams')
      .select('*')
      .eq('event_id', ev.id)
      .order('team_number')

    // Get scorecards + players
    const { data: scorecards } = await supabase
      .from('scorecards')
      .select('*, players(id, name)')
      .eq('event_id', ev.id)
      .eq('is_complete', true)

    const courseHoles = ev.courses?.course_holes || []

    const withScores = (scorecards || []).map(sc => ({
      ...sc,
      player: sc.players,
      total_score: sc.total_score || Object.values(sc.hole_scores || {}).reduce((a, b) => a + b, 0)
    }))

    const sorted = sortPlayersByScore(withScores, courseHoles)
    setStandings(sorted)

    if (existingTeams?.length) {
      // Rebuild teams from stored data + player names
      const playerMap = {}
      sorted.forEach(sc => { playerMap[sc.player.id] = sc })

      const built = existingTeams.map(t => ({
        team_number: t.team_number,
        players: t.player_ids.map(pid => playerMap[pid]).filter(Boolean),
        finishing_positions: t.finishing_positions,
      }))
      setTeams(built)
    } else if (sorted.length >= 16) {
      try {
        const generated = generateScrambleTeams(sorted)
        setTeams(generated)
      } catch {}
    }

    setLoading(false)
  }

  const par = event?.courses?.par

  return (
    <div className="page">
      <div className="container">
        <div className="page-header">
          <div className="eyebrow">Afternoon Round</div>
          <h1>Scramble Teams</h1>
          {event && (
            <p className="text-muted text-sm" style={{ marginTop: 4 }}>
              Based on morning finishing order
            </p>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        ) : teams.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <p style={{ fontSize: '2rem', marginBottom: 8 }}>⏳</p>
            <p className="text-muted">Teams will be generated once all morning scores are submitted.</p>
            {standings.length > 0 && (
              <p className="text-xs text-muted" style={{ marginTop: 8 }}>
                {standings.length} players have finished so far
              </p>
            )}
          </div>
        ) : (
          <>
            <p className="text-xs text-muted" style={{ marginBottom: 16, fontFamily: 'var(--font-mono)' }}>
              {teams.length} teams · {teams.length * 4} players
            </p>

            {teams.map((team, idx) => (
              <div key={team.team_number} className="team-card" style={{ borderLeftColor: TEAM_COLORS[idx] || 'var(--gold)' }}>
                <div className="team-header">
                  <div>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700 }}>
                      Team {team.team_number}
                    </span>
                  </div>
                  <span className="text-xs text-muted text-mono">
                    Pos: {team.finishing_positions?.join(', ')}
                  </span>
                </div>

                {team.players.map((sc, pIdx) => {
                  const pos = team.finishing_positions?.[pIdx]
                  const diff = par && sc.total_score ? sc.total_score - par : null
                  return (
                    <div key={sc.player?.id || pIdx} className="team-player">
                      <span className="team-position">#{pos}</span>
                      <span style={{ flex: 1, fontWeight: 500 }}>{sc.player?.name || 'Unknown'}</span>
                      <span className="text-mono text-sm" style={{ color: 'var(--gray-300)' }}>
                        {sc.total_score}
                        {diff !== null && (
                          <span style={{ fontSize: '0.75rem', marginLeft: 4, color: diff > 0 ? 'var(--red)' : diff < 0 ? 'var(--blue-birdie)' : 'var(--gray-500)' }}>
                            ({diff > 0 ? `+${diff}` : diff === 0 ? 'E' : diff})
                          </span>
                        )}
                      </span>
                    </div>
                  )
                })}
              </div>
            ))}

            {/* Snake draft explanation */}
            <div className="card card-sm" style={{ marginTop: 8 }}>
              <p className="text-xs text-muted" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>Team Formation</p>
              <p className="text-xs text-muted">
                Teams are balanced via snake draft from morning standings.
                Team 1 gets positions 1, {teams.length * 2 - 1 + 2}, {teams.length * 2 + 1}, {teams.length * 4} — one top finisher, two mid, one late.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
