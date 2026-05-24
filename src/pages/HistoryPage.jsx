import { useState, useEffect } from 'react'
import { db } from '../lib/db'

const ROUND_TABS = [
  { key: 'friday_morning',    label: 'Fri AM',       day: 'friday',   rt: 'morning',   is_scramble: false },
  { key: 'friday_afternoon',  label: 'Fri PM',       day: 'friday',   rt: 'afternoon', is_scramble: true  },
  { key: 'saturday_morning',  label: 'Sat AM',       day: 'saturday', rt: 'morning',   is_scramble: false },
  { key: 'saturday_afternoon',label: 'Sat PM',       day: 'saturday', rt: 'afternoon', is_scramble: true  },
  { key: 'sunday_morning',    label: 'Sun Scramble', day: 'sunday',   rt: 'morning',   is_scramble: true  },
]

function fmtDate(d) {
  if (!d) return ''
  const s = String(d).split('T')[0]
  return new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function svp(score, par) {
  if (!score || !par) return '–'
  const d = score - par
  return d === 0 ? 'E' : d > 0 ? `+${d}` : `${d}`
}

function fmtName(name) {
  if (!name) return '–'
  const parts = name.trim().split(' ')
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1][0]}.`
}

export default function HistoryPage() {
  const [events, setEvents] = useState([])
  const [selectedYear, setSelectedYear] = useState(null)
  const [activeRound, setActiveRound] = useState('friday_morning')
  const [results, setResults] = useState({})  // { round_key: [...rows] }
  const [loading, setLoading] = useState(true)
  const [roundLoading, setRoundLoading] = useState(false)

  useEffect(() => {
    db('get_completed_events').then(({ data }) => {
      const evs = data || []
      setEvents(evs)
      if (evs.length) setSelectedYear(evs[0].year)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (selectedYear) {
      setResults({})
      setActiveRound('friday_morning')
      fetchRound('friday_morning')
    }
  }, [selectedYear])

  useEffect(() => {
    if (selectedYear && !results[activeRound]) fetchRound(activeRound)
  }, [activeRound])

  const fetchRound = async (roundKey) => {
    const ev = events.find(e => e.year === selectedYear)
    if (!ev) return
    setRoundLoading(true)
    const tab = ROUND_TABS.find(t => t.key === roundKey)
    const { data } = await db('get_round_scores', { event_id: ev.id, day: tab.day, round_time: tab.rt })
    setResults(r => ({ ...r, [roundKey]: data || [] }))
    setRoundLoading(false)
  }

  const selectedEvent = events.find(e => e.year === selectedYear)
  const roundData = results[activeRound] || []
  const tab = ROUND_TABS.find(t => t.key === activeRound)

  const sorted = [...roundData].sort((a, b) => {
    const aScore = parseInt(a.total_score) || 0
    const bScore = parseInt(b.total_score) || 0
    return aScore - bScore
  })

  return (
    <div className="page">
      <div className="container">
        <div style={{ paddingTop: 20, paddingBottom: 12, borderBottom: '1px solid var(--green-mid)', marginBottom: 16 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--gold)', marginBottom: 2 }}>All Time</div>
          <h1 style={{ fontSize: '1.6rem' }}>History</h1>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 48 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
        ) : events.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <p style={{ fontSize: '2rem', marginBottom: 8 }}>📚</p>
            <p className="text-muted">No completed events yet.</p>
          </div>
        ) : (
          <>
            {/* Year selector */}
            <div className="form-group" style={{ marginBottom: 16 }}>
              <select className="input" value={selectedYear || ''} onChange={e => setSelectedYear(parseInt(e.target.value))}>
                {events.map(ev => (
                  <option key={ev.year} value={ev.year}>{ev.year}</option>
                ))}
              </select>
            </div>

            {/* Event meta */}
            {selectedEvent && (
              <div style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[
                  selectedEvent.friday_course_name,
                  selectedEvent.saturday_course_name,
                  selectedEvent.sunday_course_name,
                ].filter(Boolean).map((c, i) => (
                  <span key={i} style={{ fontSize: '0.75rem', color: 'var(--gray-500)', fontFamily: 'var(--font-mono)' }}>{c}</span>
                ))}
              </div>
            )}

            {/* Round tabs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 3, marginBottom: 16 }}>
              {ROUND_TABS.slice(0, 3).map(t => (
                <button key={t.key} onClick={() => setActiveRound(t.key)} style={{
                  padding: '7px 4px', border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer',
                  background: activeRound === t.key ? 'var(--gold)' : 'var(--green-dark)',
                  color: activeRound === t.key ? 'var(--green-deep)' : 'var(--gray-300)',
                  fontFamily: 'var(--font-body)', fontSize: '0.7rem',
                  fontWeight: activeRound === t.key ? 600 : 400, textAlign: 'center',
                }}>{t.label}</button>
              ))}
              {ROUND_TABS.slice(3).map(t => (
                <button key={t.key} onClick={() => setActiveRound(t.key)} style={{
                  padding: '7px 4px', border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer',
                  background: activeRound === t.key ? 'var(--gold)' : 'var(--green-dark)',
                  color: activeRound === t.key ? 'var(--green-deep)' : 'var(--gray-300)',
                  fontFamily: 'var(--font-body)', fontSize: '0.7rem',
                  fontWeight: activeRound === t.key ? 600 : 400, textAlign: 'center',
                }}>{t.label}</button>
              ))}
              <div /> {/* blank cell */}
            </div>

            {/* Results */}
            {roundLoading ? (
              <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
            ) : sorted.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: 32 }}>
                <p className="text-muted text-sm">No scores recorded for this round.</p>
              </div>
            ) : (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {/* Header */}
                <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 50px 46px', padding: '8px 14px', borderBottom: '1px solid var(--green-mid)', background: 'var(--green-deep)' }}>
                  {['#', 'Player', tab.is_scramble ? '+/–' : 'Score', tab.is_scramble ? '' : '+/–'].map((h, i) => (
                    <span key={i} style={{ fontSize: '0.62rem', color: 'var(--gray-500)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', textAlign: i >= 2 ? 'right' : 'left' }}>{h}</span>
                  ))}
                </div>
                {sorted.map((sc, idx) => {
                  const score = parseInt(sc.total_score) || 0
                  const par = selectedEvent?.friday_par || selectedEvent?.saturday_par || 72
                  const diff = score ? score - par : null
                  const diffTxt = diff === null ? '–' : diff === 0 ? 'E' : diff > 0 ? `+${diff}` : `${diff}`
                  const diffColor = diff < 0 ? 'var(--blue-birdie)' : diff > 0 ? 'var(--red)' : 'var(--gray-300)'
                  const pos = idx + 1
                  return (
                    <div key={sc.player_id || idx} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 50px 46px', alignItems: 'center', padding: '10px 14px', borderBottom: idx < sorted.length - 1 ? '1px solid var(--green-mid)' : 'none', background: idx % 2 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: pos <= 3 ? 'var(--gold)' : 'var(--gray-500)' }}>{pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : pos}</span>
                      <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>{fmtName(sc.player_name)}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1rem', textAlign: 'right' }}>{score || '–'}</span>
                      {!tab.is_scramble && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', textAlign: 'right', color: diffColor }}>{diffTxt}</span>}
                    </div>
                  )
                })}
                {/* Champion callout for stroke play */}
                {!tab.is_scramble && sorted[0] && (
                  <div style={{ padding: '12px 14px', background: 'rgba(201,168,76,0.08)', borderTop: '1px solid rgba(201,168,76,0.2)' }}>
                    <span style={{ fontSize: '0.62rem', color: 'var(--gold)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Low round · </span>
                    <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{fmtName(sorted[0].player_name)}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', marginLeft: 8, color: 'var(--gold)' }}>{sorted[0].total_score}</span>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
