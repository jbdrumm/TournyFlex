import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function HomePage() {
  const [event, setEvent] = useState(null)
  const [loading, setLoading] = useState(true)
  const { player, isCommissioner } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    fetchCurrentEvent()
  }, [])

  const fetchCurrentEvent = async () => {
    const { data } = await supabase
      .from('events')
      .select('*, courses(name, city, state, par)')
      .not('status', 'eq', 'complete')
      .order('event_date', { ascending: true })
      .limit(1)
      .single()

    setEvent(data)
    setLoading(false)
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    })
  }

  const formatTime = (timeStr) => {
    if (!timeStr) return ''
    const [h, m] = timeStr.split(':')
    const hour = parseInt(h)
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const h12 = hour % 12 || 12
    return `${h12}:${m} ${ampm}`
  }

  const statusLabel = {
    upcoming: { text: 'Upcoming', cls: 'badge-gray' },
    morning_active: { text: 'Morning Round Live', cls: 'badge-gold' },
    morning_complete: { text: 'Morning Complete', cls: 'badge-green' },
    afternoon_active: { text: 'Afternoon Scramble Live', cls: 'badge-gold' },
    complete: { text: 'Complete', cls: 'badge-gray' },
  }

  return (
    <div className="page">
      <div className="container">

        {/* Header */}
        <div style={{ paddingTop: 32, paddingBottom: 24, textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--gold)', marginBottom: 8 }}>⛳ Annual</p>
          <h1 style={{ lineHeight: 1.1 }}>Men's Golf<br />Outing</h1>
          {!player && !isCommissioner && (
            <button className="btn btn-primary mt-4" onClick={() => navigate('/player-login')}>
              Sign In with PIN
            </button>
          )}
          {player && (
            <p style={{ marginTop: 12, color: 'var(--green-bright)', fontSize: '0.9rem' }}>
              Welcome back, <strong>{player.name}</strong>
            </p>
          )}
        </div>

        {/* Current Event Card */}
        {loading ? (
          <div className="card" style={{ textAlign: 'center', padding: 32 }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        ) : event ? (
          <div className="card">
            <div className="flex justify-between items-center mb-4">
              <span className="text-xs text-muted text-mono">{event.year} EVENT</span>
              <span className={`badge ${statusLabel[event.status]?.cls || 'badge-gray'}`}>
                {statusLabel[event.status]?.text || event.status}
              </span>
            </div>

            <h2 style={{ marginBottom: 4 }}>{event.courses?.name || 'Course TBD'}</h2>
            {event.courses?.city && (
              <p className="text-muted text-sm" style={{ marginBottom: 16 }}>
                {event.courses.city}, {event.courses.state}
              </p>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div className="card card-sm" style={{ background: 'var(--green-deep)', margin: 0 }}>
                <div className="text-xs text-muted" style={{ marginBottom: 2 }}>Date</div>
                <div className="text-sm" style={{ fontWeight: 500 }}>{formatDate(event.event_date)}</div>
              </div>
              <div className="card card-sm" style={{ background: 'var(--green-deep)', margin: 0 }}>
                <div className="text-xs text-muted" style={{ marginBottom: 2 }}>Par</div>
                <div className="text-sm text-mono" style={{ fontWeight: 500 }}>{event.courses?.par || '–'}</div>
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

            {/* Quick actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(event.status === 'morning_active') && (
                <button className="btn btn-primary btn-full" onClick={() => navigate('/scorecard')}>
                  Enter My Score
                </button>
              )}
              <button className="btn btn-secondary btn-full" onClick={() => navigate('/leaderboard')}>
                View Leaderboard
              </button>
              {(event.status === 'morning_complete' || event.status === 'afternoon_active' || event.status === 'complete') && (
                <button className="btn btn-ghost btn-full" onClick={() => navigate('/teams')}>
                  View Scramble Teams
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="card" style={{ textAlign: 'center', padding: 32 }}>
            <p style={{ color: 'var(--gold)', fontSize: '2rem', marginBottom: 8 }}>⛳</p>
            <p className="text-muted">No active event.</p>
            {isCommissioner && (
              <button className="btn btn-primary mt-4" onClick={() => navigate('/commissioner')}>
                Set Up Event
              </button>
            )}
          </div>
        )}

        {/* Score entry methods info */}
        {event?.status === 'morning_active' && (
          <div className="card card-sm" style={{ marginTop: 8 }}>
            <p className="text-xs text-muted" style={{ marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-mono)' }}>Score Entry Options</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="flex gap-2 items-center">
                <span style={{ fontSize: '1rem' }}>📱</span>
                <span className="text-sm">Self-enter hole by hole during round</span>
              </div>
              <div className="flex gap-2 items-center">
                <span style={{ fontSize: '1rem' }}>📸</span>
                <span className="text-sm">Photo upload at the turn or after round</span>
              </div>
              <div className="flex gap-2 items-center">
                <span style={{ fontSize: '1rem' }}>🏌️</span>
                <span className="text-sm">Commissioner can enter on your behalf</span>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
