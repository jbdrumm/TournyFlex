import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../lib/db'
import { useAuth } from '../contexts/AuthContext'
import { calculateTotal, holeScoreClass, getActiveRound, getCourseForRound } from '../lib/golf'

export default function ScorecardPage() {
  const { player, isCommissioner } = useAuth()
  const navigate = useNavigate()
  const fileRef = useRef()

  const [event, setEvent] = useState(null)
  const [holes, setHoles] = useState([])
  const [scores, setScores] = useState({})
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [toast, setToast] = useState(null)
  const [activeTab, setActiveTab] = useState('manual')
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const [players, setPlayers] = useState([])

  useEffect(() => { fetchEventAndSetup() }, [player])

  const fetchEventAndSetup = async () => {
    const { data: ev } = await db('get_current_event')
    if (!ev) return
    setEvent(ev)

    const roundInfo = getActiveRound(ev.status)
    if (!roundInfo?.round || roundInfo.round.includes('afternoon') || roundInfo.round === 'sunday_morning') return

    const day = roundInfo.round.split('_')[0]
    const course = getCourseForRound(ev, day)
    if (course?.id) {
      const { data: h } = await db('get_course_holes', { course_id: course.id })
      setHoles((h || []).sort((a, b) => a.hole_number - b.hole_number))
    }

    if (isCommissioner) {
      const { data: eps } = await db('get_event_players', { event_id: ev.id })
      setPlayers(eps || [])
    } else if (player) {
      await loadScores(ev, player.id)
    }
  }

  const loadScores = async (ev, playerId) => {
    const roundInfo = getActiveRound(ev.status)
    if (!roundInfo?.round) return
    const [day, rt] = [roundInfo.round.split('_')[0], roundInfo.round.includes('afternoon') ? 'afternoon' : 'morning']
    const course = getCourseForRound(ev, day)
    if (!course?.id) return
    const { data: sc } = await db('get_player_round', { event_id: ev.id, player_id: playerId, day, round_time: rt })
    if (sc?.hole_scores) setScores(typeof sc.hole_scores === 'string' ? JSON.parse(sc.hole_scores) : sc.hole_scores)
  }

  const roundInfo = event ? getActiveRound(event.status) : null
  const isStrokePlay = roundInfo?.round && !roundInfo.round.includes('afternoon') && roundInfo.round !== 'sunday_morning'
  const day = roundInfo?.round?.split('_')[0]
  const round_time = roundInfo?.round?.includes('afternoon') ? 'afternoon' : 'morning'
  const course = event && day ? getCourseForRound(event, day) : null
  const activePlayerId = isCommissioner ? selectedPlayer?.player_id : player?.id

  const handleSave = async () => {
    if (!activePlayerId || !event || !course?.id) return
    setSaving(true)
    const holeScores = {}
    Object.entries(scores).forEach(([k, v]) => { if (v) holeScores[k] = parseInt(v) })
    const total = calculateTotal(holeScores)
    const holesCompleted = Object.keys(holeScores).length
    const isComplete = holesCompleted >= 18

    await db('upsert_round_score', {
      event_id: event.id, player_id: activePlayerId, course_id: course.id,
      day, round_time, is_scramble: false,
      hole_scores: holeScores, total_score: total,
      holes_completed: holesCompleted, is_complete: isComplete,
    })
    setSaving(false)
    showToast(isComplete ? 'Score submitted! ✓' : 'Progress saved!', 'success')
  }

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !activePlayerId || !event) return
    setUploading(true)
    showToast('Analyzing scorecard...', '')
    const base64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(file) })
    try {
      const res = await fetch('/.netlify/functions/parse-scorecard', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mediaType: file.type, holeCount: holes.length })
      })
      const data = await res.json()
      if (data.scores) {
        const parsed = {}
        data.scores.forEach((s, i) => { if (s) parsed[String(i + 1)] = s })
        setScores(parsed)
        showToast(`Parsed ${Object.keys(parsed).length} holes — review & save`, 'success')
      } else showToast('Could not parse. Enter manually.', 'error')
    } catch { showToast('Upload failed.', 'error') }
    setUploading(false)
  }

  const showToast = (msg, type = '') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }
  const totalScore = calculateTotal(Object.fromEntries(Object.entries(scores).filter(([, v]) => v)))
  const scoreDiff = totalScore && course?.par ? totalScore - course.par : null

  if (!player && !isCommissioner) return (
    <div className="page"><div className="container" style={{ textAlign: 'center', paddingTop: 60 }}>
      <p style={{ fontSize: '2rem', marginBottom: 16 }}>🔒</p>
      <p className="text-muted" style={{ marginBottom: 20 }}>Sign in with your PIN to enter scores</p>
      <button className="btn btn-primary" onClick={() => navigate('/player-login')}>Sign In</button>
    </div></div>
  )

  if (!event || !isStrokePlay) return (
    <div className="page"><div className="container" style={{ textAlign: 'center', paddingTop: 60 }}>
      <p style={{ fontSize: '2rem', marginBottom: 16 }}>⛳</p>
      <p className="text-muted">
        {!event ? 'No active event.' : 'No stroke play round active right now.'}
      </p>
      {roundInfo?.round?.includes('afternoon') && <p className="text-sm text-muted" style={{ marginTop: 8 }}>Scramble scores are entered by your team via the Teams page.</p>}
    </div></div>
  )

  return (
    <div className="page">
      <div className="container">
        <div className="page-header">
          <div className="eyebrow">{roundInfo?.label || 'Score Entry'}</div>
          <h1>Scorecard</h1>
          {course?.name && <p className="text-muted text-sm" style={{ marginTop: 4 }}>{course.name}{course.par ? ` · Par ${course.par}` : ''}</p>}
          {isCommissioner && (
            <div className="form-group" style={{ marginTop: 12 }}>
              <label>Select Player</label>
              <select className="input" value={selectedPlayer?.player_id || ''} onChange={e => {
                const p = players.find(p => p.player_id === e.target.value)
                setSelectedPlayer(p || null); setScores({})
                if (p) loadScores(event, p.player_id)
              }}>
                <option value="">Choose player...</option>
                {players.map(p => <option key={p.player_id} value={p.player_id}>{p.name}</option>)}
              </select>
            </div>
          )}
          {!isCommissioner && player && <p style={{ color: 'var(--green-bright)', marginTop: 4, fontSize: '0.9rem' }}>{player.name}</p>}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--green-deep)', borderRadius: 'var(--radius)', padding: 4 }}>
          {['manual', 'photo'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{ flex: 1, padding: 10, border: 'none', borderRadius: 6, background: activeTab === tab ? 'var(--green-mid)' : 'transparent', color: activeTab === tab ? 'var(--cream)' : 'var(--gray-500)', fontFamily: 'var(--font-body)', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer' }}>
              {tab === 'manual' ? '📝 Hole by Hole' : '📸 Photo Upload'}
            </button>
          ))}
        </div>

        {activeTab === 'photo' && (
          <div className="card" style={{ textAlign: 'center' }}>
            <p style={{ marginBottom: 16, color: 'var(--gold)', fontSize: '3rem' }}>📸</p>
            <p style={{ marginBottom: 8, fontWeight: 500 }}>Upload Scorecard Photo</p>
            <p className="text-muted text-sm" style={{ marginBottom: 20 }}>Claude AI will parse your scores automatically.</p>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handlePhoto} />
            <button className="btn btn-primary btn-full" onClick={() => fileRef.current?.click()} disabled={uploading || !activePlayerId}>
              {uploading ? 'Analyzing...' : 'Take / Choose Photo'}
            </button>
          </div>
        )}

        {(activeTab === 'manual' || Object.keys(scores).length > 0) && holes.length > 0 && (
          <div className="card">
            {[holes.slice(0, 9), holes.slice(9, 18)].map((nineHoles, nineIdx) => (
              <div key={nineIdx}>
                <p className="text-xs text-muted text-mono" style={{ marginBottom: 8, textTransform: 'uppercase' }}>
                  {nineIdx === 0 ? 'Front Nine' : 'Back Nine'}
                </p>
                <div className="hole-grid">
                  {nineHoles.map(h => (
                    <div key={h.hole_number} className="hole-input-wrap">
                      <span className="hole-num">{h.hole_number}</span>
                      <input type="number" min="1" max="15" className="hole-input"
                        value={scores[String(h.hole_number)] || ''}
                        onChange={e => setScores(s => ({ ...s, [String(h.hole_number)]: e.target.value === '' ? undefined : parseInt(e.target.value) }))} />
                      <span style={{ fontSize: '0.55rem', color: 'var(--gray-500)' }}>p{h.par}</span>
                    </div>
                  ))}
                </div>
                {nineIdx === 0 && <hr className="divider" />}
              </div>
            ))}
            <hr className="divider" />
            <div className="flex justify-between items-center" style={{ marginBottom: 16 }}>
              <div><span className="text-muted text-sm">Total: </span><span className="text-mono" style={{ fontSize: '1.4rem', fontWeight: 700 }}>{totalScore || '–'}</span></div>
              {scoreDiff !== null && <span className="text-mono" style={{ fontSize: '1.1rem', fontWeight: 600, color: scoreDiff > 0 ? 'var(--red)' : scoreDiff < 0 ? 'var(--blue-birdie)' : 'var(--cream)' }}>{scoreDiff > 0 ? `+${scoreDiff}` : scoreDiff === 0 ? 'E' : scoreDiff}</span>}
            </div>
            <button className="btn btn-primary btn-full" onClick={handleSave} disabled={saving || !activePlayerId || !totalScore}>
              {saving ? 'Saving...' : Object.values(scores).filter(Boolean).length >= 18 ? 'Submit Final Score' : 'Save Progress'}
            </button>
          </div>
        )}
      </div>
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  )
}
