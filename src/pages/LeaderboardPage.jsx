import { useState, useEffect, useCallback } from 'react'
import { db } from '../lib/db'
import { sortPlayersByScore, sortCombinedForSunday, scoreVsPar, ROUNDS, getActiveRound, getCourseForRound } from '../lib/golf'

const REFRESH = 120000

export default function LeaderboardPage() {
  const [event, setEvent] = useState(null)
  const [selectedRound, setSelectedRound] = useState(null)
  const [standings, setStandings] = useState([])
  const [holes, setHoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const fetchData = useCallback(async (round = selectedRound) => {
    const { data: ev } = await db('get_current_event')
    if (!ev) { setLoading(false); return }
    setEvent(ev)

    // Default to the active round
    const activeRoundInfo = getActiveRound(ev.status)
    const targetRound = round || activeRoundInfo?.round
    if (!targetRound || targetRound === null) { setLoading(false); return }

    // Parse day and time
    const [day, time] = targetRound.split('_')  // e.g. 'friday_morning'
    const round_time = targetRound.includes('afternoon') ? 'afternoon' : 'morning'

    // Sunday combined view
    if (targetRound === 'sunday_combined') {
      const { data: combined } = await db('get_combined_totals', { event_id: ev.id })
      const friHoles = await getHoles(ev.friday_course_id)
      const satHoles = await getHoles(ev.saturday_course_id)
      const sorted = sortCombinedForSunday(combined || [], friHoles, satHoles)
      setStandings(sorted.map(p => ({ ...p, total_score: p.combined_score })))
      setHoles([])
    } else {
      const course = getCourseForRound(ev, day)
      if (course?.id) {
        const { data: h } = await db('get_course_holes', { course_id: course.id })
        setHoles(h || [])
      }
      const { data: scores } = await db('get_round_scores', { event_id: ev.id, day, round_time })
      const withScores = (scores || [])
        .filter(sc => sc.total_score > 0 || sc.holes_completed > 0)
        .map(sc => ({
          ...sc,
          hole_scores: typeof sc.hole_scores === 'string' ? JSON.parse(sc.hole_scores) : sc.hole_scores || {},
        }))
      const sorted = sortPlayersByScore(withScores, holes)
      setStandings(sorted)
    }

    setLastUpdated(new Date())
    setLoading(false)
  }, [selectedRound, holes])

  const getHoles = async (courseId) => {
    if (!courseId) return []
    const { data } = await db('get_course_holes', { course_id: courseId })
    return data || []
  }

  useEffect(() => { fetchData() }, [])
  useEffect(() => {
    const interval = setInterval(() => { fetchData(); setRefreshKey(k => k + 1) }, REFRESH)
    return () => clearInterval(interval)
  }, [fetchData])

  const handleRoundSelect = (r) => {
    setSelectedRound(r)
    setLoading(true)
    fetchData(r)
  }

  const activeRoundInfo = event ? getActiveRound(event.status) : null
  const currentRoundKey = selectedRound || activeRoundInfo?.round

  // Build available rounds for tab switching
  const availableRounds = [
    ...ROUNDS.filter(r => !r.is_scramble).map(r => ({ key: `${r.day}_${r.round_time}`, label: r.label })),
    { key: 'sunday_combined', label: 'Sun Seeding (Combined)' },
  ]

  const isScrambleRound = currentRoundKey?.includes('afternoon')
  const activeCourse = event && currentRoundKey && !currentRoundKey.includes('combined')
    ? getCourseForRound(event, currentRoundKey.split('_')[0])
    : null

  const fmtTime = (d) => d?.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) || ''

  return (
    <div className="page">
      <div className="refresh-bar"><div className="refresh-bar-fill" key={refreshKey} /></div>
      <div className="container">
        <div className="page-header">
          <div className="eyebrow">Live Scores</div>
          <div className="flex justify-between items-center">
            <h1>Leaderboard</h1>
            {event?.scores_locked && <span className="badge badge-gold">Final</span>}
          </div>
          {activeCourse?.name && <p className="text-muted text-sm" style={{ marginTop: 4 }}>{activeCourse.name}{activeCourse.par ? ` · Par ${activeCourse.par}` : ''}</p>}
          {lastUpdated && <p className="text-xs text-muted" style={{ marginTop: 4, fontFamily: 'var(--font-mono)' }}>Updated {fmtTime(lastUpdated)} · auto-refreshes every 2 min</p>}
        </div>

        {/* Round tabs */}
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto', marginBottom: 16, paddingBottom: 4 }}>
          {availableRounds.map(r => (
            <button key={r.key} onClick={() => handleRoundSelect(r.key)}
              style={{
                padding: '7px 12px', border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer',
                background: currentRoundKey === r.key ? 'var(--gold)' : 'var(--green-dark)',
                color: currentRoundKey === r.key ? 'var(--green-deep)' : 'var(--gray-300)',
                fontFamily: 'var(--font-body)', fontSize: '0.75rem', fontWeight: currentRoundKey === r.key ? 600 : 400,
                whiteSpace: 'nowrap', flexShrink: 0,
              }}>
              {r.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 48 }}><div className="spinner" style={{ margin: '0 auto 12px' }} /><p className="text-muted text-sm">Loading scores...</p></div>
        ) : standings.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <p style={{ fontSize: '2rem', marginBottom: 8 }}>⛳</p>
            <p className="text-muted">No scores yet for this round.</p>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 60px 60px', gap: 8, padding: '10px 16px', borderBottom: '1px solid var(--green-mid)', background: 'var(--green-deep)' }}>
              {['#','Player','Score','+/–'].map(h => <span key={h} className="text-xs text-muted" style={{ textAlign: h==='Score'||h==='+/–' ? 'right' : 'left' }}>{h}</span>)}
            </div>
            {standings.map((sc, idx) => {
              const pos = sc.finishing_position || sc.seed_position
              const par = activeCourse?.par
              const diff = par ? scoreVsPar(sc.total_score, par) : null
              const holesIn = sc.holes_completed || Object.keys(sc.hole_scores || {}).length
              return (
                <div key={sc.player_id || idx} className="leaderboard-row" style={{ background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                  <span className={`position${pos <= 3 ? ' top3' : ''}`}>
                    {pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : pos}
                  </span>
                  <div>
                    <span style={{ fontWeight: 500 }}>{sc.player_name}</span>
                    {!sc.is_complete && holesIn > 0 && <span className="text-xs text-muted" style={{ marginLeft: 6, fontFamily: 'var(--font-mono)' }}>thru {holesIn}</span>}
                    {sc.is_complete && <span className="text-xs" style={{ marginLeft: 6, color: 'var(--green-bright)', fontFamily: 'var(--font-mono)' }}>F</span>}
                    {sc.rounds_complete !== undefined && <span className="text-xs text-muted" style={{ marginLeft: 6, fontFamily: 'var(--font-mono)' }}>{sc.rounds_complete}/2 rounds</span>}
                  </div>
                  <span className="text-mono" style={{ textAlign: 'right', fontSize: '1.1rem', fontWeight: 700 }}>{sc.total_score || sc.combined_score}</span>
                  <span className="text-mono text-sm" style={{ textAlign: 'right', color: diff?.startsWith('+') ? 'var(--red)' : diff === 'E' ? 'var(--cream)' : 'var(--blue-birdie)' }}>{diff || '–'}</span>
                </div>
              )
            })}
          </div>
        )}

        <div className="card card-sm" style={{ marginTop: 8 }}>
          <p className="text-xs text-muted" style={{ marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-mono)' }}>Score Key</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[['eagle','–2'],['birdie','–1'],['par','E'],['bogey','+1'],['double','+2']].map(([cls, label]) => (
              <div key={cls} className="flex items-center gap-2">
                <div className={`score-cell ${cls}`} style={{ width: 24, height: 24, fontSize: '0.65rem' }}>•</div>
                <span className="text-xs text-muted">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
