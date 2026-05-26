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
  const [scoringFor, setScoringFor] = useState({})   // { playerId: bool } — who this user is keeping score for
  const [scores, setScores] = useState({})
  const [currentHole, setCurrentHole] = useState(1)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [toast, setToast] = useState(null)
  const [activeTab, setActiveTab] = useState('manual')
  const [showSubmitted, setShowSubmitted] = useState(false)

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
        setHoles((h || []).sort((a, b) => a.hole_number - b.hole_number))
      } else {
        setHoles(Array.from({length:18},(_,i)=>({hole_number:i+1,par:4,handicap_rank:i+1})))
      }

      if (player) {
        const { data: group } = await db('get_player_group', { event_id: ev.id, day, player_id: player.id })
        const members = group?.players?.length
          ? group.players
          : [{ player_id: player.id, name: player.name }]
        setGroupPlayers(members)

        // Default: only score for yourself
        const defaultScoring = {}
        members.forEach(m => { defaultScoring[m.player_id] = m.player_id === player.id })
        setScoringFor(defaultScoring)

        if (course?.id) await loadGroupScores(ev, members, day, course.id)
      }
    } catch (err) { console.error('Scorecard setup error:', err) }
  }

  const loadGroupScores = async (ev, members, day, courseId) => {
    const newScores = {}
    await Promise.all(members.map(async m => {
      const { data: sc } = await db('get_player_round', { event_id: ev.id, player_id: m.player_id, day, round_time: 'morning' })
      newScores[m.player_id] = sc?.hole_scores
        ? (typeof sc.hole_scores === 'string' ? JSON.parse(sc.hole_scores) : sc.hole_scores)
        : {}
    }))
    setScores(newScores)
  }

  const toggleScoring = (playerId) => {
    // Can't uncheck yourself
    if (playerId === player?.id) return
    setScoringFor(s => ({ ...s, [playerId]: !s[playerId] }))
  }

  const adjustScore = (playerId, holeNum, delta) => {
    if (!scoringFor[playerId]) return
    setScores(s => {
      const current = s[playerId]?.[String(holeNum)] ?? holePar
      const next = Math.max(1, Math.min(15, current + delta))
      return { ...s, [playerId]: { ...s[playerId], [String(holeNum)]: next } }
    })
  }

  const saveProgress = async (silent = false, overrideScores = null) => {
    if (!event || groupPlayers.length === 0) return
    const roundInfo = getActiveRound(event.status)
    const day = roundInfo?.round?.split('_')[0]
    const course = getCourseForRound(event, day)
    if (!course?.id) return

    const src = overrideScores || scores
    // Only save for players we're scoring for
    const toSave = groupPlayers.filter(m => scoringFor[m.player_id])
    for (const member of toSave) {
      const holeScores = {}
      Object.entries(src[member.player_id] || {}).forEach(([k, v]) => { if (v) holeScores[k] = parseInt(v) })
      const holesCompleted = Object.keys(holeScores).length
      if (holesCompleted === 0) continue
      const total = calculateTotal(holeScores)
      await db('upsert_round_score', {
        event_id: event.id, player_id: member.player_id, course_id: course.id,
        day, round_time: 'morning', is_scramble: false,
        hole_scores: holeScores, total_score: total,
        holes_completed: holesCompleted, is_complete: holesCompleted >= 18,
      })
    }
    if (!silent) showToast('Saved ✓', 'success')
  }

  const handleNextHole = async () => {
    setSaving(true)
    // Commit current hole's displayed score for all players being scored
    const committed = {}
    groupPlayers.forEach(member => {
      const existing = scores[member.player_id] || {}
      if (scoringFor[member.player_id]) {
        const holeVal = existing[String(currentHole)] ?? holePar
        committed[member.player_id] = { ...existing, [String(currentHole)]: holeVal }
      } else {
        committed[member.player_id] = existing
      }
    })
    await saveProgress(true, committed)
    setSaving(false)
    setScores(committed)
    setCurrentHole(h => Math.min(18, h + 1))
  }

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    showToast('Analyzing scorecard...', '')
    const base64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(file) })
    try {
      const res = await fetch('/.netlify/functions/parse-scorecard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: base64, mediaType: file.type, holeCount: holes.length }) })
      const data = await res.json()
      if (data.scores) {
        const target = groupPlayers.find(p => p.player_id === player?.id) || groupPlayers[0]
        const parsed = {}
        data.scores.forEach((s, i) => { if (s) parsed[String(i + 1)] = s })
        setScores(s => ({ ...s, [target.player_id]: parsed }))
        showToast(`Parsed ${Object.keys(parsed).length} holes — review & save`, 'success')
      } else showToast('Could not parse.', 'error')
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

  if (!event) return (
    <div className="page"><div className="container" style={{ textAlign: 'center', paddingTop: 60 }}>
      <p style={{ fontSize: '2rem', marginBottom: 16 }}>⛳</p>
      <p className="text-muted">No active event.</p>
    </div></div>
  )

  // Afternoon scramble — show team score entry
  const isScramble = roundInfo?.round?.includes('afternoon') || roundInfo?.round === 'sunday_morning'
  if (isScramble && player) {
    return <ScrambleScoreEntry event={event} roundInfo={roundInfo} player={player} />
  }

  if (!isStrokePlay) return (
    <div className="page"><div className="container" style={{ textAlign: 'center', paddingTop: 60 }}>
      <p style={{ fontSize: '2rem', marginBottom: 16 }}>⛳</p>
      <p className="text-muted">No active round.</p>
    </div></div>
  )

  const activeScoring = groupPlayers.filter(m => scoringFor[m.player_id])

  return (
    <div className="page">
      <div className="container">
        {/* Header */}
        <div style={{ paddingTop: 20, paddingBottom: 12, borderBottom: '1px solid var(--green-mid)', marginBottom: 12 }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--gold)', marginBottom: 2 }}>{roundInfo?.label}</p>
          <h1 style={{ fontSize: '1.6rem' }}>Scorecard</h1>
          {course?.name && <p className="text-muted text-sm" style={{ marginTop: 2 }}>{course.name}{course.par ? ` · Par ${course.par}` : ''}</p>}
        </div>

        {/* Commissioner photo tab */}
        {isCommissioner && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 8, background: 'var(--green-deep)', borderRadius: 'var(--radius)', padding: 3 }}>
              {['manual','photo'].map(t => (
                <button key={t} onClick={() => setActiveTab(t)} style={{ flex: 1, padding: '8px', border: 'none', borderRadius: 5, background: activeTab === t ? 'var(--green-mid)' : 'transparent', color: activeTab === t ? 'var(--cream)' : 'var(--gray-500)', fontFamily: 'var(--font-body)', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer' }}>
                  {t === 'manual' ? '📝 Hole by Hole' : '📸 Photo Upload'}
                </button>
              ))}
            </div>
            {activeTab === 'photo' && (
              <div className="card" style={{ textAlign: 'center', marginBottom: 12 }}>
                <p style={{ marginBottom: 8, fontWeight: 500 }}>Upload group scorecard</p>
                <p className="text-muted text-sm" style={{ marginBottom: 16 }}>Claude AI will parse scores for all players.</p>
                <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handlePhoto} />
                <button className="btn btn-primary btn-full" onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? 'Analyzing...' : '📸 Take / Choose Photo'}</button>
              </div>
            )}
          </div>
        )}

        {/* Hole-by-hole entry */}
        {(activeTab === 'manual' || !isCommissioner) && holes.length > 0 && groupPlayers.length > 0 && (
          <div className="card">
            {/* Hole selector */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <button onClick={() => setCurrentHole(h => Math.max(1, h - 1))} disabled={currentHole === 1}
                style={{ width: 44, height: 44, border: '1px solid var(--green-mid)', borderRadius: 'var(--radius)', background: 'var(--green-deep)', color: currentHole === 1 ? 'var(--gray-700)' : 'var(--cream)', fontSize: '1.4rem', cursor: currentHole === 1 ? 'default' : 'pointer' }}>‹</button>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700, lineHeight: 1 }}>Hole {currentHole}</p>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--gray-500)', marginTop: 2 }}>
                  Par {holePar} · Hdcp #{currentHoleData?.handicap_rank || '–'}
                </p>
                {currentHoleData && (currentHoleData.yardage_black || currentHoleData.yardage_blue || currentHoleData.yardage_white || currentHoleData.yardage_red) && (
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--gray-600)', marginTop: 1 }}>
                    {[
                      currentHoleData.yardage_black && `⬛ ${currentHoleData.yardage_black}`,
                      currentHoleData.yardage_blue  && `🔵 ${currentHoleData.yardage_blue}`,
                      currentHoleData.yardage_white && `⚪ ${currentHoleData.yardage_white}`,
                      currentHoleData.yardage_red   && `🔴 ${currentHoleData.yardage_red}`,
                    ].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
              <button onClick={() => setCurrentHole(h => Math.min(18, h + 1))} disabled={currentHole === 18}
                style={{ width: 44, height: 44, border: '1px solid var(--green-mid)', borderRadius: 'var(--radius)', background: 'var(--green-deep)', color: currentHole === 18 ? 'var(--gray-700)' : 'var(--cream)', fontSize: '1.4rem', cursor: currentHole === 18 ? 'default' : 'pointer' }}>›</button>
            </div>

            {/* Progress dots — 2 rows */}
            <div style={{ marginBottom: 12 }}>
              {[holes.slice(0,9), holes.slice(9,18)].map((row, rowIdx) => (
                <div key={rowIdx} style={{ display: 'flex', gap: 3, justifyContent: 'center', marginBottom: rowIdx === 0 ? 3 : 0 }}>
                  {row.map(h => {
                    const anyScore = groupPlayers.some(m => scoringFor[m.player_id] && scores[m.player_id]?.[String(h.hole_number)])
                    return (
                      <button key={h.hole_number} onClick={() => setCurrentHole(h.hole_number)}
                        style={{ width: 22, height: 22, borderRadius: '50%', border: 'none', cursor: 'pointer', background: h.hole_number === currentHole ? 'var(--gold)' : anyScore ? 'var(--green-light)' : 'var(--green-mid)', fontSize: '0.62rem', fontFamily: 'var(--font-mono)', color: h.hole_number === currentHole ? 'var(--green-deep)' : 'var(--cream)', fontWeight: h.hole_number === currentHole ? 700 : 400 }}>
                        {h.hole_number}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>

            <div style={{ height: 1, background: 'var(--green-mid)', marginBottom: 10 }} />

            {/* Per-player rows */}
            {groupPlayers.map((member, idx) => {
              const isMe = player?.id === member.player_id
              const isScoring = scoringFor[member.player_id]
              const holeScore = scores[member.player_id]?.[String(currentHole)] ?? holePar
              const diff = holeScore - holePar
              const diffTxt = diff === 0 ? 'E' : diff > 0 ? `+${diff}` : `${diff}`
              const diffColor = diff < 0 ? 'var(--blue-birdie)' : diff > 0 ? 'var(--red)' : 'var(--gray-500)'

              return (
                <div key={member.player_id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 4px',
                  borderBottom: idx < groupPlayers.length - 1 ? '1px solid var(--green-mid)' : 'none',
                  opacity: isScoring ? 1 : 0.4,
                  transition: 'opacity 0.15s',
                }}>
                  {/* Checkbox — can't uncheck yourself */}
                  <button onClick={() => toggleScoring(member.player_id)}
                    disabled={isMe}
                    style={{ width: 20, height: 20, borderRadius: 4, flexShrink: 0, background: isScoring ? 'var(--gold)' : 'transparent', border: `2px solid ${isScoring ? 'var(--gold)' : 'var(--green-mid)'}`, cursor: isMe ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', color: 'var(--green-deep)' }}>
                    {isScoring ? '✓' : ''}
                  </button>

                  {/* Name */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: isMe ? 600 : 400, color: isMe ? 'var(--gold)' : 'var(--cream)', fontSize: '0.9rem' }}>{member.name}</span>
                  </div>

                  {/* Steppers — hidden when not scoring */}
                  {isScoring ? (
                    <>
                      <button onClick={() => adjustScore(member.player_id, currentHole, -1)}
                        style={{ width: 36, height: 36, border: '1px solid var(--green-mid)', borderRadius: 'var(--radius)', background: 'var(--green-deep)', color: 'var(--cream)', fontSize: '1.2rem', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.5rem', fontWeight: 700, minWidth: 28, textAlign: 'center' }}>{holeScore}</span>
                      <button onClick={() => adjustScore(member.player_id, currentHole, 1)}
                        style={{ width: 36, height: 36, border: '1px solid var(--green-mid)', borderRadius: 'var(--radius)', background: 'var(--green-deep)', color: 'var(--cream)', fontSize: '1.2rem', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 500, minWidth: 28, textAlign: 'right', color: diffColor, flexShrink: 0 }}>{diffTxt}</span>
                    </>
                  ) : (
                    <span className="text-xs text-muted" style={{ fontFamily: 'var(--font-mono)' }}>not scoring</span>
                  )}
                </div>
              )
            })}

            <div style={{ height: 1, background: 'var(--green-mid)', margin: '8px 0 12px' }} />

            {/* Action row */}
            <div style={{ display: 'flex', gap: 8 }}>
              {currentHole < 18 ? (
                <button className="btn btn-primary btn-full" onClick={handleNextHole} disabled={saving}>
                  {saving ? 'Saving...' : 'Save & Next →'}
                </button>
              ) : (
                <button className="btn btn-primary btn-full" onClick={() => saveProgress(false)} disabled={saving}>
                  {saving ? 'Saving...' : 'Save Hole 18 ✓'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Group summary — total score and +/– only */}
        {groupPlayers.length > 1 && (
          <div className="card card-sm" style={{ marginTop: 8 }}>
            <p className="text-xs text-muted text-mono" style={{ marginBottom: 8, textTransform: 'uppercase' }}>Group Summary</p>
            {groupPlayers.map(m => {
              const pts = scores[m.player_id] || {}
              const tot = calculateTotal(Object.fromEntries(Object.entries(pts).filter(([,v]) => v)))
              const isMe = player?.id === m.player_id
              // Calculate +/- as sum of (score - par) for each scored hole
              // so it's accurate mid-round, not vs total course par
              let diff = null
              if (tot > 0 && holes.length > 0) {
                diff = Object.entries(pts)
                  .filter(([, v]) => v)
                  .reduce((sum, [holeNum, score]) => {
                    const holeData = holes.find(h => h.hole_number === parseInt(holeNum))
                    return sum + (parseInt(score) - (holeData?.par || 4))
                  }, 0)
              }
              const diffTxt = diff === null ? '–' : diff === 0 ? 'E' : diff > 0 ? `+${diff}` : `${diff}`
              const diffColor = diff < 0 ? 'var(--blue-birdie)' : diff > 0 ? 'var(--red)' : 'var(--gray-300)'
              return (
                <div key={m.player_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--green-mid)' }}>
                  <span style={{ fontWeight: isMe ? 600 : 400, color: isMe ? 'var(--gold)' : 'var(--cream)', fontSize: '0.875rem' }}>{m.name}</span>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.95rem' }}>{tot || '–'}</span>
                    {tot > 0 && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: diffColor }}>{diffTxt}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      {/* Round submitted modal */}
      {showSubmitted && (
        <SubmittedModal onDone={() => { setShowSubmitted(false); navigate('/leaderboard') }} />
      )}
    </div>
  )
}

function SubmittedModal({ onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 4000)
    return () => clearTimeout(t)
  }, [])
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--green-dark)', border: '1px solid var(--gold)', borderRadius: 'var(--radius-lg)', padding: '40px 32px', textAlign: 'center', maxWidth: 280, margin: '0 16px' }}>
        <div style={{ fontSize: '3rem', marginBottom: 12 }}>🏌️</div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', marginBottom: 8, color: 'var(--gold)' }}>Round Submitted!</h2>
        <p className="text-muted text-sm" style={{ marginBottom: 20 }}>Your scorecard has been saved.</p>
        <div style={{ width: '100%', height: 4, background: 'var(--green-mid)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: 'var(--gold)', borderRadius: 2, animation: 'drain 4s linear forwards' }} />
        </div>
        <p className="text-xs text-muted" style={{ marginTop: 8 }}>Taking you to the leaderboard...</p>
        <style>{`@keyframes drain { from { width: 100% } to { width: 0% } }`}</style>
      </div>
    </div>
  )
}

// ── SCRAMBLE SCORE ENTRY ─────────────────────────────────────────────────────
function ScrambleScoreEntry({ event, roundInfo, player }) {
  const [team, setTeam] = useState(null)
  const [score, setScore] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [toast, setToast] = useState(null)

  const day = roundInfo?.round?.split('_')[0]
  const round_time = roundInfo?.round?.includes('afternoon') ? 'afternoon' : 'morning'

  useEffect(() => { fetchTeam() }, [player, event])

  const fetchTeam = async () => {
    if (!player || !event) return
    const { data: group } = await db('get_player_group', {
      event_id: event.id, day, player_id: player.id
    })
    if (!group) return

    // Find scramble team for this player
    const { data: teams } = await db('get_scramble_teams', {
      event_id: event.id,
      round: roundInfo?.round
    })
    if (!teams?.length) return

    const myTeam = teams.find(t => {
      const pids = typeof t.player_ids === 'string' ? JSON.parse(t.player_ids) : t.player_ids
      return pids.includes(player.id)
    })
    if (!myTeam) return

    // Enrich team with player names from event_players
    const { data: eventPlayers } = await db('get_players_for_event', { event_id: event.id })
    const nameMap = {}
    eventPlayers?.forEach(ep => { nameMap[ep.player_id] = ep.name })
    const pids = typeof myTeam.player_ids === 'string' ? JSON.parse(myTeam.player_ids) : myTeam.player_ids
    setTeam({ ...myTeam, member_names: pids.map(pid => nameMap[pid] || pid) })

    // Load existing score
    const { data: sc } = await db('get_player_round', {
      event_id: event.id, player_id: player.id, day, round_time
    })
    if (sc?.score != null) setScore(sc.score)
  }

  const handleSave = async () => {
    if (score === null || !team || !event) return
    setSaving(true)
    const pids = typeof team.player_ids === 'string' ? JSON.parse(team.player_ids) : team.player_ids
    const courseId = day === 'friday' ? event.friday_course_id : day === 'saturday' ? event.saturday_course_id : event.sunday_course_id
    await db('save_scramble_score', {
      event_id: event.id, course_id: courseId,
      day, round_time, player_ids: pids, score
    })
    setSaving(false)
    setSaved(true)
    setToast({ msg: 'Team score saved! ✓', type: 'success' })
    setTimeout(() => setToast(null), 3000)
  }

  const pids = team ? (typeof team.player_ids === 'string' ? JSON.parse(team.player_ids) : team.player_ids) : []

  return (
    <div className="page">
      <div className="container">
        <div style={{ paddingTop: 20, paddingBottom: 12, borderBottom: '1px solid var(--green-mid)', marginBottom: 16 }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--gold)', marginBottom: 2 }}>{roundInfo?.label}</p>
          <h1 style={{ fontSize: '1.6rem' }}>Scramble Score</h1>
        </div>

        {!team ? (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <p style={{ fontSize: '2rem', marginBottom: 8 }}>⏳</p>
            <p className="text-muted">No scramble team assigned yet.</p>
            <p className="text-xs text-muted" style={{ marginTop: 8 }}>Check the Groups tab for your team.</p>
          </div>
        ) : (
          <div className="card">
            <p className="text-xs text-muted text-mono" style={{ marginBottom: 10, textTransform: 'uppercase' }}>
              Team {team.team_number}
            </p>

            {/* Team member list — single compact line */}
            <div style={{ marginBottom: 20, padding: '10px 12px', background: 'var(--green-deep)', borderRadius: 'var(--radius)', lineHeight: 1.6 }}>
              {(team.member_names || []).map((name, i) => (
                <span key={i} style={{ fontSize: '0.875rem', color: name === player.name ? 'var(--gold)' : 'var(--cream)', fontWeight: name === player.name ? 600 : 400 }}>
                  {i > 0 && <span style={{ color: 'var(--gray-500)', margin: '0 6px' }}>·</span>}
                  {name}
                </span>
              ))}
            </div>

            <p className="text-xs text-muted text-mono" style={{ marginBottom: 12, textTransform: 'uppercase' }}>Team Score (over/under par)</p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, marginBottom: 24 }}>
              <button onClick={() => setScore(s => (s ?? 0) - 1)}
                style={{ width: 52, height: 52, border: '1px solid var(--green-mid)', borderRadius: 'var(--radius)', background: 'var(--green-deep)', color: 'var(--cream)', fontSize: '1.6rem', cursor: 'pointer' }}>−</button>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '2.2rem', fontWeight: 700, minWidth: 60, textAlign: 'center',
                color: score === null ? 'var(--gray-500)' : score < 0 ? 'var(--blue-birdie)' : score > 0 ? 'var(--red)' : 'var(--cream)' }}>
                {score === null ? '–' : score > 0 ? `+${score}` : score}
              </span>
              <button onClick={() => setScore(s => (s ?? 0) + 1)}
                style={{ width: 52, height: 52, border: '1px solid var(--green-mid)', borderRadius: 'var(--radius)', background: 'var(--green-deep)', color: 'var(--cream)', fontSize: '1.6rem', cursor: 'pointer' }}>+</button>
            </div>

            <button className="btn btn-primary btn-full" onClick={handleSave} disabled={saving || score === null}>
              {saving ? 'Saving...' : saved ? 'Score Saved ✓' : 'Save Team Score'}
            </button>
          </div>
        )}
      </div>
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      {/* Round submitted modal */}
      {showSubmitted && (
        <SubmittedModal onDone={() => { setShowSubmitted(false); navigate('/leaderboard') }} />
      )}
    </div>
  )
}
