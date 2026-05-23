import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { calculateTotal, holeScoreClass } from '../lib/golf'

export default function ScorecardPage() {
  const { player, isCommissioner } = useAuth()
  const navigate = useNavigate()
  const fileRef = useRef()

  const [event, setEvent] = useState(null)
  const [holes, setHoles] = useState([])
  const [scores, setScores] = useState({}) // { "1": 4, "2": 5, ... }
  const [scorecard, setScorecard] = useState(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [toast, setToast] = useState(null)
  const [activeTab, setActiveTab] = useState('manual') // 'manual' | 'photo'
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const [players, setPlayers] = useState([])

  useEffect(() => {
    fetchEventAndScorecard()
  }, [player])

  const fetchEventAndScorecard = async () => {
    const { data: ev } = await supabase
      .from('events')
      .select('*, courses(par, course_holes(*))')
      .eq('status', 'morning_active')
      .single()

    if (!ev) return
    setEvent(ev)

    const holesSorted = (ev.courses?.course_holes || []).sort((a, b) => a.hole_number - b.hole_number)
    setHoles(holesSorted)

    if (isCommissioner) {
      const { data: ps } = await supabase.from('event_players').select('players(id, name)').eq('event_id', ev.id)
      setPlayers(ps?.map(p => p.players) || [])
      return
    }

    if (player) {
      const { data: sc } = await supabase
        .from('scorecards')
        .select('*')
        .eq('event_id', ev.id)
        .eq('player_id', player.id)
        .single()

      if (sc) {
        setScorecard(sc)
        setScores(sc.hole_scores || {})
      }
    }
  }

  const activePlayerId = isCommissioner ? selectedPlayer?.id : player?.id

  const handleScoreChange = (holeNum, value) => {
    const num = value === '' ? '' : Math.max(1, parseInt(value) || 1)
    setScores(prev => ({ ...prev, [String(holeNum)]: num === '' ? undefined : num }))
  }

  const handleSave = async () => {
    if (!activePlayerId || !event) return
    setSaving(true)

    const holeScores = {}
    Object.entries(scores).forEach(([k, v]) => {
      if (v) holeScores[k] = parseInt(v)
    })

    const total = calculateTotal(holeScores)
    const holesCompleted = Object.keys(holeScores).length
    const isComplete = holesCompleted >= 18

    const payload = {
      event_id: event.id,
      player_id: activePlayerId,
      hole_scores: holeScores,
      total_score: total,
      holes_completed: holesCompleted,
      is_complete: isComplete,
      submitted_at: isComplete ? new Date().toISOString() : null,
    }

    const { error } = await supabase
      .from('scorecards')
      .upsert(payload, { onConflict: 'event_id,player_id' })

    setSaving(false)
    if (error) {
      showToast('Failed to save. Try again.', 'error')
    } else {
      showToast(isComplete ? 'Scorecard submitted! ✓' : 'Progress saved!', 'success')
    }
  }

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !activePlayerId || !event) return

    setUploading(true)
    showToast('Analyzing scorecard...', '')

    // Convert to base64
    const base64 = await new Promise((res, rej) => {
      const reader = new FileReader()
      reader.onload = () => res(reader.result.split(',')[1])
      reader.onerror = rej
      reader.readAsDataURL(file)
    })

    try {
      const res = await fetch('/.netlify/functions/parse-scorecard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64,
          mediaType: file.type,
          holeCount: holes.length,
        })
      })

      const data = await res.json()
      if (data.scores) {
        const parsed = {}
        data.scores.forEach((score, idx) => {
          if (score) parsed[String(idx + 1)] = score
        })
        setScores(parsed)
        showToast(`Parsed ${Object.keys(parsed).length} holes. Review & save.`, 'success')
      } else {
        showToast('Could not parse scores. Enter manually.', 'error')
      }
    } catch {
      showToast('Upload failed. Try again.', 'error')
    }

    setUploading(false)
  }

  const showToast = (msg, type = '') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const totalScore = calculateTotal(
    Object.fromEntries(Object.entries(scores).filter(([, v]) => v))
  )
  const coursePar = event?.courses?.par || 72
  const scoreDiff = totalScore ? totalScore - coursePar : null

  if (!player && !isCommissioner) {
    return (
      <div className="page">
        <div className="container" style={{ textAlign: 'center', paddingTop: 60 }}>
          <p style={{ fontSize: '2rem', marginBottom: 16 }}>🔒</p>
          <p className="text-muted" style={{ marginBottom: 20 }}>Sign in with your PIN to enter scores</p>
          <button className="btn btn-primary" onClick={() => navigate('/player-login')}>Sign In</button>
        </div>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="page">
        <div className="container" style={{ textAlign: 'center', paddingTop: 60 }}>
          <p style={{ fontSize: '2rem', marginBottom: 16 }}>⛳</p>
          <p className="text-muted">No active morning round.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="container">
        <div className="page-header">
          <div className="eyebrow">Score Entry</div>
          <h1>Scorecard</h1>
          {isCommissioner && (
            <div className="form-group" style={{ marginTop: 12 }}>
              <label>Select Player</label>
              <select
                className="input"
                value={selectedPlayer?.id || ''}
                onChange={e => {
                  const p = players.find(p => p.id === e.target.value)
                  setSelectedPlayer(p || null)
                  setScores({})
                  if (p) loadPlayerScores(p.id)
                }}
              >
                <option value="">Choose player...</option>
                {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
          {!isCommissioner && player && (
            <p style={{ color: 'var(--green-bright)', marginTop: 4, fontSize: '0.9rem' }}>{player.name}</p>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--green-deep)', borderRadius: 'var(--radius)', padding: 4 }}>
          {['manual', 'photo'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              style={{
                flex: 1, padding: '10px', border: 'none', borderRadius: 6,
                background: activeTab === tab ? 'var(--green-mid)' : 'transparent',
                color: activeTab === tab ? 'var(--cream)' : 'var(--gray-500)',
                fontFamily: 'var(--font-body)', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer'
              }}>
              {tab === 'manual' ? '📝 Hole by Hole' : '📸 Photo Upload'}
            </button>
          ))}
        </div>

        {/* Photo upload tab */}
        {activeTab === 'photo' && (
          <div className="card" style={{ textAlign: 'center' }}>
            <p style={{ marginBottom: 16, color: 'var(--gold)', fontSize: '3rem' }}>📸</p>
            <p style={{ marginBottom: 8, fontWeight: 500 }}>Upload Scorecard Photo</p>
            <p className="text-muted text-sm" style={{ marginBottom: 20 }}>
              Take a photo of your scorecard at the turn or after your round. Claude AI will parse the scores automatically.
            </p>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handlePhotoUpload} />
            <button className="btn btn-primary btn-full" onClick={() => fileRef.current?.click()} disabled={uploading || !activePlayerId}>
              {uploading ? 'Analyzing...' : 'Take / Choose Photo'}
            </button>
            {Object.keys(scores).length > 0 && (
              <p className="text-sm" style={{ marginTop: 12, color: 'var(--green-bright)' }}>
                ✓ {Object.keys(scores).length} holes parsed — review below and save
              </p>
            )}
          </div>
        )}

        {/* Hole-by-hole entry */}
        {(activeTab === 'manual' || Object.keys(scores).length > 0) && holes.length > 0 && (
          <div className="card">
            {/* Front nine */}
            <p className="text-xs text-muted text-mono" style={{ marginBottom: 8, textTransform: 'uppercase' }}>Front Nine</p>
            <div className="hole-grid">
              {holes.slice(0, 9).map(h => (
                <div key={h.hole_number} className="hole-input-wrap">
                  <span className="hole-num">{h.hole_number}</span>
                  <input
                    type="number" min="1" max="15"
                    className={`hole-input ${scores[String(h.hole_number)] ? holeScoreClass(scores[String(h.hole_number)], h.par) : ''}`}
                    value={scores[String(h.hole_number)] || ''}
                    onChange={e => handleScoreChange(h.hole_number, e.target.value)}
                    style={{
                      borderColor: scores[String(h.hole_number)]
                        ? holeScoreClass(scores[String(h.hole_number)], h.par) === 'birdie' ? 'var(--blue-birdie)'
                          : holeScoreClass(scores[String(h.hole_number)], h.par) === 'eagle' ? 'var(--yellow-eagle)'
                          : holeScoreClass(scores[String(h.hole_number)], h.par) === 'bogey' ? 'var(--red)'
                          : holeScoreClass(scores[String(h.hole_number)], h.par) === 'double' ? 'var(--red)'
                          : 'var(--green-mid)'
                        : 'var(--green-mid)'
                    }}
                  />
                  <span className="text-xs text-muted" style={{ fontSize: '0.55rem' }}>p{h.par}</span>
                </div>
              ))}
            </div>

            <hr className="divider" />

            {/* Back nine */}
            <p className="text-xs text-muted text-mono" style={{ marginBottom: 8, textTransform: 'uppercase' }}>Back Nine</p>
            <div className="hole-grid">
              {holes.slice(9, 18).map(h => (
                <div key={h.hole_number} className="hole-input-wrap">
                  <span className="hole-num">{h.hole_number}</span>
                  <input
                    type="number" min="1" max="15"
                    className={`hole-input`}
                    value={scores[String(h.hole_number)] || ''}
                    onChange={e => handleScoreChange(h.hole_number, e.target.value)}
                  />
                  <span className="text-xs text-muted" style={{ fontSize: '0.55rem' }}>p{h.par}</span>
                </div>
              ))}
            </div>

            <hr className="divider" />

            {/* Totals */}
            <div className="flex justify-between items-center" style={{ marginBottom: 16 }}>
              <div>
                <span className="text-muted text-sm">Total: </span>
                <span className="text-mono" style={{ fontSize: '1.4rem', fontWeight: 700 }}>{totalScore || '–'}</span>
              </div>
              {scoreDiff !== null && (
                <span className="text-mono" style={{
                  fontSize: '1.1rem', fontWeight: 600,
                  color: scoreDiff > 0 ? 'var(--red)' : scoreDiff < 0 ? 'var(--blue-birdie)' : 'var(--cream)'
                }}>
                  {scoreDiff > 0 ? `+${scoreDiff}` : scoreDiff === 0 ? 'E' : scoreDiff}
                </span>
              )}
            </div>

            <button className="btn btn-primary btn-full" onClick={handleSave} disabled={saving || !activePlayerId || !totalScore}>
              {saving ? 'Saving...' : Object.keys(scores).length >= 18 ? 'Submit Final Score' : 'Save Progress'}
            </button>
          </div>
        )}
      </div>

      {toast && (
        <div className={`toast ${toast.type}`}>{toast.msg}</div>
      )}
    </div>
  )

  async function loadPlayerScores(playerId) {
    if (!event) return
    const { data: sc } = await supabase
      .from('scorecards')
      .select('*')
      .eq('event_id', event.id)
      .eq('player_id', playerId)
      .single()
    if (sc) setScores(sc.hole_scores || {})
  }
}
