import { useState, useEffect } from 'react'
import { db } from '../lib/db'

function fmtName(name) {
  if (!name) return '–'
  const p = name.trim().split(' ')
  return p.length === 1 ? p[0] : `${p[0]} ${p[p.length-1][0]}.`
}

function svp(score, par) {
  if (!score || !par) return null
  const d = parseInt(score) - par
  return { diff: d, txt: d === 0 ? 'E' : d > 0 ? `+${d}` : `${d}`, color: d < 0 ? 'var(--blue-birdie)' : d > 0 ? 'var(--red)' : 'var(--gray-300)' }
}

const TABS = ['Career', 'By Course']

export default function HistoryPage() {
  const [activeTab, setActiveTab] = useState('Career')
  const [careerStats, setCareerStats] = useState([])
  const [courseData, setCourseData] = useState([])
  const [courses, setCourses] = useState([])
  const [selectedCourse, setSelectedCourse] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    try {
      const [careerRes, courseRes] = await Promise.all([
        db('get_player_career_stats'),
        db('get_course_averages'),
      ])
      const career = careerRes.data || []
      const courseRows = courseRes.data || []
      setCareerStats(career)
      setCourseData(courseRows)
      const uniqueCourses = [...new Set(courseRows.map(r => r.course_name))].sort()
      setCourses(uniqueCourses)
      setSelectedCourse(uniqueCourses[0] || null)
    } catch (err) {
      console.error('History fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  const courseRows = selectedCourse ? courseData.filter(r => r.course_name === selectedCourse) : []
  const coursePar = courseRows[0]?.par

  return (
    <div className="page">
      <div className="container">
        <div style={{ paddingTop: 20, paddingBottom: 12, borderBottom: '1px solid var(--green-mid)', marginBottom: 12 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--gold)', marginBottom: 2 }}>All Time</div>
          <h1 style={{ fontSize: '1.6rem' }}>History</h1>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setActiveTab(t)} style={{
              flex: 1, padding: '9px', border: 'none', borderRadius: 'var(--radius)',
              background: activeTab === t ? 'var(--gold)' : 'var(--green-dark)',
              color: activeTab === t ? 'var(--green-deep)' : 'var(--gray-300)',
              fontFamily: 'var(--font-body)', fontSize: '0.85rem',
              fontWeight: activeTab === t ? 600 : 400, cursor: 'pointer',
            }}>{t}</button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 48 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
        ) : activeTab === 'Career' ? (
          <CareerTab stats={careerStats} />
        ) : (
          <CourseTab courseData={courseData} courses={courses} selectedCourse={selectedCourse} setSelectedCourse={setSelectedCourse} courseRows={courseRows} coursePar={coursePar} />
        )}
      </div>
    </div>
  )
}

