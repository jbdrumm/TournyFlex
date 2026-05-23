import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { sortPlayersByScore, scoreVsPar } from '../lib/golf'

const REFRESH_INTERVAL = 120000 // 2 minutes

export default function LeaderboardPage() {
  const [event, setEvent] = useState(null)
  const [standings, setStandings] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const fetchData = useCallback(async () => {
    // Get current event
    const { data: ev } = await supabase
      .from('events')
      .select('*, courses(name, par, course_holes(hole_number, handicap_rank, par))')
      .not('status', 'eq', 'upcoming')
      .order('event_date', { ascending: false })
      .limit(1)
      .single()

    if (!ev) { setLoading(false); return }
    setEvent(ev)

    // Get scorecards with player info
    const { data: scorecards } = await supabase
      .from('scorecards')
      .select('*, players(id, name)')
      .eq('event_id', ev.id)

    if (!scorecards?.length) { setLoading(false); return }

    const courseHoles = ev.courses?.course_holes || []

    // Build standings from complete + in-progress cards
    const withScores = scorecards
      .filter(sc => sc.total_score > 0 || sc.holes_completed > 0)
      .map(sc => ({
        ...sc,
        player: sc.players,
        total_score: sc.total_score || Object.values(sc.hole_scores || {}).reduce((a, b) => a + b, 0)
      }))
      .filter(sc => sc.total_score > 0)

    const sorted = sortPlayersByScore(withScores, courseHoles)
    setStandings(sorted)
    setLastUpdated(new Date())
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Auto-refresh every 2 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      fetchData()
      setRefreshKey(k => k + 1)
    }, REFRESH_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchData])

  const par = event?.courses?.par
  const isLocked = event?.scores_locked

  const formatTime = (d) => {
    if (!d) return ''
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }

  const medalEmoji = (pos) => {
    if (pos === 1) return '🥇'
    if (pos === 2) return '🥈'
    if (pos === 3) return '🥉'
    return null
  }

  return (
    <div className="page">
      {/* Refresh progress bar */}
      <div className="refresh-bar">
        <div className="refresh-bar-fill" key={refreshKey} />
      </div>

      <div className="container">
        <div className="page-header">
          <div className="eyebrow">Morning Round</div>
          <div className="flex justify-between items-center">
            <h1>Leaderboard</h1>
            {isLocked && <span className="badge badge-gold">Final</span>}
          </div>
          {event?.courses?.name && (
            <p className="text-muted text-sm" style={{ marginTop: 4 }}>{event.courses.name}</p>
          )}
          {lastUpdated && (
            <p className="text-xs text-muted" style={{ marginTop: 4, fontFamily: 'var(--font-mono)' }}>
              Updated {formatTime(lastUpdated)} · refreshes every 2 min
            </p>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <div className="spinner" style={{ margin: '0 auto 12px' }} />
            <p className="text-muted text-sm">Loading scores...</p>
          </div>
        ) : standings.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <p style={{ fontSize: '2rem', marginBottom: 8 }}>⛳</p>
            <p className="text-muted">No scores submitted yet.</p>
            <p className="text-xs text-muted" style={{ marginTop: 8 }}>Check back once players tee off!</p>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {/* Header row */}
            <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 60px 60px', gap: 8, padding: '10px 16px', borderBottom: '1px solid var(--green-mid)', background: 'var(--green-deep)' }}>
              <span className="text-xs text-muted">#</span>
              <span className="text-xs text-muted">Player</span>
              <span className="text-xs text-muted" style={{ textAlign: 'right' }}>Score</span>
              <span className="text-xs text-muted" style={{ textAlign: 'right' }}>+/–</span>
            </div>

            {standings.map((sc, idx) => {
              const pos = sc.finishing_position
              const holesIn = sc.holes_completed || Object.keys(sc.hole_scores || {}).length
              const isComplete = sc.is_complete
              const diff = par ? scoreVsPar(sc.total_score, par) : null

              return (
                <div key={sc.id} className="leaderboard-row" style={{ background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                  <span className={`position${pos <= 3 ? ' top3' : ''}`}>
                    {medalEmoji(pos) || pos}
                  </span>
                  <div>
                    <span style={{ fontWeight: 500 }}>{sc.player?.name || 'Unknown'}</span>
                    {!isComplete && holesIn > 0 && (
                      <span className="text-xs text-muted" style={{ marginLeft: 6, fontFamily: 'var(--font-mono)' }}>
                        thru {holesIn}
                      </span>
                    )}
                    {isComplete && (
                      <span className="text-xs" style={{ marginLeft: 6, color: 'var(--green-bright)', fontFamily: 'var(--font-mono)' }}>F</span>
                    )}
                  </div>
                  <span className="text-mono" style={{ textAlign: 'right', fontSize: '1.1rem', fontWeight: 700 }}>
                    {sc.total_score}
                  </span>
                  <span className="text-mono text-sm" style={{ textAlign: 'right', color: diff?.startsWith('+') ? 'var(--red)' : diff === 'E' ? 'var(--cream)' : 'var(--blue-birdie)' }}>
                    {diff || '–'}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* Legend */}
        <div className="card card-sm" style={{ marginTop: 8 }}>
          <p className="text-xs text-muted" style={{ marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-mono)' }}>Score Key</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[['eagle', '–2'], ['birdie', '–1'], ['par', 'E'], ['bogey', '+1'], ['double', '+2']].map(([cls, label]) => (
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
