import { useState, useEffect, useCallback } from 'react'
import { db } from '../lib/db'
import { sortPlayersByScore, scoreVsPar, getActiveRound, getCourseForRound } from '../lib/golf'

const REFRESH = 120000

function calcTeeTime(baseTee, groupNumber) {
  if (!baseTee) return null
  const [h, m] = baseTee.split(':').map(Number)
  const total = h * 60 + m + (groupNumber - 1) * 8
  const nh = Math.floor(total / 60) % 24
  const nm = total % 60
  const hour = nh % 12 || 12
  return `${hour}:${String(nm).padStart(2,'0')} ${nh >= 12 ? 'PM' : 'AM'}`
}

function fmtName(playerName) {
  if (!playerName) return '–'
  const parts = playerName.trim().split(' ')
  if (parts.length === 1) return parts[0]
  return `${parts[0]} ${parts[parts.length - 1][0]}.`
}

function fmtVsPar(total, par) {
  if (!total || !par) return { txt: '–', cls: '' }
  const d = total - par
  if (d === 0) return { txt: 'E', cls: 'score-even' }
  if (d < 0)   return { txt: String(d), cls: 'score-under' }
  return { txt: `+${d}`, cls: 'score-over' }
}

export default function LeaderboardPage() {
  const [event, setEvent] = useState(null)
  const [standings, setStandings] = useState([])
  const [holes, setHoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [view, setView] = useState('mini') // 'mini' | 'detail'
  const [currentPlayer] = useState(() => {
    try { return JSON.parse(localStorage.getItem('golf_player')) } catch { return null }
  })

  const fetchData = useCallback(async () => {
    const { data: ev } = await db('get_current_event')
    if (!ev) { setLoading(false); return }
    setEvent(ev)

    const roundInfo = getActiveRound(ev.status)
    // Only show leaderboard for stroke play morning rounds
    if (!roundInfo?.round || roundInfo.round.includes('afternoon') || roundInfo.round === 'sunday_morning') {
      setStandings([])
      setLoading(false)
      return
    }

    const day = roundInfo.round.split('_')[0]
    const course = getCourseForRound(ev, day)

    const [holesRes, scoresRes] = await Promise.all([
      course?.id ? db('get_course_holes', { course_id: course.id }) : Promise.resolve({ data: [] }),
      db('get_round_scores', { event_id: ev.id, day, round_time: 'morning' }),
    ])

    const courseHoles = holesRes.data || []
    setHoles(courseHoles)

    // Show ALL event players on the leaderboard — not just those with scores
    // Players without scores appear at the bottom with dashes
    const scored = (scoresRes.data || []).map(sc => ({
      ...sc,
      hole_scores: typeof sc.hole_scores === 'string' ? JSON.parse(sc.hole_scores) : (sc.hole_scores || {}),
    }))

    setStandings(sortPlayersByScore(scored, courseHoles))
    setLastUpdated(new Date())
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => {
    const iv = setInterval(() => { fetchData(); setRefreshKey(k => k + 1) }, REFRESH)
    return () => clearInterval(iv)
  }, [fetchData])

  const roundInfo = event ? getActiveRound(event.status) : null
  const day = roundInfo?.round?.split('_')[0]
  const course = event && day ? getCourseForRound(event, day) : null
  const par = course?.par
  const fmtTime = d => d?.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) || ''

  const notStarted = [] // players assigned to event but thru 0 — we'll show them below

  return (
    <div className="page" style={{ paddingBottom: 80 }}>
      <div className="refresh-bar"><div className="refresh-bar-fill" key={refreshKey} /></div>

      <div style={{ padding: '20px 16px 10px', borderBottom: '1px solid var(--green-mid)' }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--gold)', marginBottom: 2 }}>
          {roundInfo?.label || 'Morning Round'}
        </p>
        <div className="flex justify-between items-center">
          <h1 style={{ fontSize: '1.6rem' }}>Leaderboard</h1>
          {event?.scores_locked && <span className="badge badge-gold">Final</span>}
        </div>
        {course?.name && (
          <p className="text-muted text-sm" style={{ marginTop: 2 }}>
            {course.name}{par ? ` · Par ${par}` : ''}
          </p>
        )}
        {lastUpdated && (
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--gray-500)', marginTop: 3 }}>
            Updated {fmtTime(lastUpdated)} · auto-refreshes every 2 min
          </p>
        )}
      </div>

      {/* Mini / Detail toggle */}
      <div style={{ display: 'flex', gap: 4, padding: '10px 12px' }}>
        {['mini', 'detail'].map(v => (
          <button key={v} onClick={() => setView(v)} style={{
            flex: 1, padding: '8px', border: '1px solid var(--green-mid)',
            borderRadius: 'var(--radius)', fontSize: '0.85rem', fontWeight: 500,
            cursor: 'pointer', fontFamily: 'var(--font-body)',
            background: view === v ? 'var(--green-mid)' : 'transparent',
            color: view === v ? 'var(--cream)' : 'var(--gray-500)',
          }}>
            {v === 'mini' ? 'Mini' : 'Detail'}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <div className="spinner" style={{ margin: '0 auto 12px' }} />
          <p className="text-muted text-sm">Loading scores...</p>
        </div>
      ) : standings.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <p style={{ fontSize: '2rem', marginBottom: 8 }}>⛳</p>
          <p className="text-muted text-sm">No scores yet for this round.</p>
        </div>
      ) : view === 'mini' ? (
        <MiniView standings={standings} par={par} currentPlayer={currentPlayer} />
      ) : (
        <DetailView standings={standings} holes={holes} par={par} currentPlayer={currentPlayer} />
      )}
    </div>
  )
}

