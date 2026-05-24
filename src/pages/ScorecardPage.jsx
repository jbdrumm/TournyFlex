import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../lib/db'
import { useAuth } from '../contexts/AuthContext'
import { calculateTotal, getActiveRound, getCourseForRound } from '../lib/golf'

export default function ScorecardPage() {
  const { player, isCommissioner } = useAuth()
  const navigate = useNavigate()
  const fileRef = useRef()

  const [event, setEvent] = useState(null)
  const [holes, setHoles] = useState([])
  const [groupPlayers, setGroupPlayers] = useState([])
  const [scores, setScores] = useState({})        // { playerId: { "1": 4, ... } }
  const [currentHole, setCurrentHole] = useState(1)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [toast, setToast] = useState(null)
  const [activeTab, setActiveTab] = useState('manual')

  useEffect(() => { fetchSetup() }, [player])

  const fetchSetup = async () => {
    try {
      const { data: ev } = await db('get_current_event')
      if (!ev) return
      setEvent(ev)

      const roundInfo = getActiveRound(ev.status)
      if (!roundInfo?.round || roundInfo.round.includes('afternoon') || roundInfo.round === 'sunday_morning') return

      const day = roundInfo.round.split('_')[0]
      const course = getCourseForRound(ev, day)

      if (course?.id) {
        const { data: h } = await db('get_course_holes', { course_id: course.id })
        const loaded = (h || []).sort((a, b) => a.hole_number - b.hole_number)
        // Use loaded holes or fall back to generic 18-hole par-4 layout
        setHoles(loaded.length > 0 ? loaded : Array.from({length:18},(_,i)=>({hole_number:i+1,par:4,handicap_rank:i+1})))
      } else {
        // No course assigned — still allow score entry with generic holes
        setHoles(Array.from({length:18},(_,i)=>({hole_number:i+1,par:4,handicap_rank:i+1})))
      }

      if (player) {
        const { data: group } = await db('get_player_group', { event_id: ev.id, day, player_id: player.id })
        const members = group?.players?.length
          ? group.players
          : [{ player_id: player.id, name: player.name }]
        setGroupPlayers(members)
        if (course?.id) await loadGroupScores(ev, members, day, course.id)
      }
    } catch (err) {
      console.error('Scorecard setup error:', err)
    }
  }

  const loadGroupScores = async (ev, members, day, courseId) => {
    if (!ev?.id || !members?.length) return
    const newScores = {}
    await Promise.all(members.map(async m => {
      const { data: sc } = await db('get_player_round', {
        event_id: ev.id, player_id: m.player_id, day, round_time: 'morning'
      })
      newScores[m.player_id] = sc?.hole_scores
        ? (typeof sc.hole_scores === 'string' ? JSON.parse(sc.hole_scores) : sc.hole_scores)
        : {}
    }))
    setScores(newScores)
  }

  const adjustScore = (playerId, holeNum, delta) => {
    setScores(s => {
      const current = s[playerId]?.[String(holeNum)] ?? 4
      const next = Math.max(1, Math.min(15, current + delta))
      return { ...s, [playerId]: { ...s[playerId], [String(holeNum)]: next } }
    })
  }

  const handleSaveAll = async () => {
    if (!event || groupPlayers.length === 0) return
    setSaving(true)
    const roundInfo = getActiveRound(event.status)
    const day = roundInfo?.round?.split('_')[0]
    const course = getCourseForRound(event, day)
    if (!course?.id) { setSaving(false); return }

    for (const member of groupPlayers) {
      const holeScores = {}
      Object.entries(scores[member.player_id] || {}).forEach(([k, v]) => { if (v) holeScores[k] = parseInt(v) })
      const total = calculateTotal(holeScores)
      const holesCompleted = Object.keys(holeScores).length
      await db('upsert_round_score', {
        event_id: event.id, player_id: member.player_id, course_id: course.id,
        day, round_time: 'morning', is_scramble: false,
        hole_scores: holeScores, total_score: total,
        holes_completed: holesCompleted, is_complete: holesCompleted >= 18,
      })
    }
    setSaving(false)
    showToast(`Saved ${groupPlayers.length} scorecards! ✓`, 'success')
  }

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    showToast('Analyzing scorecard...', '')
    const base64 = await new Promise((res, rej) => {
      const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(file)
    })
    try {
      const res = await fetch('/.netlify/functions/parse-scorecard', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mediaType: file.type, holeCount: holes.length })
      })
      const data = await res.json()
      if (data.scores && groupPlayers.length > 0) {
        // Apply to the logged-in player by default
        const target = groupPlayers.find(p => p.player_id === player?.id) || groupPlayers[0]
        const parsed = {}
        data.scores.forEach((s, i) => { if (s) parsed[String(i + 1)] = s })
        setScores(s => ({ ...s, [target.player_id]: parsed }))
        showToast(`Parsed ${Object.keys(parsed).length} holes — review & save`, 'success')
      } else showToast('Could not parse. Enter manually.', 'error')
    } catch { showToast('Upload failed.', 'error') }
    setUploading(false)
  }

  const showToast = (msg, type = '') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  const roundInfo = event ? getActiveRound(event.status) : null
  const isStrokePlay = roundInfo?.round && !roundInfo.round.includes('afternoon') && roundInfo.round !== 'sunday_morning'
  const day = roundInfo?.round?.split('_')[0]
  const course = event && day ? getCourseForRound(event, day) : null
  const currentHoleData = holes.find(h => h.hole_number === currentHole)
  const holePar = currentHoleData?.par || 4

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
        {!event ? 'No active event.' : roundInfo?.round?.includes('afternoon') ? 'Scramble — enter team score via the Groups tab.' : 'No stroke play round active.'}
      </p>
    </div></div>
  )

  return (
    <div className="page">
      <div className="container">
        {/* Header */}
        <div style={{ paddingTop: 20, paddingBottom: 12, borderBottom: '1px solid var(--green-mid)', marginBottom: 12 }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--gold)', marginBottom: 2 }}>
            {roundInfo?.label}
          </p>
          <h1 style={{ fontSize: '1.6rem' }}>Scorecard</h1>
          {course?.name && <p className="text-muted text-sm" style={{ marginTop: 2 }}>{course.name}{course.par ? ` · Par ${course.par}` : ''}</p>}
        </div>

        {/* Manual / Photo tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 12, background: 'var(--green-deep)', borderRadius: 'var(--radius)', padding: 3 }}>
          {['manual', 'photo'].map(t => (
            <button key={t} onClick={() => setActiveTab(t)} style={{
              flex: 1, padding: '8px', border: 'none', borderRadius: 5,
              background: activeTab === t ? 'var(--green-mid)' : 'transparent',
              color: activeTab === t ? 'var(--cream)' : 'var(--gray-500)',
              fontFamily: 'var(--font-body)', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer',
            }}>
              {t === 'manual' ? '📝 Hole by Hole' : '📸 Photo Upload'}
            </button>
          ))}
        </div>

        {/* Photo upload */}
        {activeTab === 'photo' && (
          <div className="card" style={{ textAlign: 'center', marginBottom: 12 }}>
            <p style={{ marginBottom: 8, fontWeight: 500 }}>Upload your group's scorecard</p>
            <p className="text-muted text-sm" style={{ marginBottom: 16 }}>Claude AI will parse scores for all players.</p>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handlePhoto} />
            <button className="btn btn-primary btn-full" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? 'Analyzing...' : '📸 Take / Choose Photo'}
            </button>
          </div>
        )}

        {/* Hole-by-hole entry */}
        {activeTab === 'manual' && groupPlayers.length > 0 && (
          <div className="card">
            {/* Hole selector */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <button onClick={() => setCurrentHole(h => Math.max(1, h - 1))} disabled={currentHole === 1}
                style={{ width: 44, height: 44, border: '1px solid var(--green-mid)', borderRadius: 'var(--radius)', background: 'var(--green-deep)', color: currentHole === 1 ? 'var(--gray-700)' : 'var(--cream)', fontSize: '1.4rem', cursor: currentHole === 1 ? 'default' : 'pointer' }}>
                ‹
              </button>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700, lineHeight: 1 }}>Hole {currentHole}</p>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--gray-500)', marginTop: 2 }}>
                  Par {holePar} · Hdcp #{currentHoleData?.handicap_rank || '–'}
                </p>
              </div>
              <button onClick={() => setCurrentHole(h => Math.min(18, h + 1))} disabled={currentHole === 18}
                style={{ width: 44, height: 44, border: '1px solid var(--green-mid)', borderRadius: 'var(--radius)', background: 'var(--green-deep)', color: currentHole === 18 ? 'var(--gray-700)' : 'var(--cream)', fontSize: '1.4rem', cursor: currentHole === 18 ? 'default' : 'pointer' }}>
                ›
              </button>
            </div>

            {/* Progress dots — 2 fixed rows: 1-9 top, 10-18 bottom */}
            <div style={{ marginBottom: 12 }}>
              {[holes.slice(0, 9), holes.slice(9, 18)].map((row, rowIdx) => (
                <div key={rowIdx} style={{ display: 'flex', gap: 3, justifyContent: 'center', marginBottom: rowIdx === 0 ? 3 : 0 }}>
                  {row.map(h => {
                    const anyScore = groupPlayers.some(m => scores[m.player_id]?.[String(h.hole_number)])
                    return (
                      <button key={h.hole_number} onClick={() => setCurrentHole(h.hole_number)}
                        style={{
                          width: 22, height: 22, borderRadius: '50%', border: 'none', cursor: 'pointer',
                          background: h.hole_number === currentHole ? 'var(--gold)'
                            : anyScore ? 'var(--green-light)' : 'var(--green-mid)',
                          fontSize: '0.62rem', fontFamily: 'var(--font-mono)',
                          color: h.hole_number === currentHole ? 'var(--green-deep)' : 'var(--cream)',
                          fontWeight: h.hole_number === currentHole ? 700 : 400,
                        }}>
                        {h.hole_number}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>

            <div style={{ height: '1px', background: 'var(--green-mid)', marginBottom: 12 }} />

            {/* Per-player score stepper — NO player selector tabs */}
            {groupPlayers.map((member, idx) => {
              const holeScore = scores[member.player_id]?.[String(currentHole)] ?? 4
              const diff = holeScore - holePar
              const diffTxt = diff === 0 ? 'E' : diff > 0 ? `+${diff}` : `${diff}`
              const diffColor = diff < 0 ? 'var(--blue-birdie)' : diff > 0 ? 'var(--red)' : 'var(--gray-500)'
              const playerTotal = Object.values(scores[member.player_id] || {}).reduce((a, v) => a + (parseInt(v) || 0), 0)
              const playerHoles = Object.keys(scores[member.player_id] || {}).filter(k => scores[member.player_id][k]).length
              const isMe = player?.id === member.player_id

              return (
                <div key={member.player_id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 0',
                  borderBottom: idx < groupPlayers.length - 1 ? '1px solid var(--green-mid)' : 'none',
                  background: isMe ? 'rgba(201,168,76,0.05)' : 'transparent',
                  margin: '0 -4px', padding: '10px 4px',
                }}>
                  {/* Name + running total */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: isMe ? 600 : 400, color: isMe ? 'var(--gold)' : 'var(--cream)', fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {member.name}
                    </div>
                    {playerHoles > 0 && (
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--gray-500)', marginTop: 1 }}>
                        {playerTotal} ({playerHoles}/18)
                      </div>
                    )}
                  </div>

                  {/* Decrease */}
                  <button onClick={() => adjustScore(member.player_id, currentHole, -1)}
                    style={{ width: 36, height: 36, border: '1px solid var(--green-mid)', borderRadius: 'var(--radius)', background: 'var(--green-deep)', color: 'var(--cream)', fontSize: '1.2rem', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    −
                  </button>

                  {/* Score */}
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.5rem', fontWeight: 700, minWidth: 28, textAlign: 'center', color: 'var(--cream)' }}>
                    {holeScore}
                  </span>

                  {/* Increase */}
                  <button onClick={() => adjustScore(member.player_id, currentHole, 1)}
                    style={{ width: 36, height: 36, border: '1px solid var(--green-mid)', borderRadius: 'var(--radius)', background: 'var(--green-deep)', color: 'var(--cream)', fontSize: '1.2rem', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    +
                  </button>

                  {/* +/– par */}
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 500, minWidth: 28, textAlign: 'right', color: diffColor, flexShrink: 0 }}>
                    {diffTxt}
                  </span>
                </div>
              )
            })}

            <div style={{ height: '1px', background: 'var(--green-mid)', margin: '8px 0 12px' }} />

            {/* Action row */}
            <div style={{ display: 'flex', gap: 8 }}>
              {currentHole < 18 && (
                <button className="btn btn-secondary" style={{ flex: 1 }}
                  onClick={() => setCurrentHole(h => h + 1)}>
                  Next →
                </button>
              )}
              <button className="btn btn-primary" style={{ flex: 1 }}
                onClick={handleSaveAll} disabled={saving}>
                {saving ? 'Saving...' : `Save All`}
              </button>
            </div>
          </div>
        )}

        {/* Group summary */}
        {groupPlayers.length > 1 && activeTab === 'manual' && (
          <div className="card card-sm" style={{ marginTop: 8 }}>
            <p className="text-xs text-muted text-mono" style={{ marginBottom: 8, textTransform: 'uppercase' }}>Group Summary</p>
            {groupPlayers.map(m => {
              const pts = scores[m.player_id] || {}
              const tot = calculateTotal(Object.fromEntries(Object.entries(pts).filter(([,v]) => v)))
              const h = Object.values(pts).filter(Boolean).length
              const isMe = player?.id === m.player_id
              return (
                <div key={m.player_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--green-mid)' }}>
                  <span style={{ fontWeight: isMe ? 600 : 400, color: isMe ? 'var(--gold)' : 'var(--cream)', fontSize: '0.875rem' }}>{m.name}</span>
                  <span className="text-mono text-sm">
                    {tot > 0 ? tot : '–'}
                    {h > 0 && h < 18 && <span className="text-muted" style={{ marginLeft: 4, fontSize: '0.7rem' }}>({h}/18)</span>}
                    {h >= 18 && <span style={{ marginLeft: 4, color: 'var(--green-bright)', fontSize: '0.7rem' }}>✓</span>}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  )
}
