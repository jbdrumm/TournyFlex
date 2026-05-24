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
  const [groupPlayers, setGroupPlayers] = useState([])  // all players in group
  const [scores, setScores] = useState({})              // { playerId: { "1": 4, "2": 5 } }
  const [activePlayerId, setActivePlayerId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [toast, setToast] = useState(null)
  const [activeTab, setActiveTab] = useState('manual')
  const [allEventPlayers, setAllEventPlayers] = useState([]) // for commissioner

  useEffect(() => { fetchSetup() }, [player])

  const fetchSetup = async () => {
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
      setAllEventPlayers(eps || [])
      // Commissioner starts with no group selected; they pick from dropdown
    } else if (player) {
      // Load the player's group
      const { data: group } = await db('get_player_group', { event_id: ev.id, day, player_id: player.id })
      if (group?.players?.length) {
        const members = group.players
        setGroupPlayers(members)
        setActivePlayerId(player.id)
        // Load existing scores for all group members
        await loadGroupScores(ev, members, day, course?.id)
      } else {
        // Not assigned to a group — just show own scorecard
        setGroupPlayers([{ player_id: player.id, name: player.name }])
        setActivePlayerId(player.id)
        await loadGroupScores(ev, [{ player_id: player.id }], day, course?.id)
      }
    }
  }

  const loadGroupScores = async (ev, members, day, courseId) => {
    if (!courseId) return
    const roundTime = 'morning'
    const newScores = {}
    await Promise.all(members.map(async m => {
      const { data: sc } = await db('get_player_round', {
        event_id: ev.id, player_id: m.player_id, day, round_time: roundTime
      })
      if (sc?.hole_scores) {
        newScores[m.player_id] = typeof sc.hole_scores === 'string' ? JSON.parse(sc.hole_scores) : sc.hole_scores
      } else {
        newScores[m.player_id] = {}
      }
    }))
    setScores(newScores)
  }

  const handleCommissionerGroupSelect = async (playerId) => {
    if (!event) return
    const roundInfo = getActiveRound(event.status)
    const day = roundInfo?.round?.split('_')[0]
    const course = getCourseForRound(event, day)

    const { data: group } = await db('get_player_group', { event_id: event.id, day, player_id: playerId })
    if (group?.players?.length) {
      setGroupPlayers(group.players)
      setActivePlayerId(playerId)
      await loadGroupScores(event, group.players, day, course?.id)
    } else {
      const p = allEventPlayers.find(ep => ep.player_id === playerId)
      setGroupPlayers(p ? [{ player_id: p.player_id, name: p.name }] : [])
      setActivePlayerId(playerId)
      await loadGroupScores(event, [{ player_id: playerId }], day, course?.id)
    }
  }

  const handleScoreChange = (playerId, holeNum, value) => {
    const num = value === '' ? undefined : Math.max(1, parseInt(value) || 1)
    setScores(s => ({ ...s, [playerId]: { ...s[playerId], [String(holeNum)]: num } }))
  }

  const handleSavePlayer = async (targetPlayerId) => {
    if (!event) return
    const roundInfo = getActiveRound(event.status)
    const day = roundInfo?.round?.split('_')[0]
    const course = getCourseForRound(event, day)
    if (!course?.id) return

    const holeScores = {}
    Object.entries(scores[targetPlayerId] || {}).forEach(([k, v]) => { if (v) holeScores[k] = parseInt(v) })
    const total = calculateTotal(holeScores)
    const holesCompleted = Object.keys(holeScores).length

    await db('upsert_round_score', {
      event_id: event.id, player_id: targetPlayerId, course_id: course.id,
      day, round_time: 'morning', is_scramble: false,
      hole_scores: holeScores, total_score: total,
      holes_completed: holesCompleted, is_complete: holesCompleted >= 18,
    })
    showToast(`Score saved!`, 'success')
  }

  const handleSaveAll = async () => {
    setSaving(true)
    for (const member of groupPlayers) {
      await handleSavePlayer(member.player_id)
    }
    setSaving(false)
    showToast(`All ${groupPlayers.length} scorecards saved! ✓`, 'success')
  }

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !activePlayerId) return
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
        setScores(s => ({ ...s, [activePlayerId]: parsed }))
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
      <p className="text-muted">No stroke play round active.</p>
      {roundInfo?.round?.includes('afternoon') && <p className="text-sm text-muted" style={{ marginTop: 8 }}>Scramble scores are entered via the Groups page.</p>}
    </div></div>
  )

  const activePlayerScores = scores[activePlayerId] || {}
  const totalScore = calculateTotal(Object.fromEntries(Object.entries(activePlayerScores).filter(([, v]) => v)))
  const scoreDiff = totalScore && course?.par ? totalScore - course.par : null

  return (
    <div className="page">
      <div className="container">
        <div className="page-header">
          <div className="eyebrow">{roundInfo?.label || 'Score Entry'}</div>
          <h1>Scorecard</h1>
          {course?.name && <p className="text-muted text-sm" style={{ marginTop: 4 }}>{course.name}{course.par ? ` · Par ${course.par}` : ''}</p>}
        </div>

        {/* Commissioner: pick player to look up group */}
        {isCommissioner && (
          <div className="card card-sm" style={{ marginBottom: 12 }}>
            <label>Select Player (loads their group)</label>
            <select className="input" value={activePlayerId || ''} onChange={e => e.target.value && handleCommissionerGroupSelect(e.target.value)}>
              <option value="">Choose player...</option>
              {allEventPlayers.map(p => <option key={p.player_id} value={p.player_id}>{p.name}</option>)}
            </select>
          </div>
        )}

        {/* Group member tabs */}
        {groupPlayers.length > 1 && (
          <div style={{ display: 'flex', gap: 4, marginBottom: 12, overflowX: 'auto' }}>
            {groupPlayers.map(p => {
              const playerTotal = calculateTotal(Object.fromEntries(Object.entries(scores[p.player_id] || {}).filter(([,v]) => v)))
              const isMe = player?.id === p.player_id
              return (
                <button key={p.player_id} onClick={() => setActivePlayerId(p.player_id)}
                  style={{
                    padding: '8px 12px', border: 'none', borderRadius: 'var(--radius)',
                    background: activePlayerId === p.player_id ? 'var(--gold)' : 'var(--green-dark)',
                    color: activePlayerId === p.player_id ? 'var(--green-deep)' : 'var(--gray-300)',
                    fontFamily: 'var(--font-body)', fontSize: '0.8rem', cursor: 'pointer',
                    fontWeight: activePlayerId === p.player_id ? 700 : 400,
                    whiteSpace: 'nowrap', flexShrink: 0,
                  }}>
                  {isMe ? `${p.name} (you)` : p.name}
                  {playerTotal > 0 && <span style={{ marginLeft: 6, fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{playerTotal}</span>}
                </button>
              )
            })}
          </div>
        )}

        {/* Tabs: manual / photo */}
        {activePlayerId && (
          <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--green-deep)', borderRadius: 'var(--radius)', padding: 4 }}>
            {['manual','photo'].map(t => (
              <button key={t} onClick={() => setActiveTab(t)} style={{ flex: 1, padding: 10, border: 'none', borderRadius: 6, background: activeTab === t ? 'var(--green-mid)' : 'transparent', color: activeTab === t ? 'var(--cream)' : 'var(--gray-500)', fontFamily: 'var(--font-body)', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer' }}>
                {t === 'manual' ? '📝 Hole by Hole' : '📸 Photo Upload'}
              </button>
            ))}
          </div>
        )}

        {activeTab === 'photo' && activePlayerId && (
          <div className="card" style={{ textAlign: 'center', marginBottom: 12 }}>
            <p style={{ marginBottom: 8, fontWeight: 500 }}>Upload scorecard for <span style={{ color: 'var(--gold)' }}>{groupPlayers.find(p => p.player_id === activePlayerId)?.name}</span></p>
            <p className="text-muted text-sm" style={{ marginBottom: 16 }}>Claude AI will parse the scores.</p>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handlePhoto} />
            <button className="btn btn-primary btn-full" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? 'Analyzing...' : '📸 Take / Choose Photo'}
            </button>
          </div>
        )}

        {/* Hole grid for active player */}
        {activePlayerId && holes.length > 0 && (
          <div className="card">
            <p className="text-xs" style={{ color: 'var(--gold)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', marginBottom: 10, letterSpacing: '0.05em' }}>
              Scoring: {groupPlayers.find(p => p.player_id === activePlayerId)?.name}
            </p>
            {[holes.slice(0,9), holes.slice(9,18)].map((nine, ni) => (
              <div key={ni}>
                <p className="text-xs text-muted text-mono" style={{ marginBottom: 8, textTransform: 'uppercase' }}>{ni === 0 ? 'Front Nine' : 'Back Nine'}</p>
                <div className="hole-grid">
                  {nine.map(h => (
                    <div key={h.hole_number} className="hole-input-wrap">
                      <span className="hole-num">{h.hole_number}</span>
                      <input type="number" min="1" max="15" className="hole-input"
                        value={activePlayerScores[String(h.hole_number)] || ''}
                        onChange={e => handleScoreChange(activePlayerId, h.hole_number, e.target.value)} />
                      <span style={{ fontSize: '0.55rem', color: 'var(--gray-500)' }}>p{h.par}</span>
                    </div>
                  ))}
                </div>
                {ni === 0 && <hr className="divider" />}
              </div>
            ))}
            <hr className="divider" />
            <div className="flex justify-between items-center" style={{ marginBottom: 12 }}>
              <div><span className="text-muted text-sm">Total: </span><span className="text-mono" style={{ fontSize: '1.4rem', fontWeight: 700 }}>{totalScore || '–'}</span></div>
              {scoreDiff !== null && <span className="text-mono" style={{ fontSize: '1.1rem', fontWeight: 600, color: scoreDiff > 0 ? 'var(--red)' : scoreDiff < 0 ? 'var(--blue-birdie)' : 'var(--cream)' }}>{scoreDiff > 0 ? `+${scoreDiff}` : scoreDiff === 0 ? 'E' : scoreDiff}</span>}
            </div>

            {/* Save buttons */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }}
                onClick={() => handleSavePlayer(activePlayerId)} disabled={saving || !totalScore}>
                Save {groupPlayers.find(p => p.player_id === activePlayerId)?.name?.split(' ')[0]}
              </button>
              {groupPlayers.length > 1 && (
                <button className="btn btn-primary" style={{ flex: 1 }}
                  onClick={handleSaveAll} disabled={saving}>
                  {saving ? 'Saving...' : `Save All (${groupPlayers.length})`}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Group overview — all players' totals at a glance */}
        {groupPlayers.length > 1 && (
          <div className="card card-sm" style={{ marginTop: 8 }}>
            <p className="text-xs text-muted text-mono" style={{ marginBottom: 10, textTransform: 'uppercase' }}>Group Summary</p>
            {groupPlayers.map(p => {
              const pts = scores[p.player_id] || {}
              const tot = calculateTotal(Object.fromEntries(Object.entries(pts).filter(([,v]) => v)))
              const holes = Object.values(pts).filter(Boolean).length
              const isMe = player?.id === p.player_id
              return (
                <div key={p.player_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--green-mid)' }}>
                  <span style={{ fontWeight: isMe ? 700 : 400, color: isMe ? 'var(--gold)' : 'var(--cream)' }}>{p.name}</span>
                  <span className="text-mono text-sm">
                    {tot > 0 ? tot : '–'}
                    {holes > 0 && holes < 18 && <span className="text-muted" style={{ marginLeft: 4, fontSize: '0.7rem' }}>({holes}/18)</span>}
                    {holes >= 18 && <span style={{ marginLeft: 4, color: 'var(--green-bright)', fontSize: '0.7rem' }}>✓</span>}
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
