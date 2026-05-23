import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function HistoryPage() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [eventDetails, setEventDetails] = useState(null)

  useEffect(() => {
    fetchHistory()
  }, [])

  const fetchHistory = async () => {
    const { data } = await supabase
      .from('events')
      .select('*, courses(name, city, state, par)')
      .eq('status', 'complete')
      .order('event_date', { ascending: false })

    setEvents(data || [])
    setLoading(false)
  }

  const fetchEventDetails = async (ev) => {
    if (selectedEvent?.id === ev.id) {
      setSelectedEvent(null)
      setEventDetails(null)
      return
    }
    setSelectedEvent(ev)

    const { data: scorecards } = await supabase
      .from('scorecards')
      .select('*, players(name)')
      .eq('event_id', ev.id)
      .eq('is_complete', true)
      .order('total_score', { ascending: true })

    setEventDetails(scorecards || [])
  }

  const formatDate = (d) => {
    if (!d) return ''
    return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }

  const scoreVsPar = (score, par) => {
    if (!score || !par) return '–'
    const d = score - par
    return d === 0 ? 'E' : d > 0 ? `+${d}` : `${d}`
  }

  return (
    <div className="page">
      <div className="container">
        <div className="page-header">
          <div className="eyebrow">All Time</div>
          <h1>History</h1>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        ) : events.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <p style={{ fontSize: '2rem', marginBottom: 8 }}>📚</p>
            <p className="text-muted">No completed events yet.</p>
            <p className="text-xs text-muted" style={{ marginTop: 8 }}>Past events will appear here after they're marked complete.</p>
          </div>
        ) : (
          <>
            {events.map(ev => (
              <div key={ev.id}>
                <button
                  onClick={() => fetchEventDetails(ev)}
                  style={{
                    width: '100%', background: 'var(--green-dark)',
                    border: `1px solid ${selectedEvent?.id === ev.id ? 'var(--gold)' : 'var(--green-mid)'}`,
                    borderRadius: 'var(--radius-lg)', padding: '16px 20px',
                    color: 'var(--cream)', cursor: 'pointer', marginBottom: 8,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    transition: 'border-color 0.15s'
                  }}
                >
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700 }}>
                      {ev.year} — {ev.courses?.name || 'Unknown Course'}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)', marginTop: 2 }}>
                      {formatDate(ev.event_date)} · {ev.courses?.city}, {ev.courses?.state}
                    </div>
                  </div>
                  <span style={{ color: 'var(--gold)', fontSize: '0.8rem' }}>
                    {selectedEvent?.id === ev.id ? '▲' : '▼'}
                  </span>
                </button>

                {selectedEvent?.id === ev.id && eventDetails && (
                  <div className="card" style={{ marginBottom: 16, marginTop: -4 }}>
                    <p className="text-xs text-muted text-mono" style={{ marginBottom: 12, textTransform: 'uppercase' }}>
                      Final Standings · Par {ev.courses?.par}
                    </p>

                    {eventDetails.map((sc, idx) => {
                      const pos = idx + 1
                      const diff = scoreVsPar(sc.total_score, ev.courses?.par)
                      return (
                        <div key={sc.id} style={{
                          display: 'grid', gridTemplateColumns: '28px 1fr 50px 50px',
                          alignItems: 'center', gap: 8,
                          padding: '10px 0',
                          borderBottom: idx < eventDetails.length - 1 ? '1px solid var(--green-mid)' : 'none'
                        }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: pos <= 3 ? 'var(--gold)' : 'var(--gray-500)' }}>
                            {pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : pos}
                          </span>
                          <span style={{ fontWeight: 500 }}>{sc.players?.name}</span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, textAlign: 'right' }}>
                            {sc.total_score}
                          </span>
                          <span style={{
                            fontFamily: 'var(--font-mono)', fontSize: '0.85rem', textAlign: 'right',
                            color: diff?.startsWith('+') ? 'var(--red)' : diff === 'E' ? 'var(--cream)' : 'var(--blue-birdie)'
                          }}>
                            {diff}
                          </span>
                        </div>
                      )
                    })}

                    {eventDetails.length === 0 && (
                      <p className="text-muted text-sm text-center">No scores recorded.</p>
                    )}

                    {/* Winner highlight */}
                    {eventDetails[0] && (
                      <div style={{ marginTop: 16, padding: 12, background: 'rgba(201,168,76,0.1)', borderRadius: 'var(--radius)', border: '1px solid rgba(201,168,76,0.3)' }}>
                        <p className="text-xs" style={{ color: 'var(--gold)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Champion</p>
                        <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700 }}>
                          {eventDetails[0].players?.name}
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', marginLeft: 8, color: 'var(--gold)' }}>
                            {eventDetails[0].total_score}
                          </span>
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
