import { useState, useEffect } from 'react'
import { db } from '../lib/db'
import { useAuth } from '../contexts/AuthContext'
import { sortPlayersByScore, sortCombinedForSunday, generateScrambleTeams, getCourseForRound, ROUNDS } from '../lib/golf'

const TEAM_COLORS = ['#c9a84c','#6ab86a','#4a9eca','#e87040','#a855f7','#ec4899']
const SCRAMBLE_ROUNDS = [
  { key: 'friday_afternoon',    label: 'Friday PM Scramble',   day: 'friday',   round_time: 'afternoon', seeded_by: 'friday_morning' },
  { key: 'saturday_afternoon',  label: 'Saturday PM Scramble', day: 'saturday', round_time: 'afternoon', seeded_by: 'saturday_morning' },
  { key: 'sunday_morning',      label: 'Sunday Scramble',      day: 'sunday',   round_time: 'morning',   seeded_by: 'combined' },
]

export default function TeamsPage() {
  const { isCommissioner } = useAuth()
  const [event, setEvent] = useState(null)
  const [selectedRound, setSelectedRound] = useState('friday_afternoon')
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [scrambleScore, setScrambleScore] = useState({}) // teamNum -> score input
  const [savingScore, setSavingScore] = useState(null)
  const [toast, setToast] = useState(null)

  useEffect(() => { fetchAll() }, [])
  useEffect(() => { if (event) fetchTeams(event) }, [selectedRound])

  const fetchAll = async () => {
    const { data: ev } = await db('get_current_event')
    if (!ev) { setLoading(false); return }
    setEvent(ev)
    await fetchTeams(ev)
  }

  const fetchTeams = async (ev) => {
    setLoading(true)
    const roundKey = selectedRound
    const roundDef = SCRAMBLE_ROUNDS.find(r => r.key === roundKey)
    if (!roundDef) { setLoading(false); return }

    // Get existing saved teams
    const { data: existingTeams } = await db('get_scramble_teams', { event_id: ev.id, round: roundKey })

    if (existingTeams?.length) {
      // Rebuild with player names
      let playerMap = {}
      if (roundDef.seeded_by === 'combined') {
        const { data: combined } = await db('get_combined_totals', { event_id: ev.id })
        combined?.forEach(p => { playerMap[p.player_id] = p })
      } else {
        const [day, rt] = roundDef.seeded_by.split('_')
        const { data: scores } = await db('get_round_scores', { event_id: ev.id, day, round_time: rt })
        scores?.forEach(s => { playerMap[s.player_id] = s })
      }
      const built = existingTeams.map(t => ({
        ...t,
        player_ids: typeof t.player_ids === 'string' ? JSON.parse(t.player_ids) : t.player_ids,
        finishing_positions: typeof t.finishing_positions === 'string' ? JSON.parse(t.finishing_positions) : t.finishing_positions,
        players: (typeof t.player_ids === 'string' ? JSON.parse(t.player_ids) : t.player_ids)
          .map(pid => playerMap[pid]).filter(Boolean),
      }))
      setTeams(built)
    } else {
      setTeams([])
    }
    setLoading(false)
  }

  const handleSaveScrambleScore = async (team) => {
    const score = parseInt(scrambleScore[team.team_number])
    if (isNaN(score)) return
    setSavingScore(team.team_number)

    const roundDef = SCRAMBLE_ROUNDS.find(r => r.key === selectedRound)
    const course = getCourseForRound(event, roundDef.day)
    const playerIds = team.players.map(p => p.player_id || p.id)

    await db('save_scramble_score', {
      event_id: event.id,
      course_id: course?.id,
      day: roundDef.day,
      round_time: roundDef.round_time,
      player_ids: playerIds,
      score,
      scramble_team_id: team.id,
    })

    setSavingScore(null)
    setScrambleScore(s => ({ ...s, [team.team_number]: '' }))
    showToast(`Team ${team.team_number} score saved!`, 'success')
  }

  const showToast = (msg, type) => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  const roundDef = SCRAMBLE_ROUNDS.find(r => r.key === selectedRound)

  return (
    <div className="page">
      <div className="container">
        <div className="page-header">
          <div className="eyebrow">Scramble Teams</div>
          <h1>Teams</h1>
        </div>

        {/* Round selector */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
          {SCRAMBLE_ROUNDS.map(r => (
            <button key={r.key} onClick={() => setSelectedRound(r.key)}
              style={{ flex: 1, padding: '8px 6px', border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer', background: selectedRound === r.key ? 'var(--gold)' : 'var(--green-dark)', color: selectedRound === r.key ? 'var(--green-deep)' : 'var(--gray-300)', fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: selectedRound === r.key ? 600 : 400, textAlign: 'center' }}>
              {r.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 48 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
        ) : teams.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <p style={{ fontSize: '2rem', marginBottom: 8 }}>⏳</p>
            <p className="text-muted">Teams for this round haven't been generated yet.</p>
            {isCommissioner && <p className="text-sm text-muted" style={{ marginTop: 8 }}>Go to Admin → Teams to generate.</p>}
          </div>
        ) : (
          <>
            <p className="text-xs text-muted" style={{ marginBottom: 16, fontFamily: 'var(--font-mono)' }}>
              {teams.length} teams · seeded by {roundDef?.seeded_by === 'combined' ? 'Fri AM + Sat AM combined' : roundDef?.seeded_by.replace('_', ' ')}
            </p>
            {teams.map((team, idx) => (
              <div key={team.team_number} className="team-card" style={{ borderLeftColor: TEAM_COLORS[idx] || 'var(--gold)' }}>
                <div className="team-header">
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700 }}>Team {team.team_number}</span>
                  <span className="text-xs text-muted text-mono">Pos: {(team.finishing_positions || []).join(', ')}</span>
                </div>
                {(team.players || []).map((p, pi) => {
                  const pos = team.finishing_positions?.[pi]
                  const score = p.total_score || p.combined_score
                  return (
                    <div key={p.player_id || pi} className="team-player">
                      <span className="team-position">#{pos}</span>
                      <span style={{ flex: 1, fontWeight: 500 }}>{p.player_name}</span>
                      {score > 0 && <span className="text-mono text-sm" style={{ color: 'var(--gray-300)' }}>{score}</span>}
                    </div>
                  )
                })}

                {/* Score entry for the team */}
                {(isCommissioner || true) && (
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--green-mid)', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span className="text-xs text-muted" style={{ flexShrink: 0 }}>Team score (+/– par):</span>
                    <input type="number" min="-20" max="20"
                      className="input input-mono"
                      placeholder="e.g. –5"
                      style={{ width: 80, padding: '6px 8px', fontSize: '0.9rem', textAlign: 'center' }}
                      value={scrambleScore[team.team_number] ?? ''}
                      onChange={e => setScrambleScore(s => ({ ...s, [team.team_number]: e.target.value }))} />
                    <button className="btn btn-sm btn-primary"
                      onClick={() => handleSaveScrambleScore(team)}
                      disabled={savingScore === team.team_number || !scrambleScore[team.team_number]}>
                      {savingScore === team.team_number ? '...' : 'Save'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </div>
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  )
}