// ── CAREER TAB ────────────────────────────────────────────────────────────────
function CareerTab({ stats }) {
  if (!stats.length) return (
    <div className="card" style={{ textAlign: 'center', padding: 40 }}>
      <p className="text-muted">No completed rounds yet.</p>
    </div>
  )

  return (
    <div>
      <p className="text-xs text-muted text-mono" style={{ marginBottom: 10, textTransform: 'uppercase' }}>
        Stroke play only · sorted by average
      </p>

      {/* Career leaderboard */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr 44px 44px 44px 44px', padding: '7px 12px', borderBottom: '1px solid var(--green-mid)', background: 'var(--green-deep)' }}>
          {['#', 'Player', 'Avg', 'Rnds', 'Best', 'Wst'].map((h, i) => (
            <span key={h} style={{ fontSize: '0.62rem', color: 'var(--gray-500)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', textAlign: i >= 2 ? 'right' : 'left' }}>{h}</span>
          ))}
        </div>
        {stats.map((p, idx) => (
          <div key={p.player_id} style={{ display: 'grid', gridTemplateColumns: '24px 1fr 44px 44px 44px 44px', alignItems: 'center', padding: '9px 12px', borderBottom: idx < stats.length - 1 ? '1px solid var(--green-mid)' : 'none', background: idx % 2 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: idx < 3 ? 'var(--gold)' : 'var(--gray-500)' }}>{idx + 1}</span>
            <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>{fmtName(p.name)}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 700, textAlign: 'right', color: 'var(--cream)' }}>{p.avg_score ? parseFloat(p.avg_score).toFixed(1) : '–'}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', textAlign: 'right', color: 'var(--gray-400)' }}>{p.stroke_rounds || 0}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', textAlign: 'right', color: 'var(--blue-birdie)' }}>{p.best_round || '–'}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', textAlign: 'right', color: 'var(--red)' }}>{p.worst_round || '–'}</span>
          </div>
        ))}
      </div>

      {/* Scramble stats */}
      <p className="text-xs text-muted text-mono" style={{ marginBottom: 10, textTransform: 'uppercase' }}>Scramble Stats</p>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 52px 52px', padding: '7px 12px', borderBottom: '1px solid var(--green-mid)', background: 'var(--green-deep)' }}>
          {['Player', 'Rounds', 'Avg +/–'].map((h, i) => (
            <span key={h} style={{ fontSize: '0.62rem', color: 'var(--gray-500)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', textAlign: i > 0 ? 'right' : 'left' }}>{h}</span>
          ))}
        </div>
        {stats.filter(p => p.scramble_rounds > 0).sort((a, b) => parseFloat(a.scramble_avg) - parseFloat(b.scramble_avg)).map((p, idx, arr) => (
          <div key={p.player_id} style={{ display: 'grid', gridTemplateColumns: '1fr 52px 52px', alignItems: 'center', padding: '9px 12px', borderBottom: idx < arr.length - 1 ? '1px solid var(--green-mid)' : 'none', background: idx % 2 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
            <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>{fmtName(p.name)}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', textAlign: 'right', color: 'var(--gray-400)' }}>{p.scramble_rounds}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 600, textAlign: 'right', color: parseFloat(p.scramble_avg) < 0 ? 'var(--blue-birdie)' : parseFloat(p.scramble_avg) > 0 ? 'var(--red)' : 'var(--gray-300)' }}>
              {p.scramble_avg != null ? (parseFloat(p.scramble_avg) > 0 ? `+${parseFloat(p.scramble_avg).toFixed(1)}` : parseFloat(p.scramble_avg).toFixed(1)) : '–'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── COURSE TAB ────────────────────────────────────────────────────────────────
function CourseTab({ courses, selectedCourse, setSelectedCourse, courseRows, coursePar }) {
  if (!courses.length) return (
    <div className="card" style={{ textAlign: 'center', padding: 40 }}>
      <p className="text-muted">No course data yet.</p>
    </div>
  )

  const sorted = [...courseRows].sort((a, b) => parseFloat(a.avg_score) - parseFloat(b.avg_score))

  return (
    <div>
      <div className="form-group" style={{ marginBottom: 16 }}>
        <select className="input" value={selectedCourse || ''} onChange={e => setSelectedCourse(e.target.value)}>
          {courses.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {coursePar && (
        <p className="text-xs text-muted text-mono" style={{ marginBottom: 10 }}>Par {coursePar} · sorted by average</p>
      )}

      {sorted.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 32 }}>
          <p className="text-muted text-sm">No scores for this course.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 52px 52px 52px', padding: '7px 12px', borderBottom: '1px solid var(--green-mid)', background: 'var(--green-deep)' }}>
            {['Player', 'Avg', 'Best', 'Rnds'].map((h, i) => (
              <span key={h} style={{ fontSize: '0.62rem', color: 'var(--gray-500)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', textAlign: i > 0 ? 'right' : 'left' }}>{h}</span>
            ))}
          </div>
          {sorted.map((p, idx) => {
            const avg = parseFloat(p.avg_score)
            const best = parseInt(p.best)
            const avgDiff = coursePar ? avg - coursePar : null
            const bestDiff = coursePar ? best - coursePar : null
            const diffColor = (d) => d < 0 ? 'var(--blue-birdie)' : d > 0 ? 'var(--red)' : 'var(--gray-500)'
            const diffTxt = (d) => d === 0 ? 'E' : d > 0 ? `+${d.toFixed ? d.toFixed(1) : d}` : `${d.toFixed ? d.toFixed(1) : d}`
            return (
              <div key={p.player_name + idx} style={{ display: 'grid', gridTemplateColumns: '1fr 64px 56px 36px', alignItems: 'center', padding: '9px 12px', borderBottom: idx < sorted.length - 1 ? '1px solid var(--green-mid)' : 'none', background: idx % 2 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>{fmtName(p.player_name)}</span>
                {/* Avg score + diff stacked */}
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', fontWeight: 700 }}>{avg.toFixed(1)}</div>
                  {avgDiff !== null && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: diffColor(avgDiff) }}>{diffTxt(avgDiff)}</div>}
                </div>
                {/* Best score + diff stacked */}
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', color: 'var(--blue-birdie)' }}>{best}</div>
                  {bestDiff !== null && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: diffColor(bestDiff) }}>{diffTxt(bestDiff)}</div>}
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', textAlign: 'right', color: 'var(--gray-400)' }}>{p.rounds}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
