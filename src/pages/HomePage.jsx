import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../lib/db'
import { useAuth } from '../contexts/AuthContext'
import { formatDate, formatTime, getActiveRound, getCourseForRound } from '../lib/golf'

const STATUS_BADGE = {
  upcoming:                  { text: 'Upcoming',             cls: 'badge-gray' },
  friday_morning_active:     { text: 'Fri AM Live 🏌️',       cls: 'badge-gold' },
  friday_afternoon_active:   { text: 'Fri Scramble Live',    cls: 'badge-gold' },
  saturday_morning_active:   { text: 'Sat AM Live 🏌️',       cls: 'badge-gold' },
  saturday_afternoon_active: { text: 'Sat Scramble Live',    cls: 'badge-gold' },
  sunday_morning_active:     { text: 'Sun Scramble Live',    cls: 'badge-gold' },
  complete:                  { text: 'Complete',             cls: 'badge-gray' },
}

export default function HomePage() {
  const [event, setEvent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showSponsor, setShowSponsor] = useState(() => {
    try { return localStorage.getItem('showSponsor') !== 'false' } catch { return true }
  })
  const [dbError, setDbError] = useState(null)
  const { player, isCommissioner, signOutPlayer } = useAuth()
  const navigate = useNavigate()

  const [playerGroup, setPlayerGroup] = useState(null)

  useEffect(() => { fetchEvent() }, [])

  const fetchEvent = async () => {
    setDbError(null)
    try {
      const { data } = await db('get_current_event')
      setEvent(data)
      // Load player's group if logged in
      if (player && data) {
        const roundInfo = getActiveRound ? getActiveRound(data.status) : null
        const day = roundInfo?.round?.split('_')[0]
        if (day && (day === 'friday' || day === 'saturday')) {
          db('get_player_group', { event_id: data.id, day, player_id: player.id })
            .then(({ data: g }) => setPlayerGroup(g))
            .catch(() => {})
        }
      }
    } catch (err) {
      setDbError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const activeRound = event ? getActiveRound(event.status) : null
  const isStrokePLayActive = activeRound && !activeRound.round?.includes('afternoon') && activeRound.round !== null && event?.status !== 'upcoming' && event?.status !== 'complete'
  const isScrambleActive = activeRound?.round?.includes('afternoon') || activeRound?.round === 'sunday_morning'
  const activeCourse = activeRound?.round ? getCourseForRound(event, activeRound.round.split('_')[0]) : null

  return (
    <div className="page">
      <div className="container">
        <div style={{ paddingTop: 32, paddingBottom: 24, textAlign: 'center' }}>
          {/* Golf icon — always visible */}
          <div style={{ fontSize: '4rem', marginBottom: 8, lineHeight: 1 }}>⛳</div>
          <h1 style={{ lineHeight: 1.1 }}>{event?.name || 'Golf Outing'}</h1>
          {player ? (
            <div style={{ marginTop: 16 }}>
              <p style={{ color: 'var(--green-bright)', fontSize: '0.9rem', marginBottom: 4 }}>Welcome back, <strong>{player.name}</strong></p>
            </div>
          ) : !isCommissioner && (
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/player-login')}>Sign In with PIN</button>
          )}
          {isCommissioner && <p style={{ marginTop: 12, color: 'var(--gold)', fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}>🔑 Commissioner Mode</p>}
        </div>

        {dbError && (
          <div className="card" style={{ borderColor: 'var(--red)', textAlign: 'center', padding: 24 }}>
            <p style={{ fontSize: '1.5rem', marginBottom: 8 }}>⚠️</p>
            <p style={{ fontWeight: 600, marginBottom: 6 }}>Database not connected</p>
            <p className="text-xs text-muted" style={{ marginBottom: 16, fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>{dbError}</p>
            <p className="text-sm text-muted" style={{ marginBottom: 16 }}>Set <code style={{ color: 'var(--gold)' }}>DATABASE_URL</code> in Netlify environment variables and run schema.sql in Neon.</p>
            <button className="btn btn-secondary btn-sm" onClick={fetchEvent}>Retry</button>
          </div>
        )}

        {loading && !dbError && (
          <div className="card" style={{ textAlign: 'center', padding: 32 }}>
            <div className="spinner" style={{ margin: '0 auto 12px' }} />
            <p className="text-muted text-sm">Connecting...</p>
          </div>
        )}

        {!loading && !dbError && (
          <>
            {event ? (
              <div className="card">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-xs text-muted text-mono">{event.year} EVENT</span>
                  <span className={`badge ${STATUS_BADGE[event.status]?.cls || 'badge-gray'}`}>{STATUS_BADGE[event.status]?.text || event.status}</span>
                </div>

                {/* Active round info */}
                {activeRound && activeRound.round && activeCourse && (
                  <div style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 'var(--radius)', padding: '12px 14px', marginBottom: 16 }}>
                    <p style={{ color: 'var(--gold)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>{activeRound.label}</p>
                    <p style={{ fontWeight: 600, fontSize: '1rem' }}>{activeCourse.name}</p>
                    {activeCourse.par && <p className="text-xs text-muted" style={{ marginTop: 2 }}>Par {activeCourse.par}</p>}
                  </div>
                )}

                {/* Weekend schedule */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
                  {[
                    { label: 'Friday', course: event.friday_course_name, amTime: event.friday_tee_time },
                    { label: 'Saturday', course: event.saturday_course_name, amTime: event.saturday_tee_time },
                    { label: 'Sunday', course: event.sunday_course_name, amTime: event.sunday_tee_time },
                  ].map(({ label, course, amTime }) => (
                    <div key={label} style={{ background: 'var(--green-deep)', borderRadius: 'var(--radius)', padding: '10px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 72 }}>
                      <div>
                        <div className="text-xs text-muted" style={{ marginBottom: 3 }}>{label}</div>
                        <div className="text-xs" style={{ fontWeight: 500, lineHeight: 1.3 }}>{course || <span className="text-muted">TBD</span>}</div>
                      </div>
                      <div className="text-xs text-mono text-muted" style={{ marginTop: 4 }}>{amTime ? formatTime(amTime) : ''}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(activeRound?.round && !isScrambleActive) && (player || isCommissioner) && (
                    <button className="btn btn-primary btn-full" onClick={() => navigate('/scorecard')}>Enter My Score</button>
                  )}
                  {(activeRound?.round) && (
                    <button className="btn btn-secondary btn-full" onClick={() => navigate('/leaderboard')}>View Leaderboard</button>
                  )}
                  {(isScrambleActive || event.status === 'complete') && (
                    <button className="btn btn-ghost btn-full" onClick={() => navigate('/groups')}>View Scramble Teams</button>
                  )}
                </div>
              </div>
            ) : (
              <div className="card" style={{ textAlign: 'center', padding: 32 }}>
                <p style={{ color: 'var(--gold)', fontSize: '2rem', marginBottom: 8 }}>⛳</p>
                <p style={{ fontWeight: 600, marginBottom: 4 }}>No active event</p>
                <p className="text-muted text-sm" style={{ marginBottom: 16 }}>
                  {isCommissioner ? "Set up this year's event in the Admin panel." : 'Check back closer to outing day!'}
                </p>
                {isCommissioner && <button className="btn btn-primary" onClick={() => navigate('/commissioner')}>Set Up Event</button>}
              </div>
            )}

            {/* Sponsor block */}
            {showSponsor && (
              <div style={{ textAlign: 'center', padding: '20px 16px 8px', borderTop: '1px solid var(--green-mid)', marginTop: 16 }}>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--gray-500)', marginBottom: 10 }}>Brought to you by</p>
                <img src="/sponsor-logo.webp" alt="Sponsor" style={{ maxWidth: 180, opacity: 0.85 }} />
              </div>
            )}

            {/* Sign out — bottom of page, above commissioner login */}
            {player && (
              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <button className="btn btn-ghost btn-sm" onClick={signOutPlayer}>Sign Out</button>
              </div>
            )}

            {!isCommissioner && (
              <div style={{ textAlign: 'center', marginTop: 8 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => navigate('/login')} style={{ color: 'var(--gray-500)', fontSize: '0.75rem' }}>🔑 Commissioner Login</button>
              </div>
            )}
            <p style={{ textAlign: 'center', fontSize: '0.6rem', color: 'var(--gray-700)', paddingBottom: 24, paddingTop: 8, fontFamily: 'var(--font-mono)' }}>
              Developed by HomeBase Applications
            </p>
          </>
        )}
      </div>
    </div>
  )
}
