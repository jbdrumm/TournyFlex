import { useState, useEffect } from 'react'
import { db } from '../lib/db'
import { useAuth } from '../contexts/AuthContext'
import { getActiveRound, getCourseForRound, formatTime, ROUNDS } from '../lib/golf'

const TEAM_COLORS = ['#c9a84c','#6ab86a','#4a9eca','#e87040','#a855f7','#ec4899','#f43f5e','#14b8a6']
const SCRAMBLE_ROUNDS = [
  { key: 'friday_afternoon',   label: 'Fri PM Scramble', day: 'friday',   round_time: 'afternoon' },
  { key: 'saturday_afternoon', label: 'Sat PM Scramble', day: 'saturday', round_time: 'afternoon' },
  { key: 'sunday_morning',     label: 'Sunday Scramble', day: 'sunday',   round_time: 'morning'   },
]

// Grid layout — 3 cols x 2 rows, bottom-right cell intentionally blank
// Row 1: Fri Singles | Sat Singles | Sun Scramble
// Row 2: Fri Scramble | Sat Scramble | (blank)
const TABS = [
  { key: 'friday_am',          label: 'Fri Singles',  type: 'groups',   day: 'friday',   round_time: 'morning'   },
  { key: 'saturday_am',        label: 'Sat Singles',  type: 'groups',   day: 'saturday', round_time: 'morning'   },
  { key: 'sunday_morning',     label: 'Sun Scramble', type: 'scramble', day: 'sunday',   round_time: 'morning'   },
  { key: 'friday_afternoon',   label: 'Fri Scramble', type: 'scramble', day: 'friday',   round_time: 'afternoon' },
  { key: 'saturday_afternoon', label: 'Sat Scramble', type: 'scramble', day: 'saturday', round_time: 'afternoon' },
]

// Maps event status to the default tab when the page is opened
const STATUS_TO_TAB = {
  upcoming:                  'friday_am',
  friday_morning_active:     'friday_am',
  friday_afternoon_active:   'friday_afternoon',
  saturday_morning_active:   'saturday_am',
  saturday_afternoon_active: 'saturday_afternoon',
  sunday_morning_active:     'sunday_morning',
  complete:                  'sunday_morning',
}

function calcTeeTime(baseTee, groupNumber) {
  // Group 1 = base time, each subsequent group +8 minutes
  if (!baseTee) return null
  const [h, m] = baseTee.split(':').map(Number)
  const totalMinutes = h * 60 + m + (groupNumber - 1) * 8
  const newH = Math.floor(totalMinutes / 60) % 24
  const newM = totalMinutes % 60
  return `${String(newH).padStart(2,'0')}:${String(newM).padStart(2,'0')}`
}