// ── MINI VIEW ────────────────────────────────────────────────────────────────
function MiniView({ standings, par, currentPlayer }) {
  return (
    <div>
      {/* Header row */}
      <div style={{
        display: 'grid', gridTemplateColumns: '32px 1fr 52px 40px',
        padding: '4px 16px', borderBottom: '1px solid var(--green-mid)',
      }}>
        {['#', 'Player', 'Score', 'Thru'].map((h, i) => (
          <span key={h} style={{
            fontSize: '0.65rem', color: 'var(--gray-500)', fontWeight: 500,
            textTransform: 'uppercase', letterSpacing: '0.06em',
            fontFamily: 'var(--font-mono)',
            textAlign: i >= 2 ? 'right' : 'left',
          }}>{h}</span>
        ))}
      </div>

      {standings.map((sc, idx) => {
        const isMe = currentPlayer?.id === sc.player_id
        const { txt, cls } = fmtVsPar(sc.total_score, par)
        const holesIn = sc.holes_completed || Object.keys(sc.hole_scores || {}).length
        const thruTxt = sc.is_complete || holesIn >= 18 ? 'F' : String(holesIn)
        const showPos = !sc.is_tied

        return (
          <div key={sc.player_id || idx} style={{
            display: 'grid', gridTemplateColumns: '32px 1fr 52px 40px',
            alignItems: 'center', padding: '0 16px',
            borderBottom: '1px solid var(--green-mid)',
            minHeight: 40,
            background: isMe ? 'rgba(201,168,76,0.08)' : 'transparent',
            borderLeft: isMe ? '2px solid var(--gold)' : '2px solid transparent',
          }}>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 500,
              color: isMe ? 'var(--gold)' : 'var(--gray-500)',
            }}>
              {showPos ? sc.finishing_position : ''}
            </span>
            <span style={{ fontSize: '0.875rem' }}>
              <span style={{ fontWeight: 500, color: isMe ? 'var(--gold)' : 'var(--cream)' }}>
                {fmtName(sc.player_name)}
              </span>
            </span>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: '0.95rem', fontWeight: 500,
              textAlign: 'right',
              color: cls === 'score-under' ? 'var(--blue-birdie)' : cls === 'score-over' ? 'var(--red)' : 'var(--gray-300)',
            }}>{txt}</span>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: '0.75rem',
              textAlign: 'right',
              color: thruTxt === 'F' ? 'var(--green-bright)' : 'var(--gray-500)',
              fontWeight: thruTxt === 'F' ? 600 : 400,
            }}>{thruTxt}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── DETAIL VIEW ───────────────────────────────────────────────────────────────
