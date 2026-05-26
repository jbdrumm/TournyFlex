import React, { useState, useEffect, useCallback } from 'react'
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
  const [view, setView] = useState('mini')
  const [dbError, setDbError] = useState(null) // 'mini' | 'detail'
  const [currentPlayer] = useState(() => {
    try { return JSON.parse(localStorage.getItem('golf_player')) } catch { return null }
  })

  const fetchData = useCallback(async () => {
    try {
      const { data: ev } = await db('get_current_event')
      if (!ev) { setLoading(false); return }
      setEvent(ev)

      const roundInfo = getActiveRound(ev.status)
      if (!roundInfo?.round) { setStandings([]); setLoading(false); return }

      const isScramble = roundInfo.round.includes('afternoon') || roundInfo.round === 'sunday_morning'
      const day = roundInfo.round.split('_')[0]
      const round_time = isScramble ? (roundInfo.round === 'sunday_morning' ? 'morning' : 'afternoon') : 'morning'
      const course = getCourseForRound(ev, day, round_time)

      const [holesRes, scoresRes] = await Promise.all([
        course?.id ? db('get_course_holes', { course_id: course.id }) : Promise.resolve({ data: [] }),
        db('get_round_scores', { event_id: ev.id, day, round_time }),
      ])

      const courseHoles = holesRes.data || []
      setHoles(courseHoles)

      if (isScramble) {
        // Scramble: deduplicate by scramble_team_id, show one row per team
        const { data: teams } = await db('get_scramble_teams', { event_id: ev.id, round: roundInfo.round })
        const scoreMap = {}
        ;(scoresRes.data || []).forEach(sc => { scoreMap[sc.player_id] = sc })

        const teamStandings = (teams || []).map(t => {
          const pids = typeof t.player_ids === 'string' ? JSON.parse(t.player_ids) : t.player_ids
          // Get score from first team member who has one
          const scored = pids.map(pid => scoreMap[pid]).find(sc => sc?.hole_scores)
          const hs = scored ? (typeof scored.hole_scores === 'string' ? JSON.parse(scored.hole_scores) : scored.hole_scores) : {}
          const total = hs['total'] != null
            ? parseInt(hs['total'])
            : Object.values(hs).reduce((a, v) => a + (parseInt(v)||0), 0)
          const holesPlayed = hs['total'] != null ? 18 : Object.keys(hs).length
          const { data: evPlayers } = { data: [] } // names resolved below
          return {
            player_id: t.id,
            player_name: `Team ${t.team_number}`,
            team_number: t.team_number,
            player_ids: pids,
            total_score: total || 0,
            holes_completed: holesPlayed,
            is_complete: scored?.is_complete || false,
            hole_scores: hs,
            not_started: !scored || total === 0,
          }
        })

        // Resolve member names
        const { data: evPlayers } = await db('get_players_for_event', { event_id: ev.id })
        const nameMap = {}
        evPlayers?.forEach(p => { nameMap[p.player_id] = p.name })
        const enriched = teamStandings.map(t => ({
          ...t,
          member_names: t.player_ids.map(pid => {
            const n = nameMap[pid] || ''
            const parts = n.trim().split(' ')
            return parts.length > 1 ? `${parts[0]} ${parts[parts.length-1][0]}.` : n
          }),
        }))

        setStandings(sortPlayersByScore(enriched, courseHoles))
      } else {
        // Stroke play — show all event players
        const { data: playersRes } = await db('get_players_for_event', { event_id: ev.id })
        const scoredMap = {}
        ;(scoresRes.data || []).forEach(sc => { scoredMap[sc.player_id] = sc })

        const allPlayers = (playersRes || []).map(ep => {
          const sc = scoredMap[ep.player_id]
          if (sc) return {
            ...sc,
            hole_scores: typeof sc.hole_scores === 'string' ? JSON.parse(sc.hole_scores) : (sc.hole_scores || {}),
          }
          return {
            player_id: ep.player_id,
            player_name: ep.name,
            total_score: 0,
            holes_completed: 0,
            is_complete: false,
            hole_scores: {},
            not_started: true,
          }
        })
        setStandings(sortPlayersByScore(allPlayers, courseHoles))
      }
      setLastUpdated(new Date())
    } catch (err) {
      console.error('Leaderboard fetch error:', err)
      setDbError(err.message)
    } finally {
      setLoading(false)
    }
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
      ) : dbError ? (
        <div style={{ textAlign: 'center', padding: 32 }}>
          <p style={{ fontSize: '1.5rem', marginBottom: 8 }}>⚠️</p>
          <p className="text-muted text-sm" style={{ marginBottom: 8 }}>Error loading leaderboard</p>
          <p className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--red)', wordBreak: 'break-all', padding: '0 16px' }}>{dbError}</p>
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 12 }} onClick={() => { setDbError(null); fetchData() }}>Retry</button>
        </div>
      ) : standings.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <p style={{ fontSize: '2rem', marginBottom: 8 }}>⛳</p>
          <p className="text-muted text-sm" style={{ marginBottom: 8 }}>No scores yet for this round.</p>
          <p className="text-xs text-muted" style={{ fontFamily: 'var(--font-mono)' }}>
            {!course?.id ? '⚠️ No course assigned to this event yet.' : 'Players will appear here once assigned to this event.'}
          </p>
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
        const isFirst = idx === 0
        const prevNotStarted = sc.not_started && (idx === 0 || !standings[idx-1].not_started)

        if (sc.not_started) {
          return (
            <React.Fragment key={sc.player_id || idx}>
              {prevNotStarted && (
                <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 52px 40px', padding: '5px 16px', background: 'var(--green-deep)', borderBottom: '1px solid var(--green-mid)' }}>
                  <span style={{ gridColumn: '1/-1', fontSize: '0.65rem', color: 'var(--gray-500)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Not yet started</span>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 52px 40px', alignItems: 'center', padding: '0 16px', borderBottom: '1px solid var(--green-mid)', minHeight: 38, opacity: 0.5 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--gray-500)' }}>–</span>
                <span style={{ fontSize: '0.875rem', color: 'var(--gray-500)' }}>{fmtName(sc.player_name)}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', textAlign: 'right', color: 'var(--gray-500)' }}>–</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', textAlign: 'right', color: 'var(--gray-500)' }}>–</span>
              </div>
            </React.Fragment>
          )
        }

        const { txt, cls } = fmtVsPar(sc.total_score, par)
        const holesIn = sc.holes_completed || Object.keys(sc.hole_scores || {}).length
        const thruTxt = sc.is_complete || holesIn >= 18 ? 'F' : String(holesIn || '–')
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
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 500, color: isMe ? 'var(--gold)' : 'var(--gray-500)' }}>
              {showPos ? sc.finishing_position : ''}
            </span>
            <div>
              <span style={{ fontSize: '0.875rem', fontWeight: 500, color: isMe ? 'var(--gold)' : 'var(--cream)' }}>
                {fmtName(sc.player_name)}
              </span>
              {sc.member_names?.length > 0 && (
                <div style={{ fontSize: '0.65rem', color: 'var(--gray-500)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>
                  {sc.member_names.join(' · ')}
                </div>
              )}
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem', fontWeight: 500, textAlign: 'right', color: cls === 'score-under' ? 'var(--blue-birdie)' : cls === 'score-over' ? 'var(--red)' : 'var(--gray-300)' }}>
              {txt}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', textAlign: 'right', color: thruTxt === 'F' ? 'var(--green-bright)' : 'var(--gray-500)', fontWeight: thruTxt === 'F' ? 600 : 400 }}>
              {thruTxt}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── DETAIL VIEW ───────────────────────────────────────────────────────────────
function DetailView({ standings, holes, par, currentPlayer }) {
  // Always show 18 holes — fill in missing with par 4 placeholder
  const allHoles = Array.from({ length: 18 }, (_, i) => {
    const found = holes.find(h => h.hole_number === i + 1)
    return found || { hole_number: i + 1, par: 4, handicap_rank: i + 1 }
  })
  const sortedHoles = allHoles

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
              <th style={{ position: 'sticky', left: 0, background: 'var(--green-deep)', zIndex: 3, padding: '5px 8px', textAlign: 'left', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--gray-500)', fontWeight: 500, minWidth: 100, borderRight: '1px solid var(--green-mid)' }}>
                # · Player
              </th>
              {sortedHoles.map(h => (
                <React.Fragment key={h.hole_number}>
                  <th style={{
                    padding: '5px 4px', textAlign: 'center', fontFamily: 'var(--font-mono)',
                    fontSize: '0.65rem', color: 'var(--gray-500)', fontWeight: 500, width: 28,
                    background: 'var(--green-deep)',
                    borderLeft: h.hole_number === 10 ? '2px solid var(--green-mid)' : 'none',
                  }}>
                    {h.hole_number}
                  </th>
                  {h.hole_number === 9 && (
                    <th style={{ padding: '5px 5px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--gray-500)', fontWeight: 500, minWidth: 30, background: 'var(--green-deep)', borderLeft: '2px solid var(--green-mid)' }}>OUT</th>
                  )}
                </React.Fragment>
              ))}
              {['Tot', '+/–'].map((h, i) => (
                <th key={h} style={{
                  padding: '5px 6px', textAlign: 'right', fontFamily: 'var(--font-mono)',
                  fontSize: '0.65rem', color: 'var(--gray-500)', fontWeight: 500,
                  background: 'var(--green-deep)',
                  borderLeft: i === 0 ? '2px solid var(--green-mid)' : 'none',
                  minWidth: 42,
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
                    padding: '6px 8px',
                    borderBottom: '1px solid var(--green-mid)',
                    borderRight: '1px solid var(--green-mid)', minWidth: 100,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 500, color: isMe ? 'var(--gold)' : 'var(--gray-500)', minWidth: 16, textAlign: 'right', flexShrink: 0 }}>
                        {sc.not_started ? '–' : sc.is_tied ? '' : sc.finishing_position}
                      </span>
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', fontWeight: 500, color: isMe ? 'var(--gold)' : 'var(--cream)' }}>
                        {fmtName(sc.player_name)}
                      </span>
                    </div>
                  </td>
                  {(() => {
                    const frontTotal = sortedHoles.slice(0,9).reduce((sum, h) => sum + (holeScores[String(h.hole_number)] || 0), 0)
                    const backTotal  = sortedHoles.slice(9,18).reduce((sum, h) => sum + (holeScores[String(h.hole_number)] || 0), 0)
                    const frontPlayed = sortedHoles.slice(0,9).filter(h => holeScores[String(h.hole_number)] != null).length
                    const backPlayed  = sortedHoles.slice(9,18).filter(h => holeScores[String(h.hole_number)] != null).length
                    return (
                      <>
                        {sortedHoles.map(h => {
                          const s = holeScores[String(h.hole_number)]
                          const hcls = holeClass(s, h.par)
                          const st = holeStyle[hcls] || {}
                          return (
                            <React.Fragment key={h.hole_number}>
                              <td style={{ padding: '4px 3px', textAlign: 'center', background: rowBg, borderBottom: '1px solid var(--green-mid)', borderLeft: h.hole_number === 10 ? '2px solid var(--green-mid)' : 'none' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 500, ...st }}>
                                  {s != null ? s : '·'}
                                </span>
                              </td>
                              {h.hole_number === 9 && (
                                <td style={{ padding: '7px 5px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 600, textAlign: 'center', background: rowBg, borderBottom: '1px solid var(--green-mid)', borderLeft: '2px solid var(--green-mid)', color: 'var(--gray-300)' }}>
                                  {frontPlayed > 0 ? frontTotal : '·'}
                                </td>
                              )}
                            </React.Fragment>
                          )
                        })}
                        <td style={{ padding: '7px 5px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 600, textAlign: 'center', background: rowBg, borderBottom: '1px solid var(--green-mid)', borderLeft: '2px solid var(--green-mid)', color: 'var(--gray-300)' }}>
                          {backPlayed > 0 ? backTotal : '·'}
                        </td>
                      </>
                    )
                  })()}
                  <td style={{ padding: '7px 6px', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 500, textAlign: 'right', background: rowBg, borderBottom: '1px solid var(--green-mid)', borderLeft: '2px solid var(--green-mid)' }}>
                    {sc.total_score || '–'}
                  </td>
                  <td style={{
                    padding: '7px 6px', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 500, textAlign: 'right',
                    background: rowBg, borderBottom: '1px solid var(--green-mid)',
                    color: cls === 'score-under' ? 'var(--blue-birdie)' : cls === 'score-over' ? 'var(--red)' : 'var(--gray-300)',
                  }}>{txt}</td>

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
