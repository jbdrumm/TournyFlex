import { useState, useEffect } from 'react'
import { db } from '../lib/db'

export default function HistoryPage() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [details, setDetails] = useState({})

  useEffect(() => {
    db('get_completed_events').then(({ data }) => { setEvents(data || []); setLoading(false) })
  }, [])

  const toggle = async (ev) => {
    if (selectedId === ev.id) { setSelectedId(null); return }
    setSelectedId(ev.id)
    if (!details[ev.id]) {
      const { data } = await db('get_event_results', { event_id: ev.id })
      setDetails(d => ({ ...d, [ev.id]: data || [] }))
    }
  }

  const fmtDate = (d) => {
    if (!d) return ''
    // Handle both 'YYYY-MM-DD' and full ISO timestamps
    const dateStr = String(d).split('T')[0]
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }
  const svp = (score, par) => { if (!score || !par) return '–'; const d = score - par; return d === 0 ? 'E' : d > 0 ? `+${d}` : `${d}` }

  return (
    <div className="page">
      <div className="container">
        <div className="page-header">
          <div className="eyebrow">All Time</div>
          <h1>History</h1>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 48 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
        ) : events.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <p style={{ fontSize: '2rem', marginBottom: 8 }}>📚</p>
            <p className="text-muted">No completed events yet.</p>
          </div>
        ) : events.map(ev => (
          <div key={ev.id}>
            <button onClick={() => toggle(ev)} style={{ width: '100%', background: 'var(--green-dark)', border: `1px solid ${selectedId === ev.id ? 'var(--gold)' : 'var(--green-mid)'}`, borderRadius: 'var(--radius-lg)', padding: '16px 20px', color: 'var(--cream)', cursor: 'pointer', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700 }}>{ev.year} Outing</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)', marginTop: 2 }}>{fmtDate(ev.event_date)}</div>
                {(ev.friday_course_name || ev.saturday_course_name) && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginTop: 2 }}>
                    {[ev.friday_course_name, ev.saturday_course_name].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
              <span style={{ color: 'var(--gold)', fontSize: '0.8rem' }}>{selectedId === ev.id ? '▲' : '▼'}</span>
            </button>

            {selectedId === ev.id && details[ev.id] && (
              <div className="card" style={{ marginBottom: 16, marginTop: -4 }}>
                <p className="text-xs text-muted text-mono" style={{ marginBottom: 12, textTransform: 'uppercase' }}>
                  Combined Fri AM + Sat AM Standings
                </p>
                {details[ev.id].map((sc, idx) => {
                  const pos = idx + 1
                  return (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 60px', alignItems: 'center', gap: 8, padding: '10px 0', borderBottom: idx < details[ev.id].length - 1 ? '1px solid var(--green-mid)' : 'none' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: pos <= 3 ? 'var(--gold)' : 'var(--gray-500)' }}>{pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : pos}</span>
                      <span style={{ fontWeight: 500 }}>{sc.player_name}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, textAlign: 'right' }}>{sc.combined_score}</span>
                    </div>
                  )
                })}
                {details[ev.id][0] && (
                  <div style={{ marginTop: 16, padding: 12, background: 'rgba(201,168,76,0.1)', borderRadius: 'var(--radius)', border: '1px solid rgba(201,168,76,0.3)' }}>
                    <p className="text-xs" style={{ color: 'var(--gold)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Weekend Champion</p>
                    <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700 }}>
                      {details[ev.id][0].player_name}
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', marginLeft: 8, color: 'var(--gold)' }}>{details[ev.id][0].combined_score}</span>
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
