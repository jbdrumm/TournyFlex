import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../lib/db'
import { useAuth } from '../contexts/AuthContext'

export default function HomePage() {
  const [event, setEvent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [dbError, setDbError] = useState(null)
  const { player, isCommissioner, signOutPlayer } = useAuth()
  const navigate = useNavigate()

  useEffect(() => { fetchCurrentEvent() }, [])

  const fetchCurrentEvent = async () => {
    setDbError(null)
    try {
      const { data } = await db('get_active_event')
      setEvent(data)
    } catch (err) {
      setDbError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (d) => {
    if (!d) return ''
    return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    })
  }

  const formatTime = (t) => {
    if (!t) return ''
    const [h, m] = t.split(':')
    const hour = parseInt(h)
    return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`
  }

  const statusLabel = {
    upcoming:          { text: 'Upcoming', cls: 'badge-gray' },
    morning_active:    { text: 'Morning Round Live', cls: 'badge-gold' },
    morning_complete:  { text: 'Morning Complete', cls: 'badge-green' },
    afternoon_active:  { text: 'Scramble Live', cls: 'badge-gold' },
    complete:          { text: 'Complete', cls: 'badge-gray' },
  }

  return (
    <div className="page">
      <div className="container">

        {/* Header */}
        <div style={{ paddingTop: 32, paddingBottom: 24, textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--gold)', marginBottom: 8 }}>
            ⛳ Annual
          </p>
          <h1 style={{ lineHeight: 1.1 }}>Men's Golf<br />Outing</h1>

          {/* Player greeting / sign in */}
          {player ? (
            <div style={{ marginTop: 16 }}>
              <p style={{ color: 'var(--green-bright)', fontSize: '0.9rem', marginBottom: 8 }}>
                Welcome back, <strong>{player.name}</strong>
              </p>
              <button className="btn btn-ghost btn-sm" onClick={signOutPlayer}>Sign Out</button>
            </div>
          ) : !isCommissioner && (
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/player-login')}>
              Sign In with PIN
            </button>
          )}

          {isCommissioner && (
            <p style={{ marginTop: 12, color: 'var(--gold)', fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}>
              🔑 Commissioner Mode
            </p>
          )}
        </div>

        {/* DB Error state */}
        {dbError && (
          <div className="card" style={{ borderColor: 'var(--red)', textAlign: 'center', padding: 24 }}>
            <p style={{ fontSize: '1.5rem', marginBottom: 8 }}>⚠️</p>
            <p style={{ fontWeight: 600, marginBottom: 6 }}>Database not connected</p>
            <p className="text-xs text-muted" style={{ marginBottom: 16, fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
              {dbError}
            </p>
            <p className="text-sm text-muted" style={{ marginBottom: 16 }}>
              Make sure <code style={{ color: 'var(--gold)' }}>DATABASE_URL</code> is set in your Netlify environment variables and the schema has been run in Neon.
            </p>
            <button className="btn btn-secondary btn-sm" onClick={fetchCurrentEvent}>Retry</button>
          </div>
        )}

        {/* Loading */}
        {loading && !dbError && (
          <div className="card" style={{ textAlign: 'center', padding: 32 }}>
            <div className="spinner" style={{ margin: '0 auto 12px' }} />
            <p className="text-muted text-sm">Connecting to database...</p>
          </div>
        )}

        {/* No error, not loading */}
        {!loading && !dbError && (
          <>
            {event ? (
              <div className="card">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-xs text-muted text-mono">{event.year} EVENT</span>
                  <span className={`badge ${statusLabel[event.status]?.cls || 'badge-gray'}`}>
                    {statusLabel[event.status]?.text || event.status}
                  </span>
                </div>

                <h2 style={{ marginBottom: 4 }}>{event.course_name || 'Course TBD'}</h2>
                {event.city && (
                  <p className="text-muted text-sm" style={{ marginBottom: 16 }}>{event.city}, {event.state}</p>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div className="card card-sm" style={{ background: 'var(--green-deep)', margin: 0 }}>
                    <div className="text-xs text-muted" style={{ marginBottom: 2 }}>Date</div>
                    <div className="text-sm" style={{ fontWeight: 500 }}>{formatDate(event.event_date)}</div>
                  </div>
                  <div className="card card-sm" style={{ background: 'var(--green-deep)', margin: 0 }}>
                    <div className="text-xs text-muted" style={{ marginBottom: 2 }}>Par</div>
                    <div className="text-sm text-mono" style={{ fontWeight: 500 }}>{event.par || '–'}</div>
                  </div>
                  {event.morning_tee_time && (
                    <div className="card card-sm" style={{ background: 'var(--green-deep)', margin: 0 }}>
                      <div className="text-xs text-muted" style={{ marginBottom: 2 }}>Morning Tee</div>
                      <div className="text-sm text-mono" style={{ fontWeight: 500 }}>{formatTime(event.morning_tee_time)}</div>
                    </div>
                  )}
                  {event.afternoon_tee_time && (
                    <div className="card card-sm" style={{ background: 'var(--green-deep)', margin: 0 }}>
                      <div className="text-xs text-muted" style={{ marginBottom: 2 }}>Afternoon Tee</div>
                      <div className="text-sm text-mono" style={{ fontWeight: 500 }}>{formatTime(event.afternoon_tee_time)}</div>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {event.status === 'morning_active' && (
                    <button className="btn btn-primary btn-full" onClick={() => navigate('/scorecard')}>
                      Enter My Score
                    </button>
                  )}
                  <button className="btn btn-secondary btn-full" onClick={() => navigate('/leaderboard')}>
                    View Leaderboard
                  </button>
                  {['morning_complete','afternoon_active','complete'].includes(event.status) && (
                    <button className="btn btn-ghost btn-full" onClick={() => navigate('/teams')}>
                      View Scramble Teams
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="card" style={{ textAlign: 'center', padding: 32 }}>
                <p style={{ color: 'var(--gold)', fontSize: '2rem', marginBottom: 8 }}>⛳</p>
                <p style={{ fontWeight: 600, marginBottom: 4 }}>No active event</p>
                <p className="text-muted text-sm" style={{ marginBottom: 16 }}>
                  {isCommissioner
                    ? 'Set up this year\'s event in the Admin panel.'
                    : 'Check back closer to outing day!'}
                </p>
                {isCommissioner && (
                  <button className="btn btn-primary" onClick={() => navigate('/commissioner')}>
                    Set Up Event
                  </button>
                )}
              </div>
            )}

            {/* Score entry info during active round */}
            {event?.status === 'morning_active' && (
              <div className="card card-sm" style={{ marginTop: 8 }}>
                <p className="text-xs text-muted" style={{ marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-mono)' }}>
                  Score Entry Options
                </p>
                {[
                  ['📱', 'Self-enter hole by hole during round'],
                  ['📸', 'Photo upload at the turn or after round'],
                  ['🏌️', 'Commissioner can enter on your behalf'],
                ].map(([icon, text]) => (
                  <div key={text} className="flex gap-2 items-center" style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: '1rem' }}>{icon}</span>
                    <span className="text-sm">{text}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Commissioner quick link — shown to all when not logged in as commissioner */}
        {!isCommissioner && !loading && !dbError && (
          <div style={{ textAlign: 'center', marginTop: 24, paddingBottom: 8 }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => navigate('/login')}
              style={{ color: 'var(--gray-500)', fontSize: '0.75rem' }}
            >
              🔑 Commissioner Login
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