export default function GroupsPage() {
  const { player, isCommissioner } = useAuth()
  const [event, setEvent] = useState(null)
  const [activeTab, setActiveTab] = useState('friday_am')
  const [groups, setGroups] = useState([])
  const [scrambleTeams, setScrambleTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [scrambleScore, setScrambleScore] = useState({})
  const [savingScore, setSavingScore] = useState(null)
  const [toast, setToast] = useState(null)

  useEffect(() => { fetchEvent() }, [])
  useEffect(() => { if (event) fetchTabData() }, [activeTab, event])

  const fetchEvent = async () => {
    const { data: ev } = await db('get_current_event')
    setEvent(ev)
    if (ev?.status) {
      const defaultTab = STATUS_TO_TAB[ev.status] || 'friday_am'
      setActiveTab(defaultTab)
    }
    setLoading(false)
  }

  const fetchTabData = async () => {
    if (!event) return
    const tab = TABS.find(t => t.key === activeTab)
    if (!tab) return
    setLoading(true)

    if (tab.type === 'groups') {
      const { data } = await db('get_groups', { event_id: event.id, day: tab.day })
      setGroups(data || [])
      setScrambleTeams([])
    } else {
      const { data } = await db('get_scramble_teams', { event_id: event.id, round: activeTab })
      // Enrich with player names from round scores
      if (data?.length) {
        const { data: scores } = await db('get_round_scores', {
          event_id: event.id,
          day: tab.day,
          round_time: tab.round_time === 'morning' ? 'morning' : 'afternoon'
        })
        const playerMap = {}
        scores?.forEach(s => { playerMap[s.player_id] = s })
        const built = data.map(t => ({
          ...t,
          player_ids: typeof t.player_ids === 'string' ? JSON.parse(t.player_ids) : t.player_ids,
          finishing_positions: typeof t.finishing_positions === 'string' ? JSON.parse(t.finishing_positions) : t.finishing_positions,
          players: (typeof t.player_ids === 'string' ? JSON.parse(t.player_ids) : t.player_ids)
            .map(pid => playerMap[pid] || { player_id: pid, player_name: '–' }).filter(Boolean),
        }))
        setScrambleTeams(built)
      } else {
        setScrambleTeams([])
      }
      setGroups([])
    }
    setLoading(false)
  }

  const handleSaveScrambleScore = async (team) => {
    const score = parseInt(scrambleScore[team.team_number])
    if (isNaN(score)) return
    setSavingScore(team.team_number)
    const tab = TABS.find(t => t.key === activeTab)
    const course = getCourseForRound(event, tab.day)
    const playerIds = team.players.map(p => p.player_id)
    await db('save_scramble_score', {
      event_id: event.id, course_id: course?.id,
      day: tab.day, round_time: tab.round_time,
      player_ids: playerIds, score, scramble_team_id: team.id,
    })
    setSavingScore(null)
    setScrambleScore(s => ({ ...s, [team.team_number]: '' }))
    showToast(`Team ${team.team_number} score saved!`, 'success')
  }

  const showToast = (msg, type) => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  const tab = TABS.find(t => t.key === activeTab)
  const isMyGroup = (groupPlayers) => player && groupPlayers?.some(p => p.player_id === player.id)
  const baseTeeTime = tab?.day === 'friday' ? event?.friday_tee_time : event?.saturday_tee_time

  return (
    <div className="page">
      <div className="container">
        <div style={{ paddingTop: 16, paddingBottom: 10, borderBottom: '1px solid var(--green-mid)', marginBottom: 10 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--gold)', marginBottom: 2 }}>Tee Sheet</div>
          <h1 style={{ fontSize: '1.5rem' }}>Groups</h1>
        </div>

        {/* Tab grid: 3 cols x 2 rows */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 3, marginBottom: 10 }}>
          {/* Row 1: Singles + Sunday Scramble */}
          {TABS.slice(0, 3).map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
              padding: '7px 4px', border: 'none', borderRadius: 'var(--radius)',
              background: activeTab === t.key ? 'var(--gold)' : 'var(--green-dark)',
              color: activeTab === t.key ? 'var(--green-deep)' : 'var(--gray-300)',
              fontFamily: 'var(--font-body)', fontSize: '0.7rem',
              fontWeight: activeTab === t.key ? 600 : 400,
              cursor: 'pointer', lineHeight: 1.3, textAlign: 'center',
            }}>
              {t.label}
            </button>
          ))}
          {/* Row 2: Scrambles + blank cell */}
          {TABS.slice(3, 5).map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
              padding: '7px 4px', border: 'none', borderRadius: 'var(--radius)',
              background: activeTab === t.key ? 'var(--gold)' : 'var(--green-dark)',
              color: activeTab === t.key ? 'var(--green-deep)' : 'var(--gray-300)',
              fontFamily: 'var(--font-body)', fontSize: '0.7rem',
              fontWeight: activeTab === t.key ? 600 : 400,
              cursor: 'pointer', lineHeight: 1.3, textAlign: 'center',
            }}>
              {t.label}
            </button>
          ))}
          {/* Intentionally blank — no 3rd round 2 item */}
          <div />
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        ) : tab?.type === 'groups' ? (
          // ── MORNING GROUPS VIEW ──────────────────────────────────
          groups.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 40 }}>
              <p style={{ fontSize: '2rem', marginBottom: 8 }}>⛳</p>
              <p className="text-muted">Groups haven't been set up yet.</p>
              {isCommissioner && <p className="text-sm text-muted" style={{ marginTop: 8 }}>Go to Admin → Players to assign groups.</p>}
            </div>
          ) : (
            <>
              {player && (
                <div style={{ marginBottom: 8, background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 'var(--radius)', padding: '8px 12px' }}>
                  <p className="text-xs" style={{ color: 'var(--gold)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', marginBottom: 2 }}>Your Group</p>
                  {(() => {
                    const myGroup = groups.find(g => g.players?.some(p => p.player_id === player.id))
                    if (!myGroup) return <p className="text-sm text-muted">Not assigned yet</p>
                    const teeTime = calcTeeTime(baseTeeTime, myGroup.group_number)
                    return (
                      <p style={{ fontWeight: 600 }}>
                        Group {myGroup.group_number}
                        {teeTime && <span className="text-mono text-sm" style={{ marginLeft: 8, color: 'var(--gold)' }}>{formatTime(teeTime)}</span>}
                      </p>
                    )
                  })()}
                </div>
              )}

              {groups.map((group, idx) => {
                const isMine = isMyGroup(group.players)
                const teeTime = calcTeeTime(baseTeeTime, group.group_number)
                return (
                  <div key={group.id} style={{
                    marginBottom: 6, background: 'var(--green-dark)',
                    border: isMine ? '2px solid var(--gold)' : '1px solid var(--green-mid)',
                    borderRadius: 'var(--radius)', padding: '10px 12px',
  }>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: TEAM_COLORS[idx % TEAM_COLORS.length], flexShrink: 0 }} />
                        <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.9rem', fontWeight: 600 }}>
                          Group {group.group_number}
                        </span>
                        
                      </div>
                      {teeTime && (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--gold)' }}>{formatTime(teeTime)}</span>
                      )}
                    </div>
                    {(group.players || []).map(p => (
                      <div key={p.player_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: player?.id === p.player_id ? 'var(--gold)' : 'var(--green-mid)' }} />
                        <span style={{ fontSize: '0.875rem', fontWeight: player?.id === p.player_id ? 600 : 400, color: player?.id === p.player_id ? 'var(--gold)' : 'var(--cream)' }}>
                          {p.name}
                        </span>
                      </div>
                    ))}
                  </div>
                )
              })}
            </>
          )
        ) : (
          // ── SCRAMBLE TEAMS VIEW ──────────────────────────────────
          scrambleTeams.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 40 }}>
              <p style={{ fontSize: '2rem', marginBottom: 8 }}>⏳</p>
              <p className="text-muted">Scramble teams haven't been generated yet.</p>
              {isCommissioner && <p className="text-sm text-muted" style={{ marginTop: 8 }}>Go to Admin → Teams to generate.</p>}
            </div>
          ) : (
            <>
              {scrambleTeams.map((team, idx) => {
                const isMine = player && team.players?.some(p => p.player_id === player.id)
                return (
                  <div key={team.team_number} className="team-card" style={{
                    borderLeftColor: TEAM_COLORS[idx % TEAM_COLORS.length],
                    borderWidth: isMine ? '2px' : '1px',
                    borderStyle: 'solid',
                    borderColor: isMine ? 'var(--gold)' : 'var(--green-mid)',
                  }}>
                    <div className="team-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.9rem', fontWeight: 600 }}>Team {team.team_number}</span>
                        
                      </div>
                      <span className="text-xs text-muted text-mono">Pos: {(team.finishing_positions||[]).join(', ')}</span>
                    </div>
                    {(team.players||[]).map((p, pi) => (
                      <div key={p.player_id||pi} className="team-player" style={{ background: player?.id === p.player_id ? 'rgba(201,168,76,0.08)' : 'transparent' }}>
                        <span className="team-position">#{team.finishing_positions?.[pi]}</span>
                        <span style={{ flex: 1, fontWeight: player?.id === p.player_id ? 700 : 400, color: player?.id === p.player_id ? 'var(--gold)' : 'var(--cream)' }}>
                          {p.player_name}
                          
                        </span>
                        {p.total_score > 0 && <span className="text-mono text-sm text-muted">{p.total_score}</span>}
                      </div>
                    ))}

                    {/* Scramble score entry — anyone on the team can submit */}
                    {(isMine || isCommissioner) && (
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
                )
              })}
            </>
          )
        )}
      </div>
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  )
}