function DetailView({ standings, holes, par, currentPlayer }) {
  const sortedHoles = [...holes].sort((a, b) => a.hole_number - b.hole_number)

  function holeClass(score, holePar) {
    if (!score || !holePar) return 'empty'
    const d = score - holePar
    if (d <= -2) return 'eagle'
    if (d === -1) return 'birdie'
    if (d === 0)  return 'par'
    if (d === 1)  return 'bogey'
    return 'double'
  }

  const holeStyle = {
    eagle:  { background: 'var(--yellow-eagle)', color: 'var(--green-deep)', borderRadius: '50%' },
    birdie: { border: '1.5px solid var(--blue-birdie)', color: 'var(--blue-birdie)', borderRadius: '50%' },
    par:    { color: 'var(--gray-300)' },
    bogey:  { border: '1.5px solid var(--red)', borderRadius: 2, color: 'var(--cream)' },
    double: { background: 'var(--red)', borderRadius: 2, color: 'white' },
    empty:  { color: 'var(--gray-700)', opacity: 0.5 },
  }

  return (
    <div>
      <p style={{ padding: '4px 16px', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--gray-500)', textAlign: 'center', borderBottom: '1px solid var(--green-mid)' }}>
        ← swipe to see all holes →
      </p>

      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, whiteSpace: 'nowrap', fontSize: '0.75rem', minWidth: '100%' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--green-mid)' }}>
              <th style={{ position: 'sticky', left: 0, background: 'var(--green-deep)', zIndex: 3, padding: '5px 12px', textAlign: 'left', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--gray-500)', fontWeight: 500, minWidth: 100, borderRight: '1px solid var(--green-mid)' }}>
                Player
              </th>
              {sortedHoles.map(h => (
                <th key={h.hole_number} style={{
                  padding: '5px 4px', textAlign: 'center', fontFamily: 'var(--font-mono)',
                  fontSize: '0.65rem', color: 'var(--gray-500)', fontWeight: 500, width: 28,
                  background: 'var(--green-deep)',
                  borderLeft: h.hole_number === 10 ? '2px solid var(--green-mid)' : 'none',
                }}>
                  {h.hole_number}
                </th>
              ))}
              {['Tot', '+/–', 'Thru'].map((h, i) => (
                <th key={h} style={{
                  padding: '5px 6px', textAlign: 'right', fontFamily: 'var(--font-mono)',
                  fontSize: '0.65rem', color: 'var(--gray-500)', fontWeight: 500,
                  background: 'var(--green-deep)',
                  borderLeft: i === 0 ? '2px solid var(--green-mid)' : 'none',
                  minWidth: h === 'Thru' ? 34 : 42,
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {standings.map((sc, idx) => {
              const isMe = currentPlayer?.id === sc.player_id
              const holeScores = typeof sc.hole_scores === 'string' ? JSON.parse(sc.hole_scores) : (sc.hole_scores || {})
              const { txt, cls } = fmtVsPar(sc.total_score, par)
              const holesIn = sc.holes_completed || Object.keys(holeScores).length
              const thruTxt = sc.is_complete || holesIn >= 18 ? 'F' : String(holesIn)
              const rowBg = isMe ? 'rgba(201,168,76,0.08)' : idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)'
              const stickyBg = isMe ? 'rgba(201,168,76,0.12)' : idx % 2 === 0 ? 'var(--green-deep)' : 'var(--green-dark)'

              return (
                <tr key={sc.player_id || idx}>
                  <td style={{
                    position: 'sticky', left: 0, zIndex: 2,
                    background: stickyBg,
                    padding: '7px 12px', fontFamily: 'var(--font-body)', fontSize: '0.8rem',
                    fontWeight: 500, color: isMe ? 'var(--gold)' : 'var(--cream)',
                    borderBottom: '1px solid var(--green-mid)',
                    borderRight: '1px solid var(--green-mid)', minWidth: 100,
                  }}>
                    {fmtName(sc.player_name)}
                  </td>
                  {sortedHoles.map(h => {
                    const s = holeScores[String(h.hole_number)]
                    const hcls = holeClass(s, h.par)
                    const st = holeStyle[hcls] || {}
                    return (
                      <td key={h.hole_number} style={{
                        padding: '4px 3px', textAlign: 'center',
                        background: rowBg, borderBottom: '1px solid var(--green-mid)',
                        borderLeft: h.hole_number === 10 ? '2px solid var(--green-mid)' : 'none',
                      }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 22, height: 22, fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 500,
                          ...st
                        }}>
                          {s != null ? s : '·'}
                        </span>
                      </td>
                    )
                  })}
                  <td style={{ padding: '7px 6px', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 500, textAlign: 'right', background: rowBg, borderBottom: '1px solid var(--green-mid)', borderLeft: '2px solid var(--green-mid)' }}>
                    {sc.total_score || '–'}
                  </td>
                  <td style={{
                    padding: '7px 6px', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 500, textAlign: 'right',
                    background: rowBg, borderBottom: '1px solid var(--green-mid)',
                    color: cls === 'score-under' ? 'var(--blue-birdie)' : cls === 'score-over' ? 'var(--red)' : 'var(--gray-300)',
                  }}>{txt}</td>
                  <td style={{
                    padding: '7px 6px', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', textAlign: 'right',
                    background: rowBg, borderBottom: '1px solid var(--green-mid)',
                    color: thruTxt === 'F' ? 'var(--green-bright)' : 'var(--gray-500)',
                    fontWeight: thruTxt === 'F' ? 600 : 400,
                  }}>{thruTxt}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Score key */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: '8px 12px', borderTop: '1px solid var(--green-mid)', alignItems: 'center', marginTop: 4 }}>
        <span style={{ fontSize: '0.65rem', color: 'var(--gray-500)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: 2 }}>Key:</span>
        {[
          ['eagle',  { background: 'var(--yellow-eagle)', borderRadius: '50%', color: 'var(--green-deep)' }, '–2'],
          ['birdie', { border: '1.5px solid var(--blue-birdie)', borderRadius: '50%', color: 'var(--blue-birdie)' }, '–1'],
          ['par',    { color: 'var(--gray-300)' }, 'E'],
          ['bogey',  { border: '1.5px solid var(--red)', borderRadius: 2, color: 'var(--cream)' }, '+1'],
          ['double', { background: 'var(--red)', borderRadius: 2, color: 'white' }, '+2'],
        ].map(([label, st, score]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, fontSize: '0.65rem', fontWeight: 500, fontFamily: 'var(--font-mono)', ...st }}>
              {score}
            </span>
            <span style={{ fontSize: '0.7rem', color: 'var(--gray-500)' }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
